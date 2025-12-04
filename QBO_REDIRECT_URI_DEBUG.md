# QuickBooks OAuth Redirect URI Debugging Guide

## Current Configuration

Based on your `.env` file:
- **Redirect URI**: `https://pcsmilesai.com/api/qbo/callback`
- **Client ID**: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE`
- **Environment**: `sandbox`

## Step-by-Step Verification Process

### Step 1: Check Server Logs

When you trigger the OAuth flow, check your server logs. You should see detailed debug output showing:

```
[QBO][AUTH] OAuth Configuration Debug Info:
Redirect URI (decoded): https://pcsmilesai.com/api/qbo/callback
```

**Copy the exact "Redirect URI (decoded)" value from the logs.**

### Step 2: Verify in Intuit Developer Portal

1. Go to: https://developer.intuit.com/app/developer/myapps
2. Click on your app
3. Go to **Keys & credentials** (or **Settings** → **Keys & OAuth**)
4. **IMPORTANT**: Click on the **Development** tab (NOT Production)
5. Scroll to **Redirect URIs** section
6. Look at ALL redirect URIs listed there

### Step 3: Character-by-Character Comparison

Compare the decoded redirect URI from Step 1 with what's registered in Step 2:

**Check these EXACTLY:**
- [ ] Protocol: `https://` (not `http://`)
- [ ] Domain: `pcsmilesai.com` (not `www.pcsmilesai.com`)
- [ ] Path: `/api/qbo/callback` (exact case, exact spelling)
- [ ] Trailing slash: NO trailing slash (not `/api/qbo/callback/`)
- [ ] Port: No port number (not `:3000` or `:8501`)
- [ ] Query string: None (not `?anything=here`)
- [ ] Fragment: None (not `#anything`)

### Step 4: Verify Client ID Match

1. In the same **Development** tab, find the **Client ID**
2. It should be: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE`
3. Verify this matches exactly what's in your `.env` file
4. **CRITICAL**: Make sure you're looking at the **Development** Client ID, not Production

### Step 5: Check for Multiple Redirect URIs

If you have multiple redirect URIs registered:
- Remove ALL of them except the one you're using
- Intuit doesn't "best match" - it must be EXACTLY one of the registered URIs
- Having multiple can cause confusion

### Step 6: Common Mismatches to Check

#### Issue A: Wrong Tab (Development vs Production)
- **Symptom**: Redirect URI is registered in Production tab but you're using Development Client ID
- **Fix**: Move redirect URI to Development tab OR use Production Client ID

#### Issue B: Trailing Slash
- **Registered**: `https://pcsmilesai.com/api/qbo/callback/` (with slash)
- **Your app**: `https://pcsmilesai.com/api/qbo/callback` (no slash)
- **Fix**: Remove trailing slash from Intuit portal OR add it to your `.env`

#### Issue C: www vs non-www
- **Registered**: `https://www.pcsmilesai.com/api/qbo/callback`
- **Your app**: `https://pcsmilesai.com/api/qbo/callback`
- **Fix**: Use exact domain match (register both if needed, or pick one)

#### Issue D: Port Number
- **Registered**: `https://pcsmilesai.com/api/qbo/callback`
- **Your app**: `https://pcsmilesai.com:3000/api/qbo/callback`
- **Fix**: Remove port from redirect URI (ports are only for localhost in Development)

#### Issue E: HTTP vs HTTPS
- **Registered**: `https://pcsmilesai.com/api/qbo/callback`
- **Your app**: `http://pcsmilesai.com/api/qbo/callback`
- **Fix**: Use HTTPS (required for production domains)

### Step 7: Test with Minimal URL

Try accessing this URL directly in your browser (replace YOUR_CLIENT_ID):

```
https://appcenter.intuit.com/connect/oauth2?
    client_id=AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE&
    response_type=code&
    scope=com.intuit.quickbooks.accounting&
    redirect_uri=https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback&
    state=test123&
    access_type=offline
```

**Note**: The `redirect_uri` is URL-encoded: `https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback`

When decoded, this becomes: `https://pcsmilesai.com/api/qbo/callback`

### Step 8: If Still Failing - Create New App

If everything matches and it still fails:

1. Create a **brand new** QuickBooks app in Intuit Developer Portal
2. **Immediately** add the redirect URI: `https://pcsmilesai.com/api/qbo/callback`
3. Copy the new Development Client ID and Secret
4. Update your `.env` file with the new credentials
5. Test again

Sometimes old apps have cached/buggy configurations that can only be fixed by creating a fresh app.

## Debugging Commands

### Check what redirect URI is actually being sent:

```bash
# In your server logs, look for:
[QBO][AUTH] Redirect URI (decoded): ...
```

### Verify URL encoding:

```bash
# Decode the redirect_uri from the auth URL
echo "https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback" | python3 -c "import sys, urllib.parse; print(urllib.parse.unquote(sys.stdin.read()))"
# Should output: https://pcsmilesai.com/api/qbo/callback
```

### Check environment variables:

```bash
# Verify your .env file has correct values
grep QBO_REDIRECT_URI .env
grep QBO_CLIENT_ID .env
grep QBO_ENVIRONMENT .env
```

## Expected Log Output

When working correctly, you should see:

```
[QBO][AUTH] Redirect URI (decoded): https://pcsmilesai.com/api/qbo/callback
[QBO][AUTH] Client ID: AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE
[QBO][AUTH] Environment: sandbox
```

Then after authorization:

```
[QBO][CALLBACK] Got Code: true
[QBO][CALLBACK] Got State: true
[QBO][CALLBACK] Realm ID: 1234567890
✅ Tokens received
🎉 Successfully connected to QuickBooks!
```

## Next Steps

1. **Run the OAuth flow** and check server logs
2. **Copy the exact redirect URI** from the logs
3. **Compare character-by-character** with Intuit Developer Portal
4. **Report back** what you find - especially:
   - What redirect URI is shown in the logs?
   - What redirect URI is registered in Intuit?
   - Are they in the same tab (Development vs Production)?
   - Do they match exactly?

