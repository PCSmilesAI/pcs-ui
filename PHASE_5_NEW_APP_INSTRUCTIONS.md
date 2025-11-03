# Phase 5: Create Brand-New QuickBooks App

## Why Create a New App?

Even though credentials are correct in the Developer Dashboard, creating a fresh app eliminates:
- Hidden configuration issues
- Cached redirect URI mismatches
- App status/approval delays
- Any residual settings from previous configurations

---

## Step-by-Step: Create New Development App

### Step 1: Create New App in QuickBooks Developer Dashboard

1. Go to: https://developer.intuit.com/
2. Navigate to **"My Apps"** or **"Workspaces"**
3. Click **"Create an App"** or **"New App"**
4. Fill in basic info:
   - **App Name**: `PCS AI - New Dev App` (or similar)
   - **App Type**: Choose appropriate type (likely "Accounting" or "General")
   - **Environment**: **Development** (NOT Production)

### Step 2: Configure Redirect URI FIRST

**CRITICAL**: Set up redirect URI BEFORE anything else:

1. Go to the new app → **Settings** → **Redirect URIs** → **Development tab**
2. Click **"+ Add URI"** or similar
3. Enter EXACTLY (copy-paste, don't type):
   ```
   https://pcsmilesai.com/api/qbo/callback
   ```
4. Verify:
   - ✅ No trailing slash
   - ✅ No spaces
   - ✅ All lowercase
   - ✅ `https://` not `http://`
5. **SAVE**

### Step 3: Get New Development Keys

1. Go to: **Keys & credentials** → **Development tab**
2. **Copy the Client ID** exactly
3. **Copy the Client Secret** exactly
4. **Note the App ID** (for reference)

### Step 4: Configure App URLs

1. Go to: **Settings** → **App URLs** → **Development tab**
2. Set:
   - **Host domain**: `pcsmilesai.com` (no https://)
   - **Launch URL**: `https://pcsmilesai.com/api/qbo/callback`
   - **Disconnect URL**: (optional, leave blank)
3. **SAVE**

### Step 5: Enable Permissions

1. Go to: **Permissions** → **Development tab**
2. Enable: **Accounting** scope (or `com.intuit.quickbooks.accounting`)
3. **SAVE**

### Step 6: Update Our Environment Variables

Once you have the new keys, we'll update:
- `.env` file
- `.env.local` file
- `ecosystem.config.js`
- Restart PM2 with new keys

---

## What to Share After Creating New App

Please provide:
1. **New Client ID**: (the Development Client ID)
2. **New Client Secret**: (the Development Client Secret)
3. **New App ID**: (optional, for reference)
4. **Confirmation**: That redirect URI is EXACTLY `https://pcsmilesai.com/api/qbo/callback`

---

## Why This Should Work

A brand-new app:
- ✅ Has no cached redirect URI issues
- ✅ No previous configuration conflicts
- ✅ Clean state for Development environment
- ✅ Eliminates any hidden settings

---

## Alternative: Character-by-Character Redirect URI Check

If you prefer NOT to create a new app, we can do an extremely detailed redirect URI verification:

1. In QuickBooks Dashboard, copy the redirect URI exactly as it appears
2. We'll compare it character-by-character with what we're sending
3. Check for hidden characters, encoding differences, etc.

---

*Choose one: Create new app OR do detailed redirect URI verification*




