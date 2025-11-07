/**
 * Readiness Probe
 * 
 * Returns 200 only when the application is ready to serve traffic.
 * Used by load balancers and orchestration systems (K8s, PM2, etc).
 * 
 * Checks:
 * - Database connectivity
 * - Required environment variables
 * - Critical services (Stripe, QBO tokens)
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface ReadinessCheck {
  name: string;
  ok: boolean;
  error?: string;
}

export async function GET(_req: NextRequest) {
  const checks: ReadinessCheck[] = [];

  // 1. Check database connectivity
  try {
    const { getDatabase } = await import('../../../lib/db/client');
    const db = getDatabase();
    db.prepare('SELECT 1').get();
    checks.push({ name: 'database', ok: true });
  } catch (err: any) {
    checks.push({
      name: 'database',
      ok: false,
      error: err?.message || 'database_check_failed',
    });
  }

  // 2. Check required environment variables
  const requiredEnvVars = [
    'SESSION_SECRET',
    'ENCRYPTION_KEY',
    'STRIPE_SECRET_KEY',
    'QBO_CLIENT_ID',
    'QBO_CLIENT_SECRET',
  ];

  const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
  checks.push({
    name: 'environment_variables',
    ok: missingEnvVars.length === 0,
    error: missingEnvVars.length > 0 ? `missing: ${missingEnvVars.join(', ')}` : undefined,
  });

  // 3. Check Stripe configuration
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.PCS_STRIPE_WEBHOOK_SECRET;
    checks.push({
      name: 'stripe_config',
      ok: !!(stripeKey && webhookSecret),
      error: !stripeKey ? 'missing_secret_key' : !webhookSecret ? 'missing_webhook_secret' : undefined,
    });
  } catch (err: any) {
    checks.push({
      name: 'stripe_config',
      ok: false,
      error: err?.message || 'stripe_config_check_failed',
    });
  }

  // 4. Check QBO token availability (non-blocking)
  try {
    const { tokenStorage } = await import('../../../lib/qbo/tokenStorage');
    const tokens = await tokenStorage.getLatestTokens();
    checks.push({
      name: 'qbo_tokens',
      ok: !!tokens,
      error: !tokens ? 'no_tokens_available' : undefined,
    });
  } catch (err: any) {
    // QBO tokens are optional for readiness
    checks.push({
      name: 'qbo_tokens',
      ok: false,
      error: err?.message || 'qbo_token_check_failed',
    });
  }

  // Determine overall readiness
  const criticalChecks = ['database', 'environment_variables', 'stripe_config'];
  const allCriticalOk = checks
    .filter(c => criticalChecks.includes(c.name))
    .every(c => c.ok);

  const readiness = {
    ready: allCriticalOk,
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  // Return 200 only if ready, 503 if not
  const status = allCriticalOk ? 200 : 503;

  console.log('[READY]', allCriticalOk ? 'ready' : 'not_ready', {
    checks: checks.map(c => ({ name: c.name, ok: c.ok })),
  });

  return NextResponse.json(readiness, { status });
}

