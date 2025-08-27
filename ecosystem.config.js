module.exports = {
  apps: [{
    name: 'pcs-ai-quickbooks',
    script: 'dev-server.js',
    instances: 1, // Changed from 'max' to 1 to avoid port conflicts
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      HOST: '0.0.0.0',
      // Security Settings
      API_KEYS: '2c2774895ae438e86c71f7efe5ca9f5f326621c1df399f2d0a4fa7ed124724ba,d156f77282cef33af3a906c6af137f67bb33b6fd26913a406116a9d6ca779d8a',
      SESSION_SECRET: '3e10b131d772430f721b24388bb92fa978d037e82ecdd193d2e8264e50050705523375eb75ab514c05b60d7abf70254bde11743609faa0f28eb53520c773327f',
      ENCRYPTION_KEY: '36e81c4fa793c1673df8d6dd6c6db856e668ae198d28fae458fcb295ce7d4f5c',
      WEBHOOK_VERIFICATION_TOKEN: 'a8d2b999f429de47d9446316796a07c488566196377816ddba7e0f014beb1f8a',
      WEBHOOK_SIGNATURE_KEY: 'a8d2b999f429de47d9446316796a07c488566196377816ddba7e0f014beb1f8a',
      // QuickBooks OAuth Settings
      QBO_CLIENT_ID: 'your-production-client-id',
      QBO_CLIENT_SECRET: 'your-production-client-secret',
      QBO_ENVIRONMENT: 'production',
      // PCS AI Integration
      PCS_AI_API_URL: 'https://api.pcs-ai.com',
      PCS_AI_API_KEY: 'your-pcs-ai-api-key',
      // Database Settings
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      DB_NAME: 'pcs_ai_quickbooks',
      DB_USER: 'pcs_ai_user',
      DB_PASSWORD: 'your-secure-db-password',
      // Logging
      LOG_LEVEL: 'info',
      LOG_FILE: 'logs/app.log',
      // Monitoring
      ENABLE_METRICS: true,
      METRICS_PORT: 9090,
      // Performance
      ENABLE_CACHE: true,
      CACHE_TTL: 300,
      // File Upload
      MAX_FILE_SIZE: '10mb',
      UPLOAD_DIR: 'uploads',
      // Error Reporting
      SENTRY_DSN: 'your-sentry-dsn',
      // SSL/TLS
      SSL_ENABLED: false,
      SSL_CERT_PATH: '/path/to/cert.pem',
      SSL_KEY_PATH: '/path/to/key.pem'
    }
  }],
  deploy: {
    production: {
      user: 'node',
      host: 'your-production-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/pcs-ui.git',
      path: '/var/www/pcs-ai-quickbooks',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
};
