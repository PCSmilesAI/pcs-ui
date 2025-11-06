# 🔐 Quick Reference: Secret Rotation

**Print this page and keep it handy!**

---

## **The 7 Secrets You Need to Rotate**

| # | Secret Name | Generate How | Where to Update | Priority |
|---|-------------|--------------|-----------------|----------|
| 1 | SESSION_SECRET | `openssl rand -hex 32` | `/etc/environment` | 🔴 CRITICAL |
| 2 | ENCRYPTION_KEY | `openssl rand -hex 32` | `/etc/environment` | 🔴 CRITICAL |
| 3 | API_KEY_1 | `openssl rand -hex 32` | `/etc/environment` | 🔴 CRITICAL |
| 4 | API_KEY_2 | `openssl rand -hex 32` | `/etc/environment` | 🔴 CRITICAL |
| 5 | WEBHOOK_TOKEN | `openssl rand -hex 32` | `/etc/environment` | 🔴 CRITICAL |
| 6 | QBO_CLIENT_ID | Intuit Portal | `/etc/environment` | 🔴 CRITICAL |
| 7 | QBO_CLIENT_SECRET | Intuit Portal | `/etc/environment` | 🔴 CRITICAL |

---

## **Quick Steps**

### **For Secrets 1-5 (Generate Locally)**

```bash
# On your local machine, run 5 times:
openssl rand -hex 32

# Copy each output
# SSH to server
ssh root@159.65.181.148

# Edit environment
sudo nano /etc/environment

# Paste each new value
# Save: Ctrl+X, Y, Enter

# Reload
source /etc/environment

# Verify
echo $SESSION_SECRET
```

### **For Secrets 6-7 (QuickBooks)**

```bash
# 1. Go to: https://developer.intuit.com
# 2. Click your app
# 3. Go to "Keys & credentials"
# 4. Click "Regenerate" next to Client Secret
# 5. Copy new Client ID and Secret
# 6. SSH to server
ssh root@159.65.181.148

# 7. Edit environment
sudo nano /etc/environment

# 8. Update QBO_CLIENT_ID and QBO_CLIENT_SECRET
# 9. Save: Ctrl+X, Y, Enter

# 10. Reload
source /etc/environment
```

### **Final Step (All Secrets)**

```bash
# Restart app
pm2 restart pcs-ui --update-env

# Wait 5 seconds, then verify
pm2 logs pcs-ui | grep "CONFIG_OK"

# Should see: [CONFIG] ✅ CONFIG_OK: true
```

---

## **Verification Commands**

```bash
# Check all secrets loaded
env | grep -E 'SESSION_SECRET|ENCRYPTION_KEY|QBO_|API_KEY|WEBHOOK'

# Check app status
pm2 status

# Check app logs
pm2 logs pcs-ui

# Test health
curl -s https://pcsmilesai.com/api/health | jq

# Test ready
curl -s https://pcsmilesai.com/api/ready | jq

# Test QBO
curl -s https://pcsmilesai.com/api/qbo/health | jq
```

---

## **What Each Secret Does**

| Secret | Purpose | Risk |
|--------|---------|------|
| SESSION_SECRET | Signs user cookies | Attacker can impersonate any user |
| ENCRYPTION_KEY | Encrypts database data | Attacker can decrypt all data |
| API_KEY_1 | Internal API auth | Attacker can call internal APIs |
| API_KEY_2 | Internal API auth (backup) | Attacker can call internal APIs |
| WEBHOOK_TOKEN | Verifies webhooks | Attacker can forge webhook events |
| QBO_CLIENT_ID | QuickBooks OAuth ID | Attacker can access QB data |
| QBO_CLIENT_SECRET | QuickBooks OAuth secret | Attacker can access QB data |

---

## **Nano Editor Cheat Sheet**

```
Ctrl+X  = Exit
Y       = Yes (save)
Enter   = Confirm filename
Ctrl+O  = Save without exiting
Ctrl+K  = Cut line
Ctrl+U  = Paste line
Ctrl+W  = Find
```

---

## **Common Issues**

| Problem | Solution |
|---------|----------|
| App won't start | Check `pm2 logs pcs-ui` for missing secrets |
| Users logged out | Normal - SESSION_SECRET changed |
| QBO not working | Verify new credentials in Intuit portal |
| Secrets not loading | Run `source /etc/environment` again |

---

## **Timeline**

- **5 min:** Generate 5 random secrets locally
- **10 min:** Update QuickBooks credentials in Intuit portal
- **10 min:** SSH to server and update `/etc/environment`
- **5 min:** Restart app and verify
- **Total:** ~30 minutes

---

## **Checklist**

```
[ ] Generated SESSION_SECRET
[ ] Generated ENCRYPTION_KEY
[ ] Generated API_KEY_1
[ ] Generated API_KEY_2
[ ] Generated WEBHOOK_TOKEN
[ ] Regenerated QBO credentials
[ ] Updated /etc/environment
[ ] Reloaded environment
[ ] Restarted app
[ ] Verified CONFIG_OK: true
[ ] Tested health endpoints
```

---

## **Emergency Rollback**

If something breaks:

```bash
# SSH to server
ssh root@159.65.181.148

# Check git history
cd /var/www/pcs-ui
git log --oneline

# Revert to previous commit (if needed)
git revert <commit-hash>

# Or manually restore old secrets from backup
# (if you saved them)
```

---

**For detailed instructions, see:** `ROTATE_SECRETS_STEP_BY_STEP.md`

