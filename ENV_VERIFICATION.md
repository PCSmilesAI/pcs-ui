# Environment Variables Verification Guide

## Required QuickBooks Environment Variables

Your `.env` or `.env.local` file should contain the following variables for **sandbox/development** mode:

### ✅ Correct Variable Names (QBO_ prefix)

```env
# QuickBooks OAuth Configuration (Development/Sandbox)
QBO_CLIENT_ID=AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE
QBO_CLIENT_SECRET=SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74
QBO_REDIRECT_URI=https://pcsmilesai.com/api/qbo/callback
QBO_SCOPES=com.intuit.quickbooks.accounting
QBO_ENVIRONMENT=sandbox

# Optional but recommended
QBO_STATE_SECRET=your-random-secret-key-here-for-state-verification
```

### ⚠️ Important Notes

1. **Variable Prefix**: The code uses `QBO_` prefix (NOT `QB_`)
   - ✅ Correct: `QBO_CLIENT_ID`
   - ❌ Wrong: `QB_CLIENT_ID`

2. **Environment Variable Name**: 
   - New code uses: `QBO_ENVIRONMENT` (defaults to `sandbox` if not set)
   - Some older code uses: `QBO_ENV` (also defaults to `sandbox`)
   - Both work, but `QBO_ENVIRONMENT` is preferred

3. **Environment Value**: 
   - For development/sandbox: `QBO_ENVIRONMENT=sandbox` (or leave unset - defaults to sandbox)
   - For production: `QBO_ENVIRONMENT=production`

4. **Redirect URI**: 
   - Must match EXACTLY what's configured in Intuit Developer Portal
   - Must be in the **Development** tab (not Production tab) for sandbox
   - No trailing slash
   - Exact case: `/api/qbo/callback`

## Verification Checklist

Run this command to check your environment variables:

```bash
# Check if variables are set (won't show values for security)
echo "QBO_CLIENT_ID: ${QBO_CLIENT_ID:+SET}"
echo "QBO_CLIENT_SECRET: ${QBO_CLIENT_SECRET:+SET}"
echo "QBO_REDIRECT_URI: ${QBO_REDIRECT_URI:+SET}"
echo "QBO_ENVIRONMENT: ${QBO_ENVIRONMENT:-sandbox (default)}"
echo "QBO_SCOPES: ${QBO_SCOPES:-com.intuit.quickbooks.accounting (default)}"
```

## Common Issues

### Issue 1: Wrong Variable Prefix
**Problem**: Using `QB_CLIENT_ID` instead of `QBO_CLIENT_ID`
- **Symptom**: OAuth fails with "Missing environment variables"
- **Fix**: Change `QB_` to `QBO_` in your `.env` file

### Issue 2: Missing QBO_ENVIRONMENT
**Problem**: Not setting `QBO_ENVIRONMENT` 
- **Symptom**: System defaults to sandbox (which is correct for development)
- **Fix**: Explicitly set `QBO_ENVIRONMENT=sandbox` if you want to be sure

### Issue 3: Wrong Redirect URI Tab
**Problem**: Redirect URI is in Production tab instead of Development tab
- **Symptom**: OAuth redirects to Account Manager instead of your callback
- **Fix**: Move redirect URI to Development tab in Intuit Developer Portal

### Issue 4: Environment Mismatch
**Problem**: Using Production Client ID/Secret but sandbox environment (or vice versa)
- **Symptom**: OAuth fails with redirect URI mismatch
- **Fix**: Ensure Client ID/Secret match the environment:
  - Development Client ID → Development tab → `QBO_ENVIRONMENT=sandbox`
  - Production Client ID → Production tab → `QBO_ENVIRONMENT=production`

## Current Configuration (Based on Code)

Based on the codebase analysis:

- **Default Environment**: `sandbox` (if `QBO_ENVIRONMENT` not set)
- **Expected Variables**: `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_ENVIRONMENT`, `QBO_SCOPES`
- **Client ID**: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE` (Development)
- **Redirect URI**: `https://pcsmilesai.com/api/qbo/callback`

## Testing Your Configuration

1. **Check Health Endpoint**: Visit `/api/qbo/health` to see configuration status
2. **Check Auth Endpoint**: Visit `/api/qbo/auth` to start OAuth flow
3. **Verify in Intuit Portal**: 
   - Go to https://developer.intuit.com/app/developer/myapps
   - Select your app → Keys & credentials → Development tab
   - Verify redirect URI matches exactly

## Files That Reference Environment Variables

- `app/api/qbo/auth/route.ts` - Uses `QBO_ENVIRONMENT` (defaults to `sandbox`)
- `app/api/qbo/callback/route.ts` - Uses `QBO_ENVIRONMENT` (defaults to `sandbox`)
- `lib/qbo/qboClient.ts` - Uses `QBO_ENVIRONMENT` (defaults to `sandbox`)
- `app/api/qbo/health/route.ts` - Uses `QBO_ENV` (defaults to `sandbox`)
- `src/core/settings.py` - Uses `QBO_ENV` (defaults to `sandbox`)

All code now defaults to **sandbox** if environment variable is not set.

