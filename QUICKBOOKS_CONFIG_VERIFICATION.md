# QuickBooks OAuth Configuration Verification

## ✅ Configuration Status: CORRECT

Date: October 30, 2025

## Summary

Your QuickBooks Developer Portal configuration is **CORRECT**. The issue was in your `ecosystem.config.js` file, which has now been fixed.

---

## 🔍 What Was Wrong

### Problem
The `ecosystem.config.js` file (used by PM2 to run your app in production) had:
- **Wrong Client ID**: `'your-production-client-id'` (placeholder)
- **Wrong Client Secret**: `'your-production-client-secret'` (placeholder)
- **Missing Redirect URI**: No `QBO_REDIRECT_URI` environment variable
- **Wrong Environment**: Set to `'production'` instead of `'sandbox'`

This meant when your app ran via PM2, it was using incorrect credentials and couldn't find the redirect URI.

### Solution
Updated `ecosystem.config.js` with the correct sandbox credentials from your QuickBooks Developer Portal.

---

## ✅ Current Configuration

### QuickBooks Developer Portal Settings

**App Name**: PCS AI (QuickBooks)  
**Environment**: Development (Sandbox)  
**Client ID**: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE`  
**Client Secret**: `SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74`

**Redirect URIs** (Development Tab):
1. ✅ `https://pcsmilesai.com/api/qbo/callback` - **PRIMARY (OAuth callback)**
2. `https://pcsmilesai.com/api/qbo/disconnect` - Secondary (disconnect endpoint)

**Permissions**:
- ✅ `com.intuit.quickbooks.accounting` (Accounting scope)
- ✅ `com.intuit.quickbooks.payment` (Payment scope)

---

### Updated ecosystem.config.js

The following environment variables are now correctly set in `env_production`:

```javascript
// QuickBooks OAuth Settings (SANDBOX/DEVELOPMENT)
QBO_CLIENT_ID: 'AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE',
QBO_CLIENT_SECRET: 'SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74',
QBO_REDIRECT_URI: 'https://pcsmilesai.com/api/qbo/callback',
QBO_SCOPES: 'com.intuit.quickbooks.accounting',
QBO_ENVIRONMENT: 'sandbox',
QBO_STATE_SECRET: 'your-secret-key-for-state-signing-min-32-chars-long',
```

---

## 🚀 Next Steps

### 1. Restart Your Application

If you're running the app with PM2:

```bash
cd pcs-ui
pm2 restart pcs-ai-quickbooks --update-env
```

Or if you're running it manually:

```bash
cd pcs-ui
npm run dev
```

### 2. Test the OAuth Flow

1. Navigate to: `https://pcsmilesai.com/api/qbo/auth`
2. You should be redirected to QuickBooks login
3. After authorizing, you should be redirected back to: `https://pcsmilesai.com/api/qbo/callback`
4. The callback should receive the authorization code and exchange it for tokens

### 3. Monitor for Errors

Check your application logs for any OAuth-related errors:

```bash
pm2 logs pcs-ai-quickbooks
```

Or if running manually, check the console output.

---

## 🔧 Troubleshooting

### If you still get "redirect_uri_mismatch" error:

1. **Verify the exact redirect URI being sent**:
   - Check your application logs for the OAuth URL being generated
   - Look for: `redirect_uri=https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback`

2. **Verify QuickBooks Developer Portal**:
   - Go to: https://developer.intuit.com/app/developer/myapps
   - Click on "PCS AI"
   - Go to "Settings" → "App URLs" → "Development" tab
   - Confirm `https://pcsmilesai.com/api/qbo/callback` is listed

3. **Check for URL encoding issues**:
   - The redirect URI should be URL-encoded in the OAuth request
   - `https://pcsmilesai.com/api/qbo/callback` becomes `https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback`

### If you get other OAuth errors:

- **"invalid_client"**: Client ID or Secret is wrong
- **"invalid_scope"**: Scope is not enabled in QuickBooks Developer Portal
- **"access_denied"**: User denied authorization
- **"invalid_grant"**: Authorization code expired or already used

---

## 📝 Important Notes

### Sandbox vs Production

You are currently using **SANDBOX** credentials. This means:
- ✅ You can test with QuickBooks Sandbox companies
- ❌ You cannot connect to real QuickBooks companies
- When ready for production, you'll need to:
  1. Get production keys from QuickBooks Developer Portal
  2. Update `ecosystem.config.js` with production credentials
  3. Change `QBO_ENVIRONMENT` to `'production'`

### Security Reminder

⚠️ **IMPORTANT**: The credentials in `ecosystem.config.js` are sensitive. Make sure:
- This file is in `.gitignore` (don't commit to Git)
- Only authorized personnel have access
- Use environment variables or secrets management in production

---

## 📚 Reference Links

- [QuickBooks Developer Portal](https://developer.intuit.com/app/developer/myapps)
- [QuickBooks OAuth 2.0 Documentation](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
- [QuickBooks API Explorer](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account)

---

## ✅ Verification Checklist

- [x] Client ID matches QuickBooks Developer Portal
- [x] Client Secret matches QuickBooks Developer Portal
- [x] Redirect URI matches QuickBooks Developer Portal
- [x] Environment is set to 'sandbox'
- [x] Scopes are correct
- [x] ecosystem.config.js has been updated
- [ ] Application has been restarted with new config
- [ ] OAuth flow has been tested successfully

---

**Last Updated**: October 30, 2025  
**Status**: Configuration Fixed - Ready for Testing

