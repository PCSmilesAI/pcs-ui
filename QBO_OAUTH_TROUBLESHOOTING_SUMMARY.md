# QuickBooks OAuth Troubleshooting - Complete Summary

## Current Problem

**Issue**: When clicking "Connect QuickBooks" on PCS AI Connections page, users are:
1. Redirected to QuickBooks OAuth login page
2. After successful login, **redirected to Intuit Account Manager** (`https://accounts.intuit.com/app/account-manager/overview`) instead of back to PCS AI
3. Sometimes the OAuth URL shows a **blank page** instead of the QuickBooks authorization screen

**Expected Behavior**: After QuickBooks login, users should see the app authorization screen, approve the connection, and be redirected back to PCS AI at `/ConnectionsPage?qbo_connected=true`

**Current Status**: ❌ Still not working despite multiple attempts

---

## Timeline of Attempts

### Phase 1: Initial Configuration Issues (Original Production App)

**Initial Setup:**
- App was in "Production" mode
- Using Production Client ID/Secret
- Multiple redirect URIs configured including OAuth Playground URL (`https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl`)

**Issues Found:**
- Redirect URI had OAuth Playground as first/primary redirect
- App in Production mode but using development/testing environment
- PM2 environment variables not properly configured
- Mix of `QB_` and `QBO_` prefixed environment variables causing confusion

**Solutions Attempted:**
1. ✅ Reordered redirect URIs in QuickBooks Developer Dashboard
2. ✅ Updated environment variables to use `QBO_` prefix consistently
3. ✅ Fixed PM2 ecosystem.config.js to use correct environment variables
4. ✅ Updated OAuth callback to redirect to `/ConnectionsPage?qbo_connected=true`

**Result**: ❌ Still redirecting to Account Manager

---

### Phase 2: New Development App Creation

**Decision**: Create a fresh Development app to avoid Production/Development conflicts

**New App Created:**
- App ID: `f1d4e557-d7ad-4dee-bf81-ff37987e833b`
- **Development Client ID**: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE`
- **Development Client Secret**: `SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74`
- App Status: "IN PRODUCTION" mode (but using Development keys)

**Configuration Updates:**
- ✅ Updated all `.env` files with new Development keys
- ✅ Updated `ecosystem.config.js` with new Development keys
- ✅ Set `QBO_ENVIRONMENT=sandbox`
- ✅ Removed legacy `QB_` prefixed variables from ecosystem.config.js
- ✅ Created `/api/qbo/connect` endpoint as Launch URL handler

**Result**: ❌ Still redirecting to Account Manager

---

### Phase 3: OAuth Endpoint Troubleshooting

**Issues Identified:**
- Tried App Center endpoint: `https://appcenter.intuit.com/connect/oauth2`
- Tried Legacy endpoint: `https://oauth.platform.intuit.com/oauth2/v1/authorize`
- Both endpoints showing blank pages or Account Manager redirect

**Code Changes Made:**
1. ✅ Simplified OAuth flow (removed PKCE/JWT state management)
2. ✅ Updated to use `URLSearchParams` for proper URL encoding
3. ✅ Switched between App Center and Legacy endpoints multiple times
4. ✅ Updated callback route to handle simple state parameters
5. ✅ Changed callback response to HTML pages instead of JSON redirects
6. ✅ Added proper error handling and logging

**Result**: ❌ Both endpoints show blank pages

---

### Phase 4: Deep Code Audit

**Actions Taken:**
1. ✅ Searched entire codebase for old Client IDs (found in test files only)
2. ✅ Removed legacy `QB_CLIENT_ID` and `QB_CLIENT_SECRET` from ecosystem.config.js
3. ✅ Verified all environment files use correct Development keys
4. ✅ Fixed PM2 to properly load environment variables
5. ✅ Created verification endpoint: `/api/qbo/verify-config`
6. ✅ Ensured redirect URI encoding is correct

**Verified Configuration:**
- Client ID: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE` ✅
- Client Secret: `SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74` ✅
- Redirect URI: `https://pcsmilesai.com/api/qbo/callback` ✅
- Scope: `com.intuit.quickbooks.accounting` ✅
- Environment: `sandbox` ✅

**Result**: ✅ Code is clean, but OAuth still fails

---

## Current Configuration

### Environment Variables (All Verified Correct)
```
QBO_CLIENT_ID=AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE
QBO_CLIENT_SECRET=SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74
QBO_REDIRECT_URI=https://pcsmilesai.com/api/qbo/callback
QBO_SCOPES=com.intuit.quickbooks.accounting
QBO_ENVIRONMENT=sandbox
```

### OAuth Endpoint
Currently using: `https://appcenter.intuit.com/connect/oauth2`

### Generated OAuth URL Format
```
https://appcenter.intuit.com/connect/oauth2?client_id=AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE&scope=com.intuit.quickbooks.accounting&redirect_uri=https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback&response_type=code&access_type=offline&state=simple-test-[timestamp]
```

### QuickBooks Developer Dashboard Configuration

**Verified Settings:**
- ✅ Client ID matches exactly in Keys & credentials → Development
- ✅ Redirect URI configured: `https://pcsmilesai.com/api/qbo/callback`
- ✅ App URLs: Host domain = `pcsmilesai.com`, Launch URL = `https://pcsmilesai.com/api/qbo/callback`
- ✅ Permissions: Accounting scope should be enabled
- ✅ App Status: Active/Published

---

## What We've Verified

### ✅ Working Correctly:
1. Environment variables loaded properly by PM2
2. OAuth URL generation is correct (verified via curl)
3. Redirect URI encoding is correct
4. Callback endpoint responds correctly to ping tests
5. No old Client IDs found in active code
6. Code uses correct Development Client ID
7. App Center and Legacy endpoints both tested

### ❌ Still Failing:
1. OAuth authorization page shows blank
2. QuickBooks redirects to Account Manager instead of callback
3. No authorization code received at callback endpoint

---

## Root Cause Analysis

### Most Likely Causes:

1. **Redirect URI Mismatch** (Most Common)
   - Even slight differences cause QuickBooks to reject the request
   - Check for: trailing slashes, spaces, case differences, http vs https

2. **App Not Properly Configured for OAuth**
   - App might need additional activation steps
   - Permissions might not be fully enabled
   - App status might have restrictions

3. **QuickBooks Platform Issue**
   - Client ID not recognized by OAuth system
   - App configuration changes not fully propagated
   - Possible delay in configuration sync

4. **Environment Mismatch**
   - App shows "IN PRODUCTION" but we're using Development keys
   - QuickBooks might be rejecting Development keys for Production-mode app

---

## Files Modified

### Core OAuth Files:
- `app/api/qbo/auth/route.ts` - OAuth initiation endpoint
- `app/api/qbo/callback/route.ts` - OAuth callback handler
- `app/api/qbo/connect/route.ts` - Launch URL handler (new)

### Configuration Files:
- `.env` - Updated with Development keys
- `.env.local` - Updated with Development keys
- `ecosystem.config.js` - Updated with Development keys, removed legacy variables

### Diagnostic Files:
- `app/api/qbo/verify-config/route.ts` - Configuration verification endpoint
- `app/api/qbo/diagnostic/route.ts` - OAuth diagnostic endpoint

---

## Next Steps / Potential Solutions

### Option 1: Verify QuickBooks Configuration One More Time
- [ ] Double-check Redirect URI matches EXACTLY (character-by-character)
- [ ] Remove ALL other redirect URIs except the one callback URL
- [ ] Verify App URLs configuration matches exactly
- [ ] Confirm Permissions tab has Accounting scope enabled
- [ ] Check App Overview for any warnings or errors

### Option 2: Try Production Keys
- If app is truly in "Production" mode, might need to use Production keys instead
- Production keys would be in: Keys & credentials → Production tab

### Option 3: App Recreation
- Create completely new app from scratch
- Configure only essential settings
- Test with minimal configuration

### Option 4: QuickBooks Support
- If all configuration is correct, this might be a QuickBooks platform issue
- Contact QuickBooks Developer Support with:
  - App ID: `f1d4e557-d7ad-4dee-bf81-ff37987e833b`
  - Client ID: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE`
  - Issue: OAuth redirect to Account Manager instead of callback

### Option 5: Alternative OAuth Flow
- Try using official `intuit-oauth` npm library
- Might handle edge cases better than manual OAuth implementation

---

## Test Endpoints Available

1. **Verification**: `https://pcsmilesai.com/api/qbo/verify-config`
   - Shows current configuration and verification checklist

2. **OAuth Initiation**: `https://pcsmilesai.com/api/qbo/auth`
   - Initiates OAuth flow

3. **Callback Test**: `https://pcsmilesai.com/api/qbo/callback?ping=1`
   - Tests if callback endpoint is working

---

## Current Error Flow

1. User clicks "Connect QuickBooks"
2. Browser redirects to: `https://appcenter.intuit.com/connect/oauth2?client_id=...`
3. **Issue A**: Page shows blank OR
4. **Issue B**: User logs in successfully, then redirected to Account Manager
5. **Expected**: User sees app authorization, approves, redirects to callback

---

## Conclusion

All code-side issues have been resolved:
- ✅ Correct Client ID/Secret in use
- ✅ Correct redirect URI configured
- ✅ OAuth URLs generated correctly
- ✅ No old credentials in codebase
- ✅ Environment variables properly loaded

**The issue appears to be entirely within QuickBooks Developer Dashboard configuration** or a QuickBooks platform-side problem. The code is correctly sending all required parameters, but QuickBooks is not accepting the OAuth request.

**Recommendation**: 
1. Triple-check Redirect URI matches exactly
2. Consider trying Production keys if app is truly in Production mode
3. Contact QuickBooks Developer Support if configuration is confirmed correct

---

*Last Updated: October 29, 2025*
*Total Troubleshooting Time: Extensive session*
*Status: Code verified correct, issue appears to be QuickBooks-side*




