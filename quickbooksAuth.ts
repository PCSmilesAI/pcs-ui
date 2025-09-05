import { AuthProvider, AuthScopes } from 'quickbooks-api';

export const authProvider = new AuthProvider(
  'ABfG1MwE5yhkAAqCw0RA2viwkI9cMdn33oagtgGOaJWdrkRBVl',      // Get this from your Intuit Developer dashboard
  'WWbNuMbbXQZKwKdYcpuDHs5H7mwvfP0eVcdsiIEy',  // Get this from your Intuit Developer dashboard
  'https://pcsmilesai.com/api/qbo/callback',   // The URI QuickBooks redirects to after login (e.g. https://yourdomain.com/callback)
  [
    AuthScopes.Accounting,
    AuthScopes.OpenId,
  ]
);
