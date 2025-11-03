# How to Configure Redirect URI in Intuit Developer Dashboard

## The Problem You're Experiencing

After logging into QuickBooks, you're redirected to:
```
https://accounts.intuit.com/app/account-manager/overview
```

Instead of back to your site:
```
https://pcsmilesai.com/ConnectionsPage?qbo_connected=true
```

**This means the redirect URI is not configured in your Intuit Developer Dashboard.**

---

## Step-by-Step Instructions

### Step 1: Access Your Intuit Developer Dashboard

1. Open your browser and go to: **https://developer.intuit.com/app/developer/myapps**
2. Log in with your Intuit Developer account

### Step 2: Select Your Development App

You should see a list of your apps. Find and click on:

**App Name**: (Whatever you named it)  
**App ID**: `f1d4e557-d7ad-4dee-bf81-ff37987e833b`  
**Client ID**: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE`

> **Important**: Make sure you're selecting the NEW development app, NOT the old production app (Client ID: ABfG1MwE5yhkAAqCw0RA2viwkI9cMdn33oagtgGOaJWdrkRBVl)

### Step 3: Navigate to Keys & Credentials

In the left sidebar, click on:
- **"Keys & credentials"** or **"Settings"** (depending on the UI version)

### Step 4: Find Redirect URIs Section

Scroll down until you see a section called:
- **"Redirect URIs"**

You should see two tabs:
- **Development** (this is the one you need)
- **Production** (ignore this for now)

**Click on the "Development" tab**

### Step 5: Add the Redirect URI

In the Development tab, you should see an input field to add redirect URIs.

**Add this EXACT redirect URI** (copy-paste to avoid typos):
```
https://pcsmilesai.com/api/qbo/callback
```

**Critical Checks**:
- ✅ Starts with `https://` (NOT `http://`)
- ✅ Domain is `pcsmilesai.com` (NOT `www.pcsmilesai.com`)
- ✅ Path is `/api/qbo/callback` (all lowercase)
- ✅ NO trailing slash at the end (NOT `/api/qbo/callback/`)
- ✅ NO spaces before or after
- ✅ NO query parameters (NO `?` or `&`)

### Step 6: Remove Other Redirect URIs (Optional but Recommended)

If you see other redirect URIs in the Development tab, such as:
- OAuth Playground URLs
- Localhost URLs
- Test URLs

**Remove them** (at least temporarily) to avoid confusion. Intuit sometimes uses the first redirect URI in the list, so having only one ensures it uses the correct one.

### Step 7: Save Changes

1. Click the **"Save"** button at the bottom of the page
2. Wait for a confirmation message (usually a green banner saying "Changes saved successfully")
3. **Wait 1-2 minutes** for the changes to propagate through Intuit's systems

---

## Step 8: Test the OAuth Flow

After saving and waiting 1-2 minutes:

1. **Open a new incognito/private browser window**
2. Go to: **https://pcsmilesai.com/ConnectionsPage**
3. Click **"Connect QuickBooks"** or **"Reconnect"**
4. Log in to QuickBooks
5. Authorize the app

**Expected Result**:
- You should be redirected back to: `https://pcsmilesai.com/ConnectionsPage?qbo_connected=true`
- You should see a success message on the ConnectionsPage

**If it still redirects to Account Manager**:
- Double-check the redirect URI in the Intuit Developer Dashboard
- Make sure you clicked SAVE
- Make sure you're on the Development tab, not Production
- Try waiting another minute and test again

---

## Common Mistakes

### Mistake 1: Wrong Tab
❌ Adding the redirect URI to the **Production** tab instead of **Development**

✅ Make sure you're on the **Development** tab

### Mistake 2: Trailing Slash
❌ `https://pcsmilesai.com/api/qbo/callback/` (has trailing slash)

✅ `https://pcsmilesai.com/api/qbo/callback` (no trailing slash)

### Mistake 3: Wrong Protocol
❌ `http://pcsmilesai.com/api/qbo/callback` (http instead of https)

✅ `https://pcsmilesai.com/api/qbo/callback` (https)

### Mistake 4: Wrong Domain
❌ `https://www.pcsmilesai.com/api/qbo/callback` (has www)

✅ `https://pcsmilesai.com/api/qbo/callback` (no www)

### Mistake 5: Case Sensitivity
❌ `https://pcsmilesai.com/api/qbo/Callback` (capital C)

✅ `https://pcsmilesai.com/api/qbo/callback` (lowercase)

### Mistake 6: Not Saving
❌ Adding the redirect URI but forgetting to click Save

✅ Always click Save and wait for confirmation

---

## Troubleshooting

### Issue: "I don't see a 'Redirect URIs' section"

**Solution**: 
- Make sure you're in the correct app
- Try clicking on "Settings" or "App Settings" in the left sidebar
- The UI might look different depending on when your app was created

### Issue: "I added the redirect URI but it still doesn't work"

**Solution**:
1. Double-check the redirect URI character-by-character
2. Make sure you clicked Save
3. Wait 2-3 minutes for changes to propagate
4. Try in a fresh incognito window
5. Check the server logs for any error messages

### Issue: "I see multiple redirect URIs, which one is used?"

**Solution**:
- Intuit typically uses the redirect URI that matches what your app sends
- However, to be safe, remove all other redirect URIs and keep only the one you need
- You can always add them back later

---

## What Happens After Correct Configuration

Once the redirect URI is correctly configured:

1. User clicks "Connect QuickBooks" on your site
2. User is redirected to QuickBooks login
3. User logs in and authorizes the app
4. **QuickBooks redirects back to**: `https://pcsmilesai.com/api/qbo/callback?code=...&realmId=...&state=...`
5. Your callback endpoint exchanges the code for access tokens
6. Tokens are saved to the database
7. User is redirected to: `https://pcsmilesai.com/ConnectionsPage?qbo_connected=true`
8. ConnectionsPage shows "Connected" status

---

## Need Help?

If you've followed all the steps and it's still not working, please share:

1. **Screenshot** of the Redirect URIs section in your Intuit Developer Dashboard (Development tab)
2. **The exact URL** you're redirected to after QuickBooks login
3. **Server logs** from the OAuth attempt:
   ```bash
   ssh root@159.65.181.148 "pm2 logs pcs-ui --lines 100 | grep QBO"
   ```

---

## Quick Reference

**Your App Details**:
- App ID: `f1d4e557-d7ad-4dee-bf81-ff37987e833b`
- Client ID: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE`
- Environment: Development (Sandbox)

**Required Redirect URI**:
```
https://pcsmilesai.com/api/qbo/callback
```

**Dashboard URL**:
https://developer.intuit.com/app/developer/myapps

---

*Last Updated: October 30, 2025*

