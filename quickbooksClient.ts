import { AuthProvider, ApiClient, Environment } from 'quickbooks-api';
import { tokenManager } from './database';

const {
  QB_CLIENT_ID,
  QB_CLIENT_SECRET,
  QB_REDIRECT_URI,
  ENCRYPTION_KEY
} = process.env;

// Utility to fetch and restore a user's QuickBooks token from the encrypted database
export async function getQuickBooksClient(realmId: string) {
  if (!QB_CLIENT_ID || !QB_CLIENT_SECRET || !QB_REDIRECT_URI || !ENCRYPTION_KEY) {
    throw new Error('Missing QuickBooks or encryption configuration in environment variables.');
  }

  // 1. Retrieve the encrypted token from the database
  const row = await tokenManager.getTokens(realmId);
  if (!row || !row.access_token) {
    throw new Error('No QuickBooks token found for the given realmId.');
  }

  // 2. Set up the AuthProvider (scopes must match your integration needs)
  const authProvider = new AuthProvider(
    QB_CLIENT_ID,
    QB_CLIENT_SECRET,
    QB_REDIRECT_URI,
    [
      // You can adjust scopes as needed
      'com.intuit.quickbooks.accounting', // Accounting scope
      'openid'                            // OpenId scope
    ]
  );

  // 3. Deserialize the encrypted token
  const token = authProvider.deserializeToken(row.access_token, ENCRYPTION_KEY);

  // 4. Initialize the API client for production or sandbox
  const apiClient = new ApiClient(authProvider, Environment.Production);
  apiClient.setToken(token);

  return apiClient;
}