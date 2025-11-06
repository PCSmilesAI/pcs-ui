# 🔐 Secrets That Need to Be Rotated

**Status:** ⚠️ CRITICAL - All these secrets are exposed in Git history and must be rotated immediately.

---

## **Secrets Exposed (Must Rotate)**

### **1. QuickBooks OAuth Credentials**
- **QBO_CLIENT_ID**: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE`
- **QBO_CLIENT_SECRET**: `SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74`
- **Where exposed**: `deploy-droplet.sh` (now removed)
- **What it does**: Allows access to QuickBooks API
- **Risk**: Attacker can read/modify all QuickBooks data

### **2. Session Secret**
- **SESSION_SECRET**: `3e10b131d772430f721b24388bb92fa978d037e82ecdd193d2e8264e50050705523375eb75ab514c05b60d7abf70254bde11743609faa0f28eb53520c773327f`
- **Where exposed**: `production-secrets.txt` (now deleted)
- **What it does**: Signs user session cookies
- **Risk**: Attacker can forge user sessions and impersonate anyone

### **3. Encryption Key**
- **ENCRYPTION_KEY**: `36e81c4fa793c1673df8d6dd6c6db856e668ae198d28fae458fcb295ce7d4f5c`
- **Where exposed**: `production-secrets.txt` (now deleted)
- **What it does**: Encrypts sensitive data in database
- **Risk**: Attacker can decrypt all encrypted data

### **4. API Keys**
- **API_KEY_1**: `2c2774895ae438e86c71f7efe5ca9f5f326621c1df399f2d0a4fa7ed124724ba`
- **API_KEY_2**: `d156f77282cef33af3a906c6af137f67bb33b6fd26913a406116a9d6ca779d8a`
- **Where exposed**: `production-secrets.txt` (now deleted)
- **What it does**: Internal API authentication
- **Risk**: Attacker can call internal APIs

### **5. Webhook Token**
- **WEBHOOK_TOKEN**: `a8d2b999f429de47d9446316796a07c488566196377816ddba7e0f014beb1f8a`
- **Where exposed**: `production-secrets.txt` (now deleted)
- **What it does**: Verifies webhook signatures
- **Risk**: Attacker can forge webhook events

---

## **Rotation Steps**

### **Step 1: Generate New Secrets**

```bash
# Generate new SESSION_SECRET (64 hex chars)
openssl rand -hex 32

# Generate new ENCRYPTION_KEY (64 hex chars)
openssl rand -hex 32

# Generate new API_KEY_1 (64 hex chars)
openssl rand -hex 32

# Generate new API_KEY_2 (64 hex chars)
openssl rand -hex 32

# Generate new WEBHOOK_TOKEN (64 hex chars)
openssl rand -hex 32
```

### **Step 2: Rotate QuickBooks OAuth**

1. Go to [Intuit Developer Portal](https://developer.intuit.com)
2. Navigate to your app settings
3. Regenerate OAuth credentials:
   - Generate new `Client ID`
   - Generate new `Client Secret`
4. Note the new values

### **Step 3: Update Server Environment**

SSH into production server:

```bash
ssh root@159.65.181.148

# Edit environment file
sudo nano /etc/environment

# Add/update these with NEW values:
SESSION_SECRET="<new-64-char-hex>"
ENCRYPTION_KEY="<new-64-char-hex>"
QBO_CLIENT_ID="<new-qbo-id>"
QBO_CLIENT_SECRET="<new-qbo-secret>"
API_KEY_1="<new-64-char-hex>"
API_KEY_2="<new-64-char-hex>"
WEBHOOK_TOKEN="<new-64-char-hex>"

# Save and exit (Ctrl+X, Y, Enter)

# Reload environment
source /etc/environment

# Verify secrets loaded
echo $SESSION_SECRET
echo $ENCRYPTION_KEY
```

### **Step 4: Restart Application**

```bash
# On the server
pm2 restart pcs-ui --update-env

# Verify startup
pm2 logs pcs-ui | grep "CONFIG_OK"
```

### **Step 5: Verify Everything Works**

```bash
# Test health endpoint
curl -s https://pcsmilesai.com/api/health | jq

# Test ready endpoint
curl -s https://pcsmilesai.com/api/ready | jq

# Test QBO health
curl -s https://pcsmilesai.com/api/qbo/health | jq
```

---

## **What's Already Fixed**

✅ **ecosystem.config.js** - No hardcoded secrets, validates environment variables  
✅ **start-production.sh** - No hardcoded secrets, loads from `/etc/environment`  
✅ **deploy-droplet.sh** - Removed hardcoded QBO credentials  
✅ **production-secrets.txt** - Deleted from Git  

---

## **Important Notes**

- **Never commit secrets to Git** - They're visible in history forever
- **Always use environment variables** - Secrets should only be in `/etc/environment`
- **Rotate regularly** - Every 90 days minimum
- **Audit access** - Log who accessed what secrets
- **Use a secret manager** - Consider AWS Secrets Manager or HashiCorp Vault for better security

---

## **Timeline**

- **Now**: Review this document
- **Next 1-2 hours**: Rotate all secrets
- **After**: Verify all systems working
- **Then**: Monitor for any issues

**Status**: ⏳ Awaiting secret rotation

