/**
 * Approval Flow Configuration
 * Controls whether production approval mode is enabled
 */

// Check if production mode is enabled via environment or database config
export function isProductionModeEnabled(): boolean {
  // For now, default to false until fully implemented
  return false;
}

// Get approval threshold in cents
export function getApprovalThreshold(): number {
  // Default threshold: $500 = 50000 cents
  return 50000;
}



