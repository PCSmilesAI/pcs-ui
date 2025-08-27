// ============================================================================
// PRODUCTION CONFIGURATION
// ============================================================================

module.exports = {
  // Application Settings
  app: {
    name: 'PCS AI QuickBooks Integration',
    version: '1.0.0',
    environment: 'production',
    port: process.env.PORT || 3001,
    host: process.env.HOST || '0.0.0.0'
  },

  // Security Settings
  security: {
    apiKeys: process.env.API_KEYS ? process.env.API_KEYS.split(',') : ['production-api-key-1'],
    sessionSecret: process.env.SESSION_SECRET || 'change-this-in-production',
    encryptionKey: process.env.ENCRYPTION_KEY || '32-char-encryption-key-here',
    enableHelmet: process.env.ENABLE_HELMET !== 'false',
    enableCORS: process.env.ENABLE_CORS !== 'false',
    corsOrigin: process.env.CORS_ORIGIN || 'https://yourdomain.com'
  },

  // QuickBooks OAuth Settings
  quickbooks: {
    clientId: process.env.QBO_CLIENT_ID || 'your-production-client-id',
    clientSecret: process.env.QBO_CLIENT_SECRET || 'your-production-client-secret',
    environment: process.env.QBO_ENVIRONMENT || 'production',
    webhookVerificationToken: process.env.WEBHOOK_VERIFICATION_TOKEN || 'your-webhook-token',
    webhookSignatureKey: process.env.WEBHOOK_SIGNATURE_KEY || 'your-signature-key'
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false'
  },

  // Database Settings
  database: {
    url: process.env.DATABASE_URL || 'sqlite://./pcs_ai_data/database.sqlite',
    ssl: process.env.DATABASE_SSL === 'true',
    maxConnections: parseInt(process.env.MAX_DB_CONNECTIONS) || 10,
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    filePath: process.env.LOG_FILE_PATH || './logs/app.log',
    enableConsole: process.env.ENABLE_CONSOLE_LOGGING !== 'false',
    enableFile: process.env.ENABLE_FILE_LOGGING === 'true'
  },

  // Monitoring
  monitoring: {
    enableMetrics: process.env.ENABLE_METRICS !== 'false',
    metricsPort: parseInt(process.env.METRICS_PORT) || 9090,
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
    enablePerformanceMonitoring: process.env.ENABLE_PERFORMANCE_MONITORING !== 'false'
  },

  // Backup Settings
  backup: {
    enabled: process.env.BACKUP_ENABLED === 'true',
    intervalHours: parseInt(process.env.BACKUP_INTERVAL_HOURS) || 24,
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30,
    storagePath: process.env.BACKUP_STORAGE_PATH || './backups'
  },

  // Performance Settings
  performance: {
    maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 100,
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000,
    circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD) || 5,
    circuitBreakerTimeoutMs: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS) || 60000,
    enableCompression: process.env.ENABLE_COMPRESSION !== 'false'
  },

  // File Upload Settings
  fileUpload: {
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB) || 50,
    allowedFileTypes: process.env.ALLOWED_FILE_TYPES ? process.env.ALLOWED_FILE_TYPES.split(',') : ['pdf', 'doc', 'docx'],
    storagePath: process.env.UPLOAD_STORAGE_PATH || './uploads',
    enableVirusScan: process.env.ENABLE_VIRUS_SCAN === 'true'
  },

  // Cache Settings
  cache: {
    enabled: process.env.ENABLE_CACHE === 'true',
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS) || 3600,
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    enableMemoryCache: process.env.ENABLE_MEMORY_CACHE !== 'false'
  },

  // PCS AI Integration
  pcsAI: {
    apiUrl: process.env.PCS_AI_API_URL || 'https://api.pcs-ai.com',
    apiKey: process.env.PCS_AI_API_KEY || 'your-pcs-ai-api-key',
    webhookUrl: process.env.PCS_AI_WEBHOOK_URL || 'https://yourdomain.com/api/webhooks/pcs-ai',
    enableRealTimeSync: process.env.ENABLE_REALTIME_SYNC !== 'false'
  },

  // Error Reporting
  errorReporting: {
    sentryDsn: process.env.SENTRY_DSN || null,
    enableErrorReporting: process.env.ENABLE_ERROR_REPORTING === 'true',
    enableErrorNotifications: process.env.ENABLE_ERROR_NOTIFICATIONS === 'true',
    errorNotificationEmail: process.env.ERROR_NOTIFICATION_EMAIL || 'admin@yourdomain.com'
  },

  // SSL/TLS Settings
  ssl: {
    enabled: process.env.SSL_ENABLED === 'true',
    certPath: process.env.SSL_CERT_PATH || '/path/to/cert.pem',
    keyPath: process.env.SSL_KEY_PATH || '/path/to/key.pem',
    enableHSTS: process.env.ENABLE_HSTS !== 'false',
    hstsMaxAge: parseInt(process.env.HSTS_MAX_AGE) || 31536000
  }
};

// Export configuration for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = module.exports;
}
