/**
 * Secure Environment Configuration Loader
 * 
 * ⚠️  SECURITY: This module validates and loads environment variables.
 * Never hardcode secrets. All secrets must come from environment variables.
 */

interface EnvConfig {
  // App
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  host: string;
  
  // Secrets (required in production)
  sessionSecret: string;
  encryptionKey: string;
  
  // QuickBooks OAuth
  qboClientId: string;
  qboClientSecret: string;
  qboRedirectUri: string;
  qboEnvironment: 'sandbox' | 'production';
  
  // Stripe (optional)
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  
  // SendGrid (optional)
  sendgridApiKey?: string;
  
  // Sentry (optional)
  sentryDsn?: string;
  
  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  // Data
  dataDir: string;
}

class ConfigLoader {
  private config: EnvConfig | null = null;
  private errors: string[] = [];

  /**
   * Load and validate environment configuration
   */
  load(): EnvConfig {
    if (this.config) {
      return this.config;
    }

    this.errors = [];
    const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';

    // Validate required secrets in production
    if (nodeEnv === 'production') {
      this.validateRequired('SESSION_SECRET', 'Session secret for cookie signing');
      this.validateRequired('ENCRYPTION_KEY', 'Encryption key for sensitive data');
      this.validateRequired('QBO_CLIENT_ID', 'QuickBooks OAuth client ID');
      this.validateRequired('QBO_CLIENT_SECRET', 'QuickBooks OAuth client secret');
      this.validateRequired('QBO_REDIRECT_URI', 'QuickBooks OAuth redirect URI');
    }

    if (this.errors.length > 0) {
      console.error('[CONFIG] ❌ FATAL: Missing required environment variables:');
      this.errors.forEach(err => console.error(`  ${err}`));
      console.error('[CONFIG] Set these in /etc/environment or your secret manager');
      process.exit(1);
    }

    this.config = {
      nodeEnv,
      port: parseInt(process.env.PORT || '3000', 10),
      host: process.env.HOST || '0.0.0.0',
      
      sessionSecret: process.env.SESSION_SECRET || '',
      encryptionKey: process.env.ENCRYPTION_KEY || '',
      
      qboClientId: process.env.QBO_CLIENT_ID || '',
      qboClientSecret: process.env.QBO_CLIENT_SECRET || '',
      qboRedirectUri: process.env.QBO_REDIRECT_URI || '',
      qboEnvironment: (process.env.QBO_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
      
      stripeSecretKey: process.env.STRIPE_SECRET_KEY,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      sendgridApiKey: process.env.SENDGRID_API_KEY,
      sentryDsn: process.env.SENTRY_DSN,
      
      logLevel: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
      dataDir: process.env.PCS_DATA_DIR || './pcs_ui_data',
    };

    // Log configuration status
    console.log('[CONFIG] ✅ CONFIG_OK: true');
    console.log(`[CONFIG] Environment: ${nodeEnv}`);
    console.log(`[CONFIG] Port: ${this.config.port}`);
    console.log(`[CONFIG] Data directory: ${this.config.dataDir}`);
    console.log(`[CONFIG] Loaded ${this.countLoadedSecrets()} secrets from environment`);

    return this.config;
  }

  /**
   * Validate that a required environment variable is set
   */
  private validateRequired(varName: string, description: string): void {
    if (!process.env[varName]) {
      this.errors.push(`- ${varName}: ${description}`);
    }
  }

  /**
   * Count how many secrets are loaded (for logging)
   */
  private countLoadedSecrets(): number {
    let count = 0;
    const secretVars = [
      'SESSION_SECRET',
      'ENCRYPTION_KEY',
      'QBO_CLIENT_ID',
      'QBO_CLIENT_SECRET',
      'QBO_REDIRECT_URI',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'SENDGRID_API_KEY',
    ];
    
    for (const varName of secretVars) {
      if (process.env[varName]) {
        count++;
      }
    }
    
    return count;
  }

  /**
   * Get the current configuration
   */
  getConfig(): EnvConfig {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }
}

// Singleton instance
const loader = new ConfigLoader();

/**
 * Load configuration on module import
 */
export const config = loader.load();

/**
 * Get configuration (already loaded)
 */
export function getConfig(): EnvConfig {
  return config;
}

/**
 * Validate that a secret is set (for runtime checks)
 */
export function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[CONFIG] Required secret not set: ${name}`);
  }
  return value;
}

export default config;

