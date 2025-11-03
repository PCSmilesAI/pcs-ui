# Phase 4: OAuth 2.0 Playground Test Instructions

## Objective

Use Intuit's official OAuth 2.0 Playground to test if our QuickBooks app configuration is correct. If the Playground successfully redirects to our callback, the app config is valid and the issue is in our code. If the Playground ALSO fails, the redirect URI in QuickBooks Developer Dashboard doesn't match exactly.

---

## Step-by-Step Playground Test

### Step 1: Access OAuth 2.0 Playground

1. Go to: **https://developer.intuit.com/app/developer/playground**
2. Make sure you're logged into your Intuit Developer account
3. The playground should be in **Development** mode

### Step 2: Configure Playground Settings

In the OAuth 2.0 Playground, configure:

1. **Authorization Endpoint:**
   ```
   https://appcenter.intuit.com/connect/oauth2
   ```

2. **Token Endpoint:**
   ```
   https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
   ```

3. **Client ID:**
   ```
   AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE
   ```

4. **Client Secret:**
   ```
   SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74
   ```

5. **Redirect URI:**
   ```
   https://pcsmilesai.com/api/qbo/callback
   ```
   **CRITICAL**: Must match EXACTLY what's in QuickBooks Developer Dashboard

6. **Scope:**
   ```
   com.intuit.quickbooks.accounting
   ```

### Step 3: Start OAuth Flow in Playground

1. Click **"Get Authorization Code"** or **"Start OAuth Flow"** button
2. You'll be redirected to QuickBooks login
3. **Log in with a Sandbox user** (not production)
4. **Select a Sandbox company**
5. **Authorize the app**

### Step 4: Observe the Result

**Expected Behavior (Config is Correct):**
- ✅ Playground successfully redirects to: `https://pcsmilesai.com/api/qbo/callback?code=...&realmId=...`
- ✅ This proves the app configuration in QuickBooks is correct
- ✅ Our server logs should show: `[QBO][CALLBACK] hit` with code and realmId
- **Action**: The issue is in our code/implementation, proceed to Phase 4 Step 8 (middleware check)

**Unexpected Behavior (Config is Wrong):**
- ❌ Playground ALSO redirects to Account Manager
- ❌ Playground shows error about redirect URI mismatch
- ❌ Redirect URI validation fails
- **Action**: The redirect URI in QuickBooks Developer Dashboard doesn't match exactly. Re-check Phase 2 Step 3.

---

## What to Check if Playground Fails

### 1. Redirect URI Exact Match
In QuickBooks Developer Dashboard → Settings → Redirect URIs → Development:
- Must be EXACTLY: `https://pcsmilesai.com/api/qbo/callback`
- No trailing slash
- No spaces
- All lowercase
- `https://` not `http://`

### 2. Remove All Other Redirect URIs
- Remove OAuth Playground URL if it's there
- Remove any other test URLs
- Keep ONLY: `https://pcsmilesai.com/api/qbo/callback`
- **SAVE** the changes

### 3. Wait for Propagation
QuickBooks config changes can take 1-2 minutes to propagate. Wait a moment and try again.

---

## Monitoring Server During Playground Test

While testing in the Playground, monitor server logs:

```bash
# Watch for callback hits
pm2 logs pcs-ui | grep -E "QBO.*CALLBACK|pcs-smoke"

# Or check recent logs
pm2 logs pcs-ui --lines 100 | grep "CALLBACK"
```

**Expected log entry:**
```
[QBO][CALLBACK] hit { query: '?code=...&realmId=...&state=...' }
```

---

## Next Steps Based on Results

### If Playground Succeeds ✅
→ Proceed to **Phase 4 Step 8**: Check middleware/auth guards that might be intercepting `/api/qbo/callback`

### If Playground Also Fails ❌
→ Re-check **Phase 2 Step 3**: Redirect URI configuration in QuickBooks Developer Dashboard
→ Consider **Phase 5**: Creating a brand-new QuickBooks app for a clean slate

---

## Alternative: Manual URL Test

If the Playground isn't accessible, you can manually construct and test the URL:

```
https://appcenter.intuit.com/connect/oauth2?client_id=AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE&scope=com.intuit.quickbooks.accounting&redirect_uri=https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback&response_type=code
```

Paste this in an incognito browser. If it redirects to Account Manager, the redirect URI doesn't match.




