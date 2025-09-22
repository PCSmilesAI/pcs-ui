// Initialize QBO services
import { tokenRefreshService } from './tokenRefreshService';

// This file is imported by the app to start background services
console.log('🚀 Initializing QBO services...');

// Start token refresh service in production
if (process.env.NODE_ENV === 'production') {
  // Add a small delay to ensure everything is initialized
  setTimeout(() => {
    tokenRefreshService.start();
  }, 2000);
}

export { tokenRefreshService };


