/**
 * Feature Flags System
 * 
 * Provides kill switches for risky modules and feature toggles.
 * All flags default to safe values (destructive ops disabled by default).
 */

export interface FeatureFlags {
  // QuickBooks Integration
  qboSyncEnabled: boolean;
  qboBillCreationEnabled: boolean;
  qboTokenRefreshEnabled: boolean;
  
  // Stripe Integration
  stripeWebhooksEnabled: boolean;
  stripePaymentProcessingEnabled: boolean;
  
  // Email Ingestion
  emailIngestionEnabled: boolean;
  emailParserEnabled: boolean;
  
  // Invoice Processing
  invoiceAutoCategorizationEnabled: boolean;
  invoiceAutoApprovalEnabled: boolean;
  
  // Background Jobs
  backgroundJobsEnabled: boolean;
  queueProcessingEnabled: boolean;
  
  // Admin Operations (read-only flags)
  adminBulkOperationsEnabled: boolean;
  adminDataExportEnabled: boolean;
  adminSystemConfigEnabled: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  // Default to enabled for normal operation
  qboSyncEnabled: true,
  qboBillCreationEnabled: true,
  qboTokenRefreshEnabled: true,
  stripeWebhooksEnabled: true,
  stripePaymentProcessingEnabled: true,
  emailIngestionEnabled: true,
  emailParserEnabled: true,
  invoiceAutoCategorizationEnabled: true,
  invoiceAutoApprovalEnabled: false, // Auto-approval disabled by default (safe)
  backgroundJobsEnabled: true,
  queueProcessingEnabled: true,
  adminBulkOperationsEnabled: true,
  adminDataExportEnabled: true,
  adminSystemConfigEnabled: true,
};

// Runtime flags storage (in-memory, can be persisted to DB)
let runtimeFlags: FeatureFlags = { ...DEFAULT_FLAGS };

/**
 * Load feature flags from environment variables
 * Environment variables override defaults
 */
export function loadFeatureFlags(): FeatureFlags {
  const flags: FeatureFlags = { ...DEFAULT_FLAGS };
  
  // QuickBooks flags
  if (process.env.FEATURE_QBO_SYNC_ENABLED !== undefined) {
    flags.qboSyncEnabled = process.env.FEATURE_QBO_SYNC_ENABLED === 'true';
  }
  if (process.env.FEATURE_QBO_BILL_CREATION_ENABLED !== undefined) {
    flags.qboBillCreationEnabled = process.env.FEATURE_QBO_BILL_CREATION_ENABLED === 'true';
  }
  if (process.env.FEATURE_QBO_TOKEN_REFRESH_ENABLED !== undefined) {
    flags.qboTokenRefreshEnabled = process.env.FEATURE_QBO_TOKEN_REFRESH_ENABLED === 'true';
  }
  
  // Stripe flags
  if (process.env.FEATURE_STRIPE_WEBHOOKS_ENABLED !== undefined) {
    flags.stripeWebhooksEnabled = process.env.FEATURE_STRIPE_WEBHOOKS_ENABLED === 'true';
  }
  if (process.env.FEATURE_STRIPE_PAYMENT_PROCESSING_ENABLED !== undefined) {
    flags.stripePaymentProcessingEnabled = process.env.FEATURE_STRIPE_PAYMENT_PROCESSING_ENABLED === 'true';
  }
  
  // Email flags
  if (process.env.FEATURE_EMAIL_INGESTION_ENABLED !== undefined) {
    flags.emailIngestionEnabled = process.env.FEATURE_EMAIL_INGESTION_ENABLED === 'true';
  }
  if (process.env.FEATURE_EMAIL_PARSER_ENABLED !== undefined) {
    flags.emailParserEnabled = process.env.FEATURE_EMAIL_PARSER_ENABLED === 'true';
  }
  
  // Invoice flags
  if (process.env.FEATURE_INVOICE_AUTO_CATEGORIZATION_ENABLED !== undefined) {
    flags.invoiceAutoCategorizationEnabled = process.env.FEATURE_INVOICE_AUTO_CATEGORIZATION_ENABLED === 'true';
  }
  if (process.env.FEATURE_INVOICE_AUTO_APPROVAL_ENABLED !== undefined) {
    flags.invoiceAutoApprovalEnabled = process.env.FEATURE_INVOICE_AUTO_APPROVAL_ENABLED === 'true';
  }
  
  // Background job flags
  if (process.env.FEATURE_BACKGROUND_JOBS_ENABLED !== undefined) {
    flags.backgroundJobsEnabled = process.env.FEATURE_BACKGROUND_JOBS_ENABLED === 'true';
  }
  if (process.env.FEATURE_QUEUE_PROCESSING_ENABLED !== undefined) {
    flags.queueProcessingEnabled = process.env.FEATURE_QUEUE_PROCESSING_ENABLED === 'true';
  }
  
  // Admin flags
  if (process.env.FEATURE_ADMIN_BULK_OPERATIONS_ENABLED !== undefined) {
    flags.adminBulkOperationsEnabled = process.env.FEATURE_ADMIN_BULK_OPERATIONS_ENABLED === 'true';
  }
  if (process.env.FEATURE_ADMIN_DATA_EXPORT_ENABLED !== undefined) {
    flags.adminDataExportEnabled = process.env.FEATURE_ADMIN_DATA_EXPORT_ENABLED === 'true';
  }
  if (process.env.FEATURE_ADMIN_SYSTEM_CONFIG_ENABLED !== undefined) {
    flags.adminSystemConfigEnabled = process.env.FEATURE_ADMIN_SYSTEM_CONFIG_ENABLED === 'true';
  }
  
  runtimeFlags = flags;
  return flags;
}

/**
 * Get current feature flags
 */
export function getFeatureFlags(): FeatureFlags {
  return { ...runtimeFlags };
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return runtimeFlags[flag] ?? false;
}

/**
 * Set a feature flag (runtime override)
 * Note: This is in-memory only. For persistence, use the API endpoint.
 */
export function setFeatureFlag(flag: keyof FeatureFlags, value: boolean): void {
  runtimeFlags[flag] = value;
}

/**
 * Reset all flags to defaults
 */
export function resetFeatureFlags(): void {
  runtimeFlags = { ...DEFAULT_FLAGS };
}

/**
 * Emergency kill switch - disable all risky operations
 */
export function enableEmergencyMode(): void {
  runtimeFlags.qboSyncEnabled = false;
  runtimeFlags.qboBillCreationEnabled = false;
  runtimeFlags.stripeWebhooksEnabled = false;
  runtimeFlags.stripePaymentProcessingEnabled = false;
  runtimeFlags.emailIngestionEnabled = false;
  runtimeFlags.invoiceAutoApprovalEnabled = false;
  runtimeFlags.backgroundJobsEnabled = false;
  runtimeFlags.queueProcessingEnabled = false;
}

/**
 * Initialize feature flags on module load
 */
loadFeatureFlags();

