/**
 * PM2 Ecosystem Configuration
 *
 * ⚠️  SECURITY NOTICE: All secrets must be provided via environment variables.
 * Never hardcode secrets in this file. Use /etc/environment or a secret manager.
 *
 * Required environment variables (must be set before starting):
 * - SESSION_SECRET (min 32 chars)
 * - ENCRYPTION_KEY (min 32 chars)
 * - QBO_CLIENT_ID
 * - QBO_CLIENT_SECRET
 * - QBO_REDIRECT_URI
 * - STRIPE_SECRET_KEY
 * - STRIPE_WEBHOOK_SECRET
 * - SENDGRID_API_KEY
 */

const requiredEnvVars = [
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  'QBO_CLIENT_ID',
  'QBO_CLIENT_SECRET',
  'QBO_REDIRECT_URI',
];

// Validate required environment variables on startup
function validateConfig() {
  const missing = [];
  const nodeEnv = process.env.NODE_ENV || 'development';

  // Only validate secrets in production
  if (nodeEnv === 'production') {
    for (const varName of requiredEnvVars) {
      if (!process.env[varName]) {
        missing.push(varName);
      }
    }

    if (missing.length > 0) {
      console.error('[CONFIG] ❌ FATAL: Missing required environment variables:');
      missing.forEach(v => console.error(`  - ${v}`));
      console.error('[CONFIG] Set these in /etc/environment or your secret manager');
      process.exit(1);
    }
  }

  console.log('[CONFIG] ✅ CONFIG_OK: true');
  console.log(`[CONFIG] Environment: ${nodeEnv}`);
  console.log(`[CONFIG] Loaded ${requiredEnvVars.length} required secrets from environment`);
}

// Validate on module load
validateConfig();

module.exports = {
  apps: [{
    name: 'pcs-ui',
    script: 'npm',
    args: 'run start',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'development',
      PCS_ENV: 'development',
      PCS_DATA_DIR: './pcs_ui_data',
      INBOX_SCAN_INTERVAL_MS: '10000'
    },
    env_production: {
      NODE_ENV: 'production',
      PCS_ENV: 'production',
      PCS_DATA_DIR: '/var/www/pcs-ui-data',
      INBOX_SCAN_INTERVAL_MS: '60000',
      PORT: 3000,
      HOST: '0.0.0.0',
      // All secrets come from environment variables - see /etc/environment
      LOG_LEVEL: 'info',
      ENABLE_METRICS: true,
      METRICS_PORT: 9090,
      ENABLE_CACHE: true,
      CACHE_TTL: 300,
      MAX_FILE_SIZE: '10mb',
      UPLOAD_DIR: 'uploads'
    }
  },
  {
    name: 'payment-verifier',
    script: 'scripts/cron-verify-payments.js',
    instances: 1,
    exec_mode: 'fork',
    cron_restart: '*/15 * * * *',
    autorestart: false,
    env: {
      PCS_BASE_URL: 'http://localhost:3000',
      CRON_SECRET: process.env.CRON_SECRET || 'pcs-cron-verify-2024'
    }
  }],
  deploy: {
    production: {
      user: 'root',
      host: '159.65.181.148',
      ref: 'origin/main',
      repo: 'https://github.com/PCSmilesAI/pcs-ui.git',
      path: '/var/www/pcs-ui',
      'post-deploy': 'npm install && npm run build && pm2 restart pcs-ui --update-env'
    }
  }
};

