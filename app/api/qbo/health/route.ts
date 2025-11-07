/**
 * QuickBooks Online Health Check
 *
 * Verifies QBO integration is properly configured and operational.
 * Checks:
 * - Environment variables (client_id, client_secret, redirect_uri)
 * - Token availability
 * - OAuth mode (sandbox vs production)
 * - Redirect URI validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { tokenStorage } from '../../../../lib/qbo/tokenStorage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface QBOHealthStatus {
  ok: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy';
  config: {
    client_id_set: boolean;
    client_secret_set: boolean;
    redirect_uri_set: boolean;
    redirect_uri_value?: string;
    mode: 'sandbox' | 'production' | 'unknown';
  };
  tokens: {
    available: boolean;
    expires_at?: string;
  };
  errors: string[];
  timestamp: string;
}

export async function GET(_req: NextRequest) {
  const errors: string[] = [];
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
    },
    errors,
    timestamp: new Date().toISOString(),
  };

  // 1. Check environment variables
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const redirectUri = process.env.QBO_REDIRECT_URI;
  const qboEnv = process.env.QBO_ENV || 'sandbox';

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

  // 3. Check token availability
  try {
    const tokens = await tokenStorage.getLatestTokens();

    if (tokens) {
      health.tokens.available = true;
      if (tokens.expiresAt) {
        health.tokens.expires_at = new Date(tokens.expiresAt * 1000).toISOString();

        // Check if token is expired (expiresAt is in seconds)
        const now = Math.floor(Date.now() / 1000);
        if (now > tokens.expiresAt) {
          errors.push('QBO token has expired');
          health.tokens.available = false;
        }
      }
    } else {
      errors.push('No QBO tokens available - user needs to authorize');
    }
  } catch (err: any) {
    errors.push(`Token check failed: ${err?.message || 'unknown_error'}`);
  }

  // 4. Determine overall health status
  const configOk = health.config.client_id_set && 
                   health.config.client_secret_set && 
                   health.config.redirect_uri_set;

  if (configOk && health.tokens.available) {
    health.ok = true;
    health.status = 'healthy';
  } else if (configOk) {
    health.ok = true; // Config is OK, just needs authorization
    health.status = 'degraded';
  } else {
    health.ok = false;
    health.status = 'unhealthy';
  }

  console.log('[QBO_HEALTH]', health.status, {
    config_ok: configOk,
    tokens_available: health.tokens.available,
    errors: errors.length,
  });

  // Return 200 if config is OK (even if tokens missing), 503 if config is broken
  const statusCode = configOk ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}

