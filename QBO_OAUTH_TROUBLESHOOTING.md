# QuickBooks OAuth Troubleshooting Guide

## Current Configuration

### Environment Variables (Updated)
- **Client ID**: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE`
- **App ID**: `f1d4e557-d7ad-4dee-bf81-ff37987e833b`
- **Environment**: `sandbox` (Development mode)
- **Redirect URI**: `https://pcsmilesai.com/api/qbo/callback`

### Old Production App (NOT IN USE)
- **Client ID**: `ABfG1MwE5yhkAAqCw0RA2viwkI9cMdn33oagtgGOaJWdrkRBVl`
- **App ID**: `6f722239-93ee-4996-ba73-5ea6992c7a63`
- **Status**: Temporarily disabled for bug fixing

---

## The Problem

When you click "Reconnect" on pcsmilesai.com:
1. ✅ You're redirected to QuickBooks login
2. ✅ You log in successfully
3. ❌ **Instead of returning to pcsmilesai.com**, you're redirected to QuickBooks Account Dashboard

**Root Cause**: The redirect URI in your Intuit Developer App doesn't match what the code is sending.

---

## The Solution

### Step 1: Configure Redirect URI in Intuit Developer Dashboard

1. **Go to**: https://developer.intuit.com/app/developer/myapps

2. **Select your NEW development app**:
   - App ID: `f1d4e557-d7ad-4dee-bf81-ff37987e833b`
   - Client ID: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE`

3. **Navigate to**: Keys & credentials → Redirect URIs → **Development tab**

4. **Add this EXACT redirect URI** (copy-paste to avoid typos):
   ```
   https://pcsmilesai.com/api/qbo/callback
   ```

5. **Remove all other redirect URIs** from the Development tab:
   - Remove OAuth Playground URLs
   - Remove any test URLs
   - Keep ONLY the one above

6. **Click SAVE** and wait for confirmation

### Step 2: Verify Configuration

**Critical Checks**:
- ✅ No trailing slash: `https://pcsmilesai.com/api/qbo/callback` (NOT `/callback/`)
- ✅ All lowercase: `callback` (NOT `Callback` or `CALLBACK`)
- ✅ HTTPS: `https://` (NOT `http://`)
- ✅ No query parameters: No `?` or `&` at the end
- ✅ No fragments: No `#` at the end
- ✅ No spaces: No leading or trailing spaces

### Step 3: Test the OAuth Flow

**Option A: Test via Live Site**

1. Open an incognito/private browser window
2. Go to: https://pcsmilesai.com/ConnectionsPage
3. Click "Connect QuickBooks"
4. Log in to QuickBooks
5. **Expected**: You should be redirected back to `https://pcsmilesai.com/ConnectionsPage?qbo_connected=true`

**Option B: Test via Direct URL**

Open this URL in an incognito browser:

```
https://appcenter.intuit.com/connect/oauth2?client_id=AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE&scope=com.intuit.quickbooks.accounting&redirect_uri=https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback&response_type=code&state=test123&access_type=offline
```

**Expected Behavior**:
1. QuickBooks login page
2. Authorization screen (asking to connect to your app)
3. Redirect to: `https://pcsmilesai.com/api/qbo/callback?code=...&state=test123&realmId=...`

**If it still redirects to Account Dashboard**: The redirect URI in the Intuit Developer Dashboard is still incorrect.

---

## Common Issues

### Issue 1: "Invalid Redirect URI" Error

**Symptom**: Error message saying redirect URI is invalid

**Fix**: 
- Make sure the redirect URI is added to the **Development** tab (not Production)
- Click SAVE after adding it
- Wait 1-2 minutes for changes to propagate

### Issue 2: Redirects to Account Dashboard

**Symptom**: After login, you're sent to QuickBooks Account Dashboard instead of your site

**Fix**:
- The redirect URI in Intuit Developer Dashboard doesn't match
- Double-check for typos, trailing slashes, or case differences
- Make sure you're checking the **Development** tab, not Production

### Issue 3: "State Mismatch" Error

**Symptom**: Error saying "Invalid state" after callback

**Fix**:
- This is normal if you used the test URL above (state=test123)
- Try the real OAuth flow from ConnectionsPage instead

### Issue 4: Environment Variables Not Loading

**Symptom**: Error saying "Missing environment variables"

**Fix**:
- Already fixed! Environment variables are now loaded correctly
- Verify with: `curl http://localhost:3000/api/qbo/auth?debug=1`

---

## Debugging Tools

### Check Environment Variables

```bash
ssh root@159.65.181.148 "cd /var/www/pcs-ui && cat env | grep QBO"
```

### Test Auth Endpoint

```bash
curl -s 'https://pcsmilesai.com/api/qbo/auth?debug=1'
```

**Expected Response**:
```json
{
  "ok": true,
  "missing": [],
  "present": {
    "QBO_CLIENT_ID": true,
    "QBO_REDIRECT_URI": true,
    "QBO_SCOPES": true,
    "QBO_STATE_SECRET": true
  }
}
```

### Check OAuth Redirect URL

```bash
curl -I 'https://pcsmilesai.com/api/qbo/auth' 2>&1 | grep location
```

**Expected**: Should show a redirect to `https://appcenter.intuit.com/connect/oauth2?client_id=AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE&...`

### View Server Logs

```bash
ssh root@159.65.181.148 "pm2 logs pcs-ui --lines 50"
```

Look for lines starting with `[QBO][AUTH]` or `[QBO][CALLBACK]`

---

## What to Share if Still Not Working

If you've followed all the steps above and it's still not working, please share:

1. **Screenshot of Redirect URIs** in Intuit Developer Dashboard (Development tab)
2. **Exact error message** (if any)
3. **Server logs** from the callback:
   ```bash
   ssh root@159.65.181.148 "pm2 logs pcs-ui --lines 100 | grep QBO"
   ```
4. **URL you're redirected to** after QuickBooks login (copy from browser address bar)

---

## Summary

✅ **Environment variables updated** with new development app credentials  
✅ **Server restarted** with new configuration  
✅ **OAuth flow tested** and generating correct redirect URI  
⏳ **Waiting for**: Redirect URI to be configured in Intuit Developer Dashboard  

**Next Step**: Configure the redirect URI in your Intuit Developer Dashboard as described in Step 1 above.

---

*Last Updated: October 30, 2025*

