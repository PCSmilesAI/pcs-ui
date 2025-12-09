# New Intuit App Configuration Guide

## Your New Credentials

- **Client ID**: `ABbcpmpQo7Dyhfj9PQpQZ0OAemB4nXAc5t4oZpLcynWEmWsXvj`
- **Client Secret**: `TAhCpxg8D8B3uAf0JpZMbngkrWECZFDV1wQaXpbs`
- **Environment**: `sandbox` (Development)

## Step 1: Update Your .env File

Add or update these lines in your `.env` file:

```env
QBO_CLIENT_ID=ABbcpmpQo7Dyhfj9PQpQZ0OAemB4nXAc5t4oZpLcynWEmWsXvj
QBO_CLIENT_SECRET=TAhCpxg8D8B3uAf0JpZMbngkrWECZFDV1wQaXpbs
QBO_REDIRECT_URI=https://pcsmilesai.com/api/qbo/callback
QBO_SCOPES=com.intuit.quickbooks.accounting
QBO_ENVIRONMENT=sandbox
QBO_STATE_SECRET=pcs-qbo-oauth-state-secret-2024-secure
```

## Step 2: Configure in Intuit Developer Portal

Go to: https://developer.intuit.com/app/developer/myapps

Click on your new app, then configure the following:

### A. Redirect URIs (Development Tab)

**Location**: Settings → Redirect URIs → **Development** tab

**Add this EXACT redirect URI** (copy-paste, no trailing slash):
```
https://pcsmilesai.com/api/qbo/callback
```

**Important**:
- ✅ Use `https://` (not `http://`)
- ✅ No `www` (just `pcsmilesai.com`)
- ✅ Exact path: `/api/qbo/callback`
- ✅ NO trailing slash (not `/api/qbo/callback/`)
- ✅ NO query parameters
- ✅ NO port numbers

### B. App URLs (Development Tab)

**Location**: Settings → App URLs → **Development** tab

**Host domain** (enter exactly):
```
pcsmilesai.com
```

**Launch URL** (enter exactly):
```
https://pcsmilesai.com/api/qbo/callback
```

**Disconnect URL** (optional, but recommended):
```
https://pcsmilesai.com/api/qbo/disconnect
```

### C. Verify Keys & Credentials

**Location**: Keys & credentials → **Development** tab

Verify these match:
- **Client ID**: `ABbcpmpQo7Dyhfj9PQpQZ0OAemB4nXAc5t4oZpLcynWEmWsXvj`
- **Client Secret**: `TAhCpxg8D8B3uAf0JpZMbngkrWECZFDV1wQaXpbs`

## Step 3: Verify Configuration Checklist

Before testing, verify:

- [ ] `.env` file updated with new Client ID and Secret
- [ ] Redirect URI added in **Development** tab (not Production)
- [ ] Redirect URI is exactly: `https://pcsmilesai.com/api/qbo/callback` (no trailing slash)
- [ ] App URLs → Development tab has Host domain: `pcsmilesai.com`
- [ ] App URLs → Development tab has Launch URL: `https://pcsmilesai.com/api/qbo/callback`
- [ ] App status is "Active" or "Published"
- [ ] You're using the **Development** Client ID (not Production)

## Step 4: Test the OAuth Flow

1. **Restart your server** to pick up new environment variables:
   ```bash
   # If using PM2:
   pm2 restart pcs-ui
   
   # Or restart your Next.js dev server
   ```

2. **Clear browser cache** or use incognito/private window

3. **Trigger OAuth flow** (click "Connect to QuickBooks")

4. **Check server logs** - you should see:
   ```
   [QBO][AUTH] Client ID: ABbcpmpQo7Dyhfj9PQpQZ0OAemB4nXAc5t4oZpLcynWEmWsXvj
   [QBO][AUTH] Redirect URI (decoded): https://pcsmilesai.com/api/qbo/callback
   ```

5. **After authorization**, you should be redirected back to:
   ```
   https://pcsmilesai.com/ConnectionsPage?qbo_connected=true
   ```

## Troubleshooting

### If you still get redirect URI errors:

1. **Double-check the exact redirect URI** in Intuit Portal:
   - Go to Settings → Redirect URIs → Development tab
   - Copy the exact value shown there
   - Compare character-by-character with: `https://pcsmilesai.com/api/qbo/callback`

2. **Check server logs** for the decoded redirect URI:
   - Look for: `[QBO][AUTH] Redirect URI (decoded): ...`
   - This should match EXACTLY what's in Intuit Portal

3. **Verify you're in the Development tab**:
   - Make sure you're configuring the **Development** tab, not Production
   - The Client ID should match the Development Client ID

### If you get "sandbox before it's been defined" error:

1. **Wait 5-10 minutes** after making changes (Intuit needs time to propagate)
2. **Clear browser cache** completely
3. **Try in incognito/private window**
4. If still failing, the app might need to be recreated again

## Summary of Exact Values Needed

**In Intuit Developer Portal → Your App → Development Tab:**

| Setting | Value |
|---------|-------|
| Redirect URI | `https://pcsmilesai.com/api/qbo/callback` |
| Host Domain | `pcsmilesai.com` |
| Launch URL | `https://pcsmilesai.com/api/qbo/callback` |
| Client ID | `ABbcpmpQo7Dyhfj9PQpQZ0OAemB4nXAc5t4oZpLcynWEmWsXvj` |
| Client Secret | `TAhCpxg8D8B3uAf0JpZMbngkrWECZFDV1wQaXpbs` |

**In Your .env File:**

```env
QBO_CLIENT_ID=ABbcpmpQo7Dyhfj9PQpQZ0OAemB4nXAc5t4oZpLcynWEmWsXvj
QBO_CLIENT_SECRET=TAhCpxg8D8B3uAf0JpZMbngkrWECZFDV1wQaXpbs
QBO_REDIRECT_URI=https://pcsmilesai.com/api/qbo/callback
QBO_ENVIRONMENT=sandbox
```


