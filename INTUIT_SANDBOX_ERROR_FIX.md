# Fixing "Attempting to get sandbox before it's been defined" Error

## The Error

When you see this error in the Intuit OAuth page console:
```
Attempting to get sandbox before it's been defined
```

This indicates that **Intuit's own OAuth page** is having trouble initializing the sandbox environment. This is NOT a redirect URI issue - it's an Intuit app configuration issue.

## Root Causes

### 1. App Not Properly Configured for Sandbox

The app might be in a state where:
- It's marked as "Production" but you're trying to use it in sandbox mode
- The sandbox environment isn't properly initialized in Intuit's system
- The app was created/modified in a way that broke sandbox initialization

### 2. App Status Issues

Check in Intuit Developer Portal:
- **App Status**: Should be "Active" or "Published" (not "Pending" or "Inactive")
- **Environment**: The app should explicitly support Development/Sandbox mode

### 3. Missing Sandbox Configuration

The app might be missing required sandbox-specific settings:
- Sandbox redirect URIs not properly set
- Sandbox credentials not fully configured
- App type mismatch (Public vs Private vs Internal)

## Solutions

### Solution 1: Verify App Configuration in Developer Portal

1. Go to: https://developer.intuit.com/app/developer/myapps
2. Click on your app
3. Check **Overview** tab:
   - Is the app status "Active" or "Published"?
   - Are there any warnings or errors shown?
   - Does it show "Development" and "Production" sections?

4. Go to **Keys & credentials** → **Development** tab:
   - Is there a Client ID listed?
   - Is there a Client Secret listed?
   - Are Redirect URIs configured?

5. Go to **Settings** → **App URLs** → **Development** tab:
   - Is "Host domain" set?
   - Is "Launch URL" set?
   - These might need to match your redirect URI domain

### Solution 2: Re-create the App (Nuclear Option)

If the app seems corrupted or misconfigured:

1. **Create a brand new app**:
   - Go to Intuit Developer Portal
   - Click "Create an app"
   - Select "QuickBooks Online Accounting" scope
   - Name it something like "PCS AI - New" (to distinguish from old)

2. **Configure Development settings FIRST**:
   - Go to **Keys & credentials** → **Development** tab
   - Copy the Development Client ID and Secret
   - Go to **Settings** → **Redirect URIs** → **Development** tab
   - Add: `https://pcsmilesai.com/api/qbo/callback` (exact, no trailing slash)
   - Go to **Settings** → **App URLs** → **Development** tab
   - Set Host domain: `pcsmilesai.com`
   - Set Launch URL: `https://pcsmilesai.com/api/qbo/callback`

3. **Update your .env file**:
   ```env
   QBO_CLIENT_ID=<new_development_client_id>
   QBO_CLIENT_SECRET=<new_development_client_secret>
   QBO_REDIRECT_URI=https://pcsmilesai.com/api/qbo/callback
   QBO_ENVIRONMENT=sandbox
   ```

4. **Test immediately** before configuring anything else

### Solution 3: Check App Type

1. Go to **Settings** → **App Details**
2. Check the **App Type**:
   - **Public**: Can be used by any QuickBooks user
   - **Private**: Only for your own company
   - **Internal**: For Intuit employees only

3. For sandbox testing, **Public** or **Private** should work
4. If it's set to something incompatible, you may need to change it or create a new app

### Solution 4: Verify No Production Settings Interfere

1. Go to **Keys & credentials** → **Production** tab
2. If Production redirect URIs are set but Development ones aren't, Intuit might be confused
3. **Clear Production settings** temporarily (or ensure Development is fully configured)

### Solution 5: Wait and Retry

Sometimes Intuit's systems need time to propagate changes:
1. Make any configuration changes
2. **Wait 5-10 minutes**
3. Clear your browser cache
4. Try again in an incognito/private window

## Debugging Steps

### Step 1: Check Server Logs

When you trigger OAuth, check your server logs for:
```
[QBO][AUTH] OAuth Configuration Debug Info:
Redirect URI (decoded): https://pcsmilesai.com/api/qbo/callback
Client ID: AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE
Environment: sandbox
```

### Step 2: Verify the Auth URL

The auth URL should look like:
```
https://appcenter.intuit.com/connect/oauth2?
    client_id=AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE&
    response_type=code&
    scope=com.intuit.quickbooks.accounting&
    redirect_uri=https%3A%2F%2Fpcsmilesai.com%2Fapi%2Fqbo%2Fcallback&
    state=<jwt_token>&
    access_type=offline
```

### Step 3: Check Browser Console

When the Intuit OAuth page loads, check the console for:
- The "sandbox before it's been defined" error (indicates Intuit-side issue)
- Any other errors that might give clues

## Most Likely Fix

Based on the error pattern, **Solution 2 (Re-create the App)** is most likely to work because:

1. The error happens on Intuit's side, not yours
2. It suggests the app's sandbox configuration is corrupted
3. Creating a fresh app ensures clean sandbox initialization
4. Many developers report this fixes the issue

## After Fixing

Once you've recreated the app and updated your `.env`:

1. Restart your server (to pick up new env vars)
2. Clear browser cache
3. Try OAuth flow in incognito window
4. Check server logs for the detailed debug output
5. Verify the callback receives the authorization code

## If Still Failing

If recreating the app doesn't work:

1. **Contact Intuit Developer Support**:
   - Provide your app ID
   - Explain the "sandbox before it's been defined" error
   - Ask them to verify the app's sandbox configuration

2. **Try Production Mode** (temporarily):
   - Set `QBO_ENVIRONMENT=production` in `.env`
   - Use Production Client ID/Secret
   - Add redirect URI to Production tab
   - See if production works (this helps isolate if it's sandbox-specific)


