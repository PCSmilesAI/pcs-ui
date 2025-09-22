import { qboClient } from './qboClient';
import { tokenStorage } from './tokenStorage';

class TokenRefreshService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Start automatic token refresh every 30 minutes
  start() {
    if (this.isRunning) {
      console.log('🔄 Token refresh service already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting QBO token refresh service (every 30 minutes)');

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
    console.log('🛑 QBO token refresh service stopped');
  }

  private async refreshTokensIfNeeded() {
    try {
      const tokens = await tokenStorage.getLatestTokens();
      if (!tokens) {
        console.log('🔍 No QBO tokens found, skipping refresh');
        return;
      }

      // Check if token expires in next 10 minutes
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = tokens.expiresAt - now;
      
      if (expiresIn <= 600) { // 10 minutes
        console.log(`🔄 QBO token expires in ${Math.floor(expiresIn / 60)} minutes, refreshing...`);
        
        // Initialize and refresh through qboClient
        await qboClient.initialize();
        await qboClient.ensureValidToken(); // This will trigger refresh if needed
        
        console.log('✅ Background token refresh completed');
      } else {
        console.log(`✅ QBO token still valid for ${Math.floor(expiresIn / 60)} minutes`);
      }
    } catch (error) {
      console.error('❌ Background token refresh failed:', error);
      // Don't throw - just log the error and continue
    }
  }

  // Manual refresh trigger
  async forceRefresh() {
    console.log('🔄 Manual token refresh triggered');
    await this.refreshTokensIfNeeded();
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


