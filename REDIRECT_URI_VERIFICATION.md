# Redirect URI Verification - Critical Check

## The Issue

QuickBooks redirects to Account Manager when the redirect URI in the OAuth request doesn't **EXACTLY** match what's configured in the Developer Dashboard, **character-by-character**.

## What We Send

Our code sends this redirect URI:
```
https://pcsmilesai.com/api/qbo/callback
```

URL-encoded in the OAuth request:
```
https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback
```

## What You Need to Check

### Step 1: Go to QuickBooks Developer Dashboard

1. Navigate to: Your PCS AI app → **Settings** → **Redirect URIs** → **Development tab**
2. **Copy the EXACT redirect URI** as it appears in the input field
3. **Don't type it** - use copy/paste to avoid typos

### Step 2: Compare Character-by-Character

The redirect URI in QuickBooks Developer Dashboard **MUST BE EXACTLY**:
```
https://pcsmilesai.com/api/qbo/callback
```

**Check for:**
- ✅ No trailing slash (`/callback` not `/callback/`)
- ✅ No leading/trailing spaces
- ✅ All lowercase (not `Callback` or `CALLBACK`)
- ✅ `https://` not `http://`
- ✅ No query parameters (`?` or `&`)
- ✅ No fragments (`#`)

### Step 3: Remove All Other Redirect URIs

**CRITICAL**: There should be **ONLY ONE** redirect URI in the Development tab:
- Remove OAuth Playground URL if present
- Remove any test URLs
- Keep ONLY: `https://pcsmilesai.com/api/qbo/callback`
- **SAVE** the changes

### Step 4: Verify App URLs Match

In **Settings** → **App URLs** → **Development tab**:
- Host domain: `pcsmilesai.com` (no `https://`)
- Launch URL: `https://pcsmilesai.com/api/qbo/callback`

---

## Manual Test

After verifying the redirect URI, test this URL directly in an incognito browser:

```
https://appcenter.intuit.com/connect/oauth2?client_id=AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE&scope=com.intuit.quickbooks.accounting&redirect_uri=https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback&response_type=code&state=test123
```

**Expected:** QuickBooks login → Authorization screen → Redirect to callback

**If still redirects to Account Manager:** There's a mismatch. Share the EXACT redirect URI you copied from the Dashboard.

---

## Common Hidden Issues

1. **Invisible characters** - Copy-paste from Dashboard might include hidden characters
2. **Encoding differences** - QuickBooks might store it differently
3. **Multiple redirect URIs** - QuickBooks uses the FIRST one in the list, not necessarily the one you think
4. **Environment mismatch** - Make sure you're checking **Development** tab, not **Production**

---

## What to Share

After checking:
1. What is the EXACT redirect URI shown in QuickBooks Dashboard? (copy-paste it)
2. Are there multiple redirect URIs listed? (if yes, list them all)
3. Which redirect URI appears FIRST in the list?
4. Did you click SAVE after making any changes?

---

*This is the #1 cause of Account Manager redirects. A single character difference will cause it to fail.*




