import { qboClient } from './qboClient';
import { tokenStorage, QBOTokens } from './tokenStorage';
import fs from 'fs';
import path from 'path';

// Token backup file path
const BACKUP_PATH = path.resolve(process.cwd(), 'pcs_ai_data/qbo_tokens_backup.json');

// Detailed logging with timestamps
function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const prefix = {
    'INFO': '✅',
    'WARN': '⚠️',
    'ERROR': '❌',
    'DEBUG': '🔍',
  }[level];
  
  const logMessage = `[${timestamp}] [QBO_TOKEN] ${prefix} ${message}`;
  
  if (data) {
    console.log(logMessage, JSON.stringify(data, null, 2));
  } else {
    console.log(logMessage);
  }
}

// Backup current token before refresh
async function backupToken(token: QBOTokens): Promise<boolean> {
  try {
    const backupData = {
      ...token,
      backedUpAt: new Date().toISOString(),
      reason: 'pre-refresh-backup',
    };
    
    fs.mkdirSync(path.dirname(BACKUP_PATH), { recursive: true });
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(backupData, null, 2), 'utf8');
    
    log('DEBUG', 'Token backed up successfully', {
      realmId: token.realmId,
      expiresAt: new Date(token.expiresAt * 1000).toISOString(),
    });
    
    return true;
  } catch (error: any) {
    log('WARN', 'Failed to backup token', { error: error.message });
    return false;
  }
}

// Restore token from backup
async function restoreTokenFromBackup(): Promise<QBOTokens | null> {
  try {
    if (!fs.existsSync(BACKUP_PATH)) {
      log('DEBUG', 'No backup file found to restore');
      return null;
    }
    
    const raw = fs.readFileSync(BACKUP_PATH, 'utf8');
    const backup = JSON.parse(raw);
    
    if (!backup.accessToken || !backup.refreshToken || !backup.realmId) {
      log('WARN', 'Backup file is incomplete or corrupted');
      return null;
    }
    
    log('INFO', 'Restoring token from backup', {
      realmId: backup.realmId,
      backedUpAt: backup.backedUpAt,
    });
    
    // Save restored token to main storage
    await tokenStorage.saveTokens({
      realmId: backup.realmId,
      accessToken: backup.accessToken,
      refreshToken: backup.refreshToken,
      expiresIn: backup.expiresIn || 3600,
    });
    
    return {
      realmId: backup.realmId,
      accessToken: backup.accessToken,
      refreshToken: backup.refreshToken,
      expiresIn: backup.expiresIn || 3600,
      expiresAt: backup.expiresAt,
    };
  } catch (error: any) {
    log('ERROR', 'Failed to restore token from backup', { error: error.message });
    return null;
  }
}

// Track refresh statistics
let refreshStats = {
  lastRefreshAttempt: null as string | null,
  lastSuccessfulRefresh: null as string | null,
  consecutiveFailures: 0,
  totalRefreshes: 0,
  totalFailures: 0,
};

class TokenRefreshService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  getStats() {
    return { ...refreshStats };
  }

  // Start automatic token refresh every 30 minutes
  start() {
    if (this.isRunning) {
      log('INFO', 'Token refresh service already running');
      return;
    }

    this.isRunning = true;
    log('INFO', 'Starting QBO token refresh service (every 30 minutes)');

    // Run immediately on start
    this.refreshTokensIfNeeded();

    // Then run every 30 minutes
    this.intervalId = setInterval(() => {
      this.refreshTokensIfNeeded();
    }, 30 * 60 * 1000); // 30 minutes
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    log('INFO', 'QBO token refresh service stopped');
  }

  private async refreshTokensIfNeeded() {
    const attemptTime = new Date().toISOString();
    refreshStats.lastRefreshAttempt = attemptTime;
    
    try {
      const tokens = await tokenStorage.getLatestTokens();
      
      if (!tokens) {
        log('WARN', 'No QBO tokens found, skipping refresh');
        return;
      }

      // Log current token status
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = tokens.expiresAt - now;
      const expiresAt = new Date(tokens.expiresAt * 1000).toISOString();
      
      log('DEBUG', 'Token status check', {
        realmId: tokens.realmId,
        expiresAt,
        expiresInMinutes: Math.floor(expiresIn / 60),
        hasRefreshToken: !!tokens.refreshToken,
        refreshTokenLength: tokens.refreshToken?.length || 0,
      });
      
      // Check if token expires in next 10 minutes
      if (expiresIn <= 600) { // 10 minutes
        log('INFO', `Token expires in ${Math.floor(expiresIn / 60)} minutes, initiating refresh...`);
        
        // BACKUP TOKEN BEFORE REFRESH
        await backupToken(tokens);
        
        try {
          // Initialize and refresh through qboClient
          await qboClient.initialize();
          await qboClient.ensureValidToken(); // This will trigger refresh if needed
          
          // Verify the new token was saved
          const newTokens = await tokenStorage.getLatestTokens();
          if (newTokens && newTokens.accessToken !== tokens.accessToken) {
            log('INFO', 'Token refresh completed successfully', {
              newExpiresAt: new Date(newTokens.expiresAt * 1000).toISOString(),
              newExpiresInMinutes: Math.floor((newTokens.expiresAt - now) / 60),
            });
            
            refreshStats.lastSuccessfulRefresh = attemptTime;
            refreshStats.consecutiveFailures = 0;
            refreshStats.totalRefreshes++;
          } else if (newTokens) {
            log('WARN', 'Token refresh completed but access token unchanged');
          } else {
            throw new Error('New tokens not found after refresh');
          }
        } catch (refreshError: any) {
          log('ERROR', 'Token refresh failed', {
            error: refreshError.message,
            stack: refreshError.stack?.split('\n').slice(0, 3),
          });
          
          refreshStats.consecutiveFailures++;
          refreshStats.totalFailures++;
          
          // If refresh failed and we have a backup, try to restore it
          if (refreshStats.consecutiveFailures >= 2) {
            log('WARN', 'Multiple consecutive failures, attempting to restore from backup');
            await restoreTokenFromBackup();
          }
          
          throw refreshError;
        }
      } else {
        log('DEBUG', `Token still valid for ${Math.floor(expiresIn / 60)} minutes, no refresh needed`);
      }
    } catch (error: any) {
      log('ERROR', 'Background token refresh check failed', { 
        error: error.message,
        consecutiveFailures: refreshStats.consecutiveFailures,
      });
      // Don't throw - just log the error and continue
    }
  }

  // Manual refresh trigger with detailed logging
  async forceRefresh(): Promise<{ success: boolean; error?: string; stats: typeof refreshStats }> {
    log('INFO', 'Manual token refresh triggered');
    
    try {
      const tokens = await tokenStorage.getLatestTokens();
      
      if (!tokens) {
        return { success: false, error: 'No tokens found to refresh', stats: refreshStats };
      }
      
      // Backup before forced refresh
      await backupToken(tokens);
      
      // Force refresh regardless of expiry
      await qboClient.initialize();
      
      // Manually trigger the refresh
      const now = Math.floor(Date.now() / 1000);
      if (tokens.expiresAt > now) {
        log('INFO', 'Token not expired, forcing refresh anyway');
      }
      
      await qboClient.ensureValidToken();
      
      const newTokens = await tokenStorage.getLatestTokens();
      
      if (newTokens) {
        refreshStats.lastSuccessfulRefresh = new Date().toISOString();
        refreshStats.consecutiveFailures = 0;
        refreshStats.totalRefreshes++;
        
        log('INFO', 'Manual refresh completed successfully', {
          newExpiresAt: new Date(newTokens.expiresAt * 1000).toISOString(),
        });
        
        return { success: true, stats: refreshStats };
      }
      
      return { success: false, error: 'Token not saved after refresh', stats: refreshStats };
    } catch (error: any) {
      refreshStats.consecutiveFailures++;
      refreshStats.totalFailures++;
      
      log('ERROR', 'Manual refresh failed', { error: error.message });
      
      return { success: false, error: error.message, stats: refreshStats };
    }
  }

  // Health check method
  async checkHealth(): Promise<{
    healthy: boolean;
    tokenExists: boolean;
    tokenExpired: boolean;
    expiresInMinutes: number | null;
    lastRefresh: string | null;
    consecutiveFailures: number;
    message: string;
  }> {
    try {
      const tokens = await tokenStorage.getLatestTokens();
      
      if (!tokens) {
        return {
          healthy: false,
          tokenExists: false,
          tokenExpired: true,
          expiresInMinutes: null,
          lastRefresh: refreshStats.lastSuccessfulRefresh,
          consecutiveFailures: refreshStats.consecutiveFailures,
          message: 'No QBO tokens found. Please authenticate at /api/qbo/auth',
        };
      }
      
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = tokens.expiresAt - now;
      const expiresInMinutes = Math.floor(expiresIn / 60);
      const isExpired = expiresIn <= 0;
      const isExpiringSoon = expiresIn <= 600; // 10 minutes
      
      let healthy = !isExpired && refreshStats.consecutiveFailures < 3;
      let message = '';
      
      if (isExpired) {
        message = 'Token has expired. Attempting refresh...';
        healthy = false;
      } else if (isExpiringSoon) {
        message = `Token expires in ${expiresInMinutes} minutes. Will auto-refresh soon.`;
      } else {
        message = `Token valid for ${expiresInMinutes} minutes.`;
      }
      
      if (refreshStats.consecutiveFailures > 0) {
        message += ` Warning: ${refreshStats.consecutiveFailures} consecutive refresh failures.`;
      }
      
      return {
        healthy,
        tokenExists: true,
        tokenExpired: isExpired,
        expiresInMinutes,
        lastRefresh: refreshStats.lastSuccessfulRefresh,
        consecutiveFailures: refreshStats.consecutiveFailures,
        message,
      };
    } catch (error: any) {
      return {
        healthy: false,
        tokenExists: false,
        tokenExpired: true,
        expiresInMinutes: null,
        lastRefresh: refreshStats.lastSuccessfulRefresh,
        consecutiveFailures: refreshStats.consecutiveFailures,
        message: `Health check error: ${error.message}`,
      };
    }
  }
}

// Export singleton instance
export const tokenRefreshService = new TokenRefreshService();

// Auto-start in production
if (process.env.NODE_ENV === 'production') {
  // Start after a short delay to ensure app is fully initialized
  setTimeout(() => {
    tokenRefreshService.start();
  }, 5000);
}
