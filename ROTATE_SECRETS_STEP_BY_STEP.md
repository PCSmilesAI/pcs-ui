# 🔐 Step-by-Step Secret Rotation Guide

**Time Required:** 30-45 minutes  
**Difficulty:** Medium  
**Risk:** Low (if done correctly)

---

## **Secret 1: SESSION_SECRET**

**What it does:** Signs user session cookies. If compromised, attacker can forge sessions and impersonate any user.

### **Step 1.1: Generate New SESSION_SECRET**

Run this on your local machine:

```bash
openssl rand -hex 32
```

**Output example:**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2c3d4
```

**Copy this value** - you'll need it in the next step.

### **Step 1.2: Update Server Environment**

SSH into the production server:

```bash
ssh root@159.65.181.148
```

Edit the environment file:

```bash
sudo nano /etc/environment
```

Find the line with `SESSION_SECRET` and replace it with your new value:

```bash
# OLD (delete this line):
SESSION_SECRET="3e10b131d772430f721b24388bb92fa978d037e82ecdd193d2e8264e50050705523375eb75ab514c05b60d7abf70254bde11743609faa0f28eb53520c773327f"

# NEW (add this line):
SESSION_SECRET="a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a1b2c3d4"
```

**Save and exit:** Press `Ctrl+X`, then `Y`, then `Enter`

### **Step 1.3: Reload Environment**

```bash
source /etc/environment
```

**Verify it loaded:**

```bash
echo $SESSION_SECRET
```

Should output your new value.

---

## **Secret 2: ENCRYPTION_KEY**

**What it does:** Encrypts sensitive data in the database. If compromised, attacker can decrypt all encrypted fields.

### **Step 2.1: Generate New ENCRYPTION_KEY**

Run this on your local machine:

```bash
openssl rand -hex 32
```

**Output example:**
```
z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f9e8d7c6b5a4z9y8x7w6
```

**Copy this value.**

### **Step 2.2: Update Server Environment**

SSH into the production server (if not already connected):

```bash
ssh root@159.65.181.148
```

Edit the environment file:

```bash
sudo nano /etc/environment
```

Find the line with `ENCRYPTION_KEY` and replace it:

```bash
# OLD (delete this line):
ENCRYPTION_KEY="36e81c4fa793c1673df8d6dd6c6db856e668ae198d28fae458fcb295ce7d4f5c"

# NEW (add this line):
ENCRYPTION_KEY="z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f9e8d7c6b5a4z9y8x7w6"
```

**Save and exit:** Press `Ctrl+X`, then `Y`, then `Enter`

### **Step 2.3: Reload Environment**

```bash
source /etc/environment
```

**Verify it loaded:**

```bash
echo $ENCRYPTION_KEY
```

---

## **Secret 3: API_KEY_1**

**What it does:** Internal API authentication. If compromised, attacker can call internal APIs.

### **Step 3.1: Generate New API_KEY_1**

Run this on your local machine:

```bash
openssl rand -hex 32
```

**Output example:**
```
f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0
```

**Copy this value.**

### **Step 3.2: Update Server Environment**

SSH into the production server:

```bash
ssh root@159.65.181.148
```

Edit the environment file:

```bash
sudo nano /etc/environment
```

Add this line (if it doesn't exist):

```bash
API_KEY_1="f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0"
```

**Save and exit:** Press `Ctrl+X`, then `Y`, then `Enter`

### **Step 3.3: Reload Environment**

```bash
source /etc/environment
echo $API_KEY_1
```

---

## **Secret 4: API_KEY_2**

**What it does:** Internal API authentication (second key for rotation). If compromised, attacker can call internal APIs.

### **Step 4.1: Generate New API_KEY_2**

Run this on your local machine:

```bash
openssl rand -hex 32
```

**Output example:**
```
p0o9n8m7l6k5j4i3h2g1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1
```

**Copy this value.**

### **Step 4.2: Update Server Environment**

SSH into the production server:

```bash
ssh root@159.65.181.148
```

Edit the environment file:

```bash
sudo nano /etc/environment
```

Add this line (if it doesn't exist):

```bash
API_KEY_2="p0o9n8m7l6k5j4i3h2g1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1"
```

**Save and exit:** Press `Ctrl+X`, then `Y`, then `Enter`

### **Step 4.3: Reload Environment**

```bash
source /etc/environment
echo $API_KEY_2
```

---

## **Secret 5: WEBHOOK_TOKEN**

**What it does:** Verifies webhook signatures from payment processors. If compromised, attacker can forge webhook events.

### **Step 5.1: Generate New WEBHOOK_TOKEN**

Run this on your local machine:

```bash
openssl rand -hex 32
```

**Output example:**
```
w1e2b3h4o5o6k7t8o9k0e1n2t3o4k5e6n7t8w9a0s1h2e3d4f5g6h7i8j9k0
```

**Copy this value.**

### **Step 5.2: Update Server Environment**

SSH into the production server:

```bash
ssh root@159.65.181.148
```

Edit the environment file:

```bash
sudo nano /etc/environment
```

Add this line (if it doesn't exist):

```bash
WEBHOOK_TOKEN="w1e2b3h4o5o6k7t8o9k0e1n2t3o4k5e6n7t8w9a0s1h2e3d4f5g6h7i8j9k0"
```

**Save and exit:** Press `Ctrl+X`, then `Y`, then `Enter`

### **Step 5.3: Reload Environment**

```bash
source /etc/environment
echo $WEBHOOK_TOKEN
```

---

## **Secret 6 & 7: QBO_CLIENT_ID & QBO_CLIENT_SECRET**

**What they do:** QuickBooks OAuth credentials. If compromised, attacker can access all QuickBooks data.

### **Step 6.1: Generate New QuickBooks OAuth Credentials**

1. Go to [Intuit Developer Portal](https://developer.intuit.com)
2. Sign in with your account
3. Click on your app name
4. Go to **Keys & credentials** section
5. Under **Production** (or **Sandbox** if testing):
   - Find your current Client ID and Client Secret
   - Click **Regenerate** next to Client Secret
   - **Copy the new Client Secret** (you won't see it again!)
   - The Client ID should remain the same (or regenerate if needed)

**You should now have:**
- New `QBO_CLIENT_ID` (if you regenerated it)
- New `QBO_CLIENT_SECRET` (definitely new)

### **Step 6.2: Update Server Environment**

SSH into the production server:

```bash
ssh root@159.65.181.148
```

Edit the environment file:

```bash
sudo nano /etc/environment
```

Update these lines with your new values from Intuit:

```bash
# OLD (delete these lines):
QBO_CLIENT_ID="AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE"
QBO_CLIENT_SECRET="SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74"

# NEW (add these lines):
QBO_CLIENT_ID="<your-new-client-id>"
QBO_CLIENT_SECRET="<your-new-client-secret>"
```

**Save and exit:** Press `Ctrl+X`, then `Y`, then `Enter`

### **Step 6.3: Reload Environment**

```bash
source /etc/environment
```

**Verify they loaded:**

```bash
echo $QBO_CLIENT_ID
echo $QBO_CLIENT_SECRET
```

---

## **Final Step: Restart Application**

Once ALL secrets are updated, restart the app:

```bash
pm2 restart pcs-ui --update-env
```

**Wait 5-10 seconds for restart.**

**Verify startup:**

```bash
pm2 logs pcs-ui | grep "CONFIG_OK"
```

Should see:
```
[CONFIG] ✅ CONFIG_OK: true
```

---

## **Verification: Test Everything Works**

### **Test 1: Health Check**

```bash
curl -s https://pcsmilesai.com/api/health | jq
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "2025-11-06T..."
}
```

### **Test 2: Ready Check**

```bash
curl -s https://pcsmilesai.com/api/ready | jq
```

Should return:
```json
{
  "ready": true,
  "database": "ok",
  "config": "ok"
}
```

### **Test 3: QBO Health**

```bash
curl -s https://pcsmilesai.com/api/qbo/health | jq
```

Should return:
```json
{
  "status": "ok",
  "qbo": "connected"
}
```

---

## **Troubleshooting**

### **Problem: "CONFIG_OK: false" or app won't start**

**Solution:**
```bash
# Check which secrets are missing
pm2 logs pcs-ui

# Verify all secrets are set
env | grep -E 'SESSION_SECRET|ENCRYPTION_KEY|QBO_|API_KEY|WEBHOOK'

# If missing, edit /etc/environment again
sudo nano /etc/environment
source /etc/environment

# Restart
pm2 restart pcs-ui --update-env
```

### **Problem: Users getting logged out**

**Expected behavior** - This is normal after rotating SESSION_SECRET. Users will need to log in again.

### **Problem: QuickBooks integration not working**

**Solution:**
1. Verify new QBO credentials are correct in Intuit portal
2. Check they're set on server: `echo $QBO_CLIENT_ID`
3. Restart app: `pm2 restart pcs-ui --update-env`
4. Check logs: `pm2 logs pcs-ui`

---

## **Checklist**

- [ ] Generated SESSION_SECRET
- [ ] Generated ENCRYPTION_KEY
- [ ] Generated API_KEY_1
- [ ] Generated API_KEY_2
- [ ] Generated WEBHOOK_TOKEN
- [ ] Regenerated QBO_CLIENT_SECRET in Intuit portal
- [ ] Updated all 7 secrets in `/etc/environment`
- [ ] Reloaded environment: `source /etc/environment`
- [ ] Restarted app: `pm2 restart pcs-ui --update-env`
- [ ] Verified CONFIG_OK: true
- [ ] Tested health endpoints
- [ ] Tested QBO integration

---

**Status:** ⏳ Ready to rotate  
**Time:** ~30-45 minutes  
**Risk:** Low (if done correctly)

