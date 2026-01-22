/**
 * QuickBooks Online Health Check
 *
 * Verifies QBO integration is properly configured and operational.
 * Query params:
 * - ?autoRefresh=true - Auto-refresh if token expiring soon
 * - ?forceRefresh=true - Force refresh regardless of expiry
 */

import { NextRequest, NextResponse } from 'next/server';
import { tokenStorage } from '../../../../lib/qbo/tokenStorage';
import { tokenRefreshService } from '../../../../lib/qbo/tokenRefreshService';
import { qboClient } from '../../../../lib/qbo/qboClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface QBOHealthStatus {
  ok: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'refreshing';
  config: {
    client_id_set: boolean;
    client_secret_set: boolean;
    redirect_uri_set: boolean;
    redirect_uri_value?: string;
    mode: 'sandbox' | 'production' | 'unknown';
  };
  tokens: {
    available: boolean;
    expired: boolean;
    expires_at?: string;
    expires_in_minutes?: number;
    has_refresh_token: boolean;
  };
  refreshService: {
    lastRefreshAttempt: string | null;
    lastSuccessfulRefresh: string | null;
    consecutiveFailures: number;
    totalRefreshes: number;
    totalFailures: number;
  };
  autoRefresh?: {
    attempted: boolean;
    success: boolean;
    error?: string;
    newExpiresAt?: string;
  };
  errors: string[];
  warnings: string[];
  timestamp: string;
}

export async function GET(req: NextRequest) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const autoRefreshParam = req.nextUrl.searchParams.get('autoRefresh') === 'true';
  const forceRefreshParam = req.nextUrl.searchParams.get('forceRefresh') === 'true';
  
  const refreshStats = tokenRefreshService.getStats();
  
  const health: QBOHealthStatus = {
    ok: false,
    status: 'unhealthy',
    config: {
      client_id_set: false,
      client_secret_set: false,
      redirect_uri_set: false,
      mode: 'unknown',
    },
    tokens: {
      available: false,
      expired: true,
      has_refresh_token: false,
    },
    refreshService: {
      lastRefreshAttempt: refreshStats.lastRefreshAttempt,
      lastSuccessfulRefresh: refreshStats.lastSuccessfulRefresh,
      consecutiveFailures: refreshStats.consecutiveFailures,
      totalRefreshes: refreshStats.totalRefreshes,
      totalFailures: refreshStats.totalFailures,
    },
    errors,
    warnings,
    timestamp: new Date().toISOString(),
  };

  // 1. Check environment variables
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const redirectUri = process.env.QBO_REDIRECT_URI;
  const qboEnv = process.env.QBO_ENVIRONMENT || process.env.QBO_ENV || 'sandbox';

  health.config.client_id_set = !!clientId;
  health.config.client_secret_set = !!clientSecret;
  health.config.redirect_uri_set = !!redirectUri;
  health.config.redirect_uri_value = redirectUri;
  health.config.mode = (qboEnv === 'production' ? 'production' : 'sandbox') as 'sandbox' | 'production';

  if (!clientId) errors.push('QBO_CLIENT_ID not set');
  if (!clientSecret) errors.push('QBO_CLIENT_SECRET not set');
  if (!redirectUri) errors.push('QBO_REDIRECT_URI not set');

  // 2. Validate redirect URI format
  if (redirectUri) {
    try {
      const url = new URL(redirectUri);
      if (!url.protocol.startsWith('http')) {
        errors.push('QBO_REDIRECT_URI must use http or https');
      }
    } catch (e) {
      errors.push('QBO_REDIRECT_URI is not a valid URL');
    }
  }

  // 3. Check token availability and status
  let tokens: Awaited<ReturnType<typeof tokenStorage.getLatestTokens>> = null;
  try {
    tokens = await tokenStorage.getLatestTokens();

    if (tokens) {
      health.tokens.available = true;
      health.tokens.has_refresh_token = !!tokens.refreshToken;
      
      if (tokens.expiresAt) {
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = tokens.expiresAt - now;
        
        health.tokens.expires_at = new Date(tokens.expiresAt * 1000).toISOString();
        health.tokens.expires_in_minutes = Math.floor(expiresIn / 60);
        health.tokens.expired = expiresIn <= 0;

        if (expiresIn <= 0) {
          errors.push('QBO access token has expired');
        } else if (expiresIn <= 300) {
          warnings.push(`Token expires in ${Math.floor(expiresIn / 60)} minutes - refresh soon`);
        } else if (expiresIn <= 600) {
          warnings.push(`Token expires in ${Math.floor(expiresIn / 60)} minutes`);
        }
        
        if (!tokens.refreshToken) {
          errors.push('No refresh token - will need re-auth when access token expires');
        }
      }
    } else {
      errors.push('No QBO tokens - please authenticate at /api/qbo/auth');
    }
  } catch (err: any) {
    console.error('[QBO_HEALTH] Token check error:', err?.message);
    errors.push('Token check failed');
  }

  // 4. Check refresh service health
  if (refreshStats.consecutiveFailures >= 3) {
    errors.push(`Token refresh has ${refreshStats.consecutiveFailures} consecutive failures`);
  } else if (refreshStats.consecutiveFailures > 0) {
    warnings.push(`Token refresh has ${refreshStats.consecutiveFailures} failure(s)`);
  }

  // 5. Auto-refresh if requested
  if ((autoRefreshParam || forceRefreshParam) && tokens && tokens.refreshToken) {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = tokens.expiresAt - now;
    const shouldRefresh = forceRefreshParam || expiresIn <= 600;
    
    if (shouldRefresh) {
      health.status = 'refreshing';
      health.autoRefresh = { attempted: true, success: false };
      
      try {
        console.log('[QBO_HEALTH] Auto-refreshing token...');
        await qboClient.initialize();
        await qboClient.ensureValidToken();
        
        const newTokens = await tokenStorage.getLatestTokens();
        if (newTokens && newTokens.expiresAt > tokens.expiresAt) {
          health.autoRefresh.success = true;
          health.autoRefresh.newExpiresAt = new Date(newTokens.expiresAt * 1000).toISOString();
          health.tokens.expires_at = health.autoRefresh.newExpiresAt;
          health.tokens.expires_in_minutes = Math.floor((newTokens.expiresAt - now) / 60);
          health.tokens.expired = false;
          console.log('[QBO_HEALTH] Auto-refresh success:', health.autoRefresh.newExpiresAt);
        } else {
          health.autoRefresh.error = 'Refresh did not update expiry';
        }
      } catch (refreshError: any) {
        health.autoRefresh.error = refreshError.message;
        console.error('[QBO_HEALTH] Auto-refresh failed:', refreshError.message);
      }
    }
  }

  // 6. Determine overall health status
  const configOk = health.config.client_id_set && 
                   health.config.client_secret_set && 
                   health.config.redirect_uri_set;

  if (health.status !== 'refreshing') {
    if (configOk && health.tokens.available && !health.tokens.expired && errors.length === 0) {
      health.ok = true;
      health.status = warnings.length > 0 ? 'degraded' : 'healthy';
    } else if (configOk && health.tokens.available) {
      health.ok = true;
      health.status = 'degraded';
    } else if (configOk) {
      health.ok = false;
      health.status = 'degraded';
    } else {
      health.ok = false;
      health.status = 'unhealthy';
    }
  }

  console.log('[QBO_HEALTH]', health.status, {
    config_ok: configOk,
    tokens_available: health.tokens.available,
    expires_in_minutes: health.tokens.expires_in_minutes,
    errors: errors.length,
  });

  const statusCode = !configOk ? 503 : health.tokens.expired ? 401 : 200;
  return NextResponse.json(health, { status: statusCode });
}

// POST to force a token refresh
export async function POST() {
  console.log('[QBO_HEALTH] Force refresh requested');
  
  try {
    const result = await tokenRefreshService.forceRefresh();
    return NextResponse.json({
      success: result.success,
      error: result.error,
      stats: result.stats,
      timestamp: new Date().toISOString(),
    }, { status: result.success ? 200 : 500 });
  } catch (error: any) {
    console.error('[QBO_HEALTH] Force refresh error:', error.message);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
