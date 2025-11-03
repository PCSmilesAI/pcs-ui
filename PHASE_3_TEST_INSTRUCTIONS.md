# Phase 3: Golden-Path OAuth Test Instructions

## ✅ Phases 1-2 Complete

### Phase 1: Callback Sanity Checks ✅
- ✅ Callback endpoint returns 200: `https://pcsmilesai.com/api/qbo/callback?ping=1`
- ✅ No redirects when ping=1 (verified via nginx logs showing 200)
- ✅ Added logging: `[QBO][CALLBACK] hit` logs query string

### Phase 2: Environment Verification ✅
- ✅ Development Client ID: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE`
- ✅ Development Client Secret: `SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74`
- ✅ Environment: `sandbox`
- ✅ Redirect URI: `https://pcsmilesai.com/api/qbo/callback`

---

## Phase 3: Incognito Test (DO THIS NOW)

### Step 1: Verify QuickBooks Developer Dashboard Config

**Critical: Go to QuickBooks Developer Dashboard and verify:**

1. **Keys & credentials → Development tab:**
   - Client ID: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE` ✅
   - Client Secret: `SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74` ✅

2. **Settings → Redirect URIs → Development tab:**
   - **ONLY ONE URI**: `https://pcsmilesai.com/api/qbo/callback`
   - Remove ALL other redirect URIs (especially OAuth Playground)
   - Verify NO trailing slash
   - Verify exact case (all lowercase)
   - **SAVE**

3. **Settings → App URLs → Development tab:**
   - Host domain: `pcsmilesai.com` (no https://)
   - Launch URL: `https://pcsmilesai.com/api/qbo/callback`
   - **SAVE**

### Step 2: Test Authorization URL in Incognito

1. **Open a brand-new Incognito/Private window** (critical - clears cookies)

2. **Clear any appcenter.intuit.com / intuit.com cookies** if prompted

3. **Paste this exact URL** in the address bar:
   ```
   https://appcenter.intuit.com/connect/oauth2?client_id=AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE&scope=com.intuit.quickbooks.accounting&redirect_uri=https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback&response_type=code&state=pcs-smoke-test
   ```

   **OR** click "Connect QuickBooks" from PCS AI Connections page (generates same URL)

4. **What should happen:**
   - ✅ You see QuickBooks login page
   - ✅ You log in with a **Sandbox user** (not production)
   - ✅ You select a **Sandbox company**
   - ✅ You see app authorization screen
   - ✅ You approve the connection
   - ✅ You are redirected to: `https://pcsmilesai.com/api/qbo/callback?code=...&realmId=...`

5. **What we'll check on server:**
   ```bash
   # Watch for callback logs
   pm2 logs pcs-ui | grep "QBO.*CALLBACK"
   
   # You should see:
   # [QBO][CALLBACK] hit { query: '?code=...&realmId=...&state=pcs-smoke-...' }
   # [QBO][CALLBACK] simple_state_detected { state: 'pcs-smoke-...' }
   ```

### Step 3: If It Still Bounces to Account Manager

If you're still redirected to Account Manager, proceed to **Phase 4** (OAuth Playground test).

---

## Expected Authorization URL Format

The server now generates:
```
https://appcenter.intuit.com/connect/oauth2?client_id=AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE&scope=com.intuit.quickbooks.accounting&redirect_uri=https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback&response_type=code&state=pcs-smoke-[timestamp]
```

**Key differences from before:**
- ✅ No `access_type=offline` (removed for initial test)
- ✅ No PKCE parameters
- ✅ State format: `pcs-smoke-[timestamp]`
- ✅ App Center endpoint (not legacy)

---

## Quick Verification Commands

```bash
# Test callback endpoint
curl -si "https://pcsmilesai.com/api/qbo/callback?ping=1"

# Generate test OAuth URL
curl -si "https://pcsmilesai.com/api/qbo/auth" | grep location

# Watch server logs during test
pm2 logs pcs-ui --lines 50 | grep -E "QBO|CALLBACK"
```

---

## Next Steps After Phase 3

**If Phase 3 succeeds:** Proceed to Phase 6 (Hardening)

**If Phase 3 fails:** Proceed to Phase 4 (OAuth Playground test)




