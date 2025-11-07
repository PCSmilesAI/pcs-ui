/**
 * Environment Variable Schema & Validation
 * 
 * Centralized schema for all environment variables.
 * Validates on startup and provides type-safe access.
 */

export interface EnvConfig {
  // Core
  NODE_ENV: 'development' | 'production' | 'test';
  PCS_ENV: 'development' | 'staging' | 'production';

  // Session & Security
  SESSION_SECRET: string;
  ENCRYPTION_KEY: string;

  // Database
  PCS_DATA_DIR: string;
  DATABASE_URL?: string;

  // Stripe
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  PCS_STRIPE_WEBHOOK_SECRET: string;

  // QuickBooks Online
  QBO_CLIENT_ID: string;
  QBO_CLIENT_SECRET: string;
  QBO_REDIRECT_URI: string;
  QBO_ENV: 'sandbox' | 'production';
  QBO_SCOPES?: string;
  QBO_STATE_SECRET?: string;

  // Email
  SENDGRID_API_KEY?: string;
  MAILJET_API_KEY?: string;
  MAILJET_API_SECRET?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;

  // Application
  NEXT_PUBLIC_APP_URL: string;
  COMPANY_NAME?: string;

  // Feature Flags
  FEATURE_QBO_SYNC_ENABLED?: string;
  FEATURE_STRIPE_WEBHOOKS_ENABLED?: string;
  FEATURE_EMAIL_INGESTION_ENABLED?: string;
  FEATURE_INVOICE_AUTO_APPROVAL_ENABLED?: string;

  // Build Info
  GIT_COMMIT_SHA?: string;
  BUILD_TIME?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
}

/**
 * Required environment variables (must be set in production)
 */
const REQUIRED_VARS = [
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'PCS_STRIPE_WEBHOOK_SECRET',
  'QBO_CLIENT_ID',
  'QBO_CLIENT_SECRET',
  'QBO_REDIRECT_URI',
  'NEXT_PUBLIC_APP_URL',
];

/**
 * Validate environment variables
 * Throws error if required vars are missing in production
 */
export function validateEnv(): EnvConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const missing: string[] = [];

  // Check required variables
  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // In production, fail if any required vars are missing
  if (nodeEnv === 'production' && missing.length > 0) {
    console.error('[CONFIG] ❌ FATAL: Missing required environment variables:');
    missing.forEach(v => console.error(`  - ${v}`));
    console.error('[CONFIG] Set these in /etc/environment or your secret manager');
    process.exit(1);
  }

  // Warn in development
  if (nodeEnv === 'development' && missing.length > 0) {
    console.warn('[CONFIG] ⚠️  Missing environment variables (development only):');
    missing.forEach(v => console.warn(`  - ${v}`));
  }

  // Validate QBO_ENV
  const qboEnv = process.env.QBO_ENV || 'sandbox';
  if (!['sandbox', 'production'].includes(qboEnv)) {
    throw new Error(`Invalid QBO_ENV: ${qboEnv}. Must be 'sandbox' or 'production'`);
  }

  // Validate NODE_ENV
  const validNodeEnv = ['development', 'production', 'test'];
  if (!validNodeEnv.includes(nodeEnv)) {
    throw new Error(`Invalid NODE_ENV: ${nodeEnv}. Must be one of: ${validNodeEnv.join(', ')}`);
  }

  // Validate PCS_ENV
  const pcsEnv = process.env.PCS_ENV || 'development';
  const validPcsEnv = ['development', 'staging', 'production'];
  if (!validPcsEnv.includes(pcsEnv)) {
    throw new Error(`Invalid PCS_ENV: ${pcsEnv}. Must be one of: ${validPcsEnv.join(', ')}`);
  }

  // Validate URL format
  try {
    new URL(process.env.NEXT_PUBLIC_APP_URL || '');
  } catch (e) {
    throw new Error(`Invalid NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL}`);
  }

  console.log('[CONFIG] ✅ Environment validation passed');
  console.log(`[CONFIG] NODE_ENV: ${nodeEnv}`);
  console.log(`[CONFIG] PCS_ENV: ${pcsEnv}`);
  console.log(`[CONFIG] QBO_ENV: ${qboEnv}`);

  return {
    NODE_ENV: nodeEnv as 'development' | 'production' | 'test',
    PCS_ENV: pcsEnv as 'development' | 'staging' | 'production',
    SESSION_SECRET: process.env.SESSION_SECRET || '',
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
    PCS_DATA_DIR: process.env.PCS_DATA_DIR || '/var/www/pcs-ui-data',
    DATABASE_URL: process.env.DATABASE_URL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
    PCS_STRIPE_WEBHOOK_SECRET: process.env.PCS_STRIPE_WEBHOOK_SECRET || '',
    QBO_CLIENT_ID: process.env.QBO_CLIENT_ID || '',
    QBO_CLIENT_SECRET: process.env.QBO_CLIENT_SECRET || '',
    QBO_REDIRECT_URI: process.env.QBO_REDIRECT_URI || '',
    QBO_ENV: (qboEnv as 'sandbox' | 'production'),
    QBO_SCOPES: process.env.QBO_SCOPES,
    QBO_STATE_SECRET: process.env.QBO_STATE_SECRET,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    MAILJET_API_KEY: process.env.MAILJET_API_KEY,
    MAILJET_API_SECRET: process.env.MAILJET_API_SECRET,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '',
    COMPANY_NAME: process.env.COMPANY_NAME || 'Pacific Crest Smiles',
    FEATURE_QBO_SYNC_ENABLED: process.env.FEATURE_QBO_SYNC_ENABLED,
    FEATURE_STRIPE_WEBHOOKS_ENABLED: process.env.FEATURE_STRIPE_WEBHOOKS_ENABLED,
    FEATURE_EMAIL_INGESTION_ENABLED: process.env.FEATURE_EMAIL_INGESTION_ENABLED,
    FEATURE_INVOICE_AUTO_APPROVAL_ENABLED: process.env.FEATURE_INVOICE_AUTO_APPROVAL_ENABLED,
    GIT_COMMIT_SHA: process.env.GIT_COMMIT_SHA,
    BUILD_TIME: process.env.BUILD_TIME,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
  };
}

// Validate on module load
export const config = validateEnv();

