# 🚨 SECURITY INCIDENT: Hardcoded Secrets Exposed

**Date:** November 6, 2025  
**Severity:** CRITICAL  
**Status:** REMEDIATED (secrets stripped from code)  
**Action Required:** IMMEDIATE secret rotation

## What Happened

Hardcoded secrets were found in the following files:
- `ecosystem.config.js` (now fixed)
- `start-production.sh` (now fixed)
- `production-secrets.txt` (should be deleted)

These files were committed to the Git repository and are visible in the public GitHub repository.

## Exposed Secrets

The following secrets were exposed and **MUST be rotated immediately**:

1. **QuickBooks OAuth**
   - `QBO_CLIENT_ID`: `AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE`
   - `QBO_CLIENT_SECRET`: `SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74`

2. **Session & Encryption Keys**
   - `SESSION_SECRET`: `3e10b131d772430f721b24388bb92fa978d037e82ecdd193d2e8264e50050705523375eb75ab514c05b60d7abf70254bde11743609faa0f28eb53520c773327f`
   - `ENCRYPTION_KEY`: `36e81c4fa793c1673df8d6dd6c6db856e668ae198d28fae458fcb295ce7d4f5c`

3. **Webhook Tokens**
   - `WEBHOOK_VERIFICATION_TOKEN`: `a8d2b999f429de47d9446316796a07c488566196377816ddba7e0f014beb1f8a`
   - `WEBHOOK_SIGNATURE_KEY`: `a8d2b999f429de47d9446316796a07c488566196377816ddba7e0f014beb1f8a`

4. **API Keys**
   - `API_KEY_1`: `2c2774895ae438e86c71f7efe5ca9f5f326621c1df399f2d0a4fa7ed124724ba`
   - `API_KEY_2`: `d156f77282cef33af3a906c6af137f67bb33b6fd26913a406116a9d6ca779d8a`

## Immediate Actions (Do This Now)

### 1. Rotate QuickBooks OAuth Credentials

1. Go to [Intuit Developer Portal](https://developer.intuit.com)
2. Navigate to your app settings
3. Regenerate OAuth credentials:
   - Generate new `Client ID`
   - Generate new `Client Secret`
4. Update redirect URI if needed: `https://pcsmilesai.com/api/qbo/callback`
5. Save new credentials to `/etc/environment` on the server

### 2. Rotate Session & Encryption Keys

Generate new secure keys:

```bash
# Generate new SESSION_SECRET (64 chars)
openssl rand -hex 32

# Generate new ENCRYPTION_KEY (64 chars)
openssl rand -hex 32
```

Update `/etc/environment` on the server with new values.

### 3. Rotate Stripe Secrets (if applicable)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to API Keys
3. Regenerate Secret Key
4. Update `/etc/environment` on the server

### 4. Rotate SendGrid API Key (if applicable)

1. Go to [SendGrid Settings](https://app.sendgrid.com/settings/api_keys)
2. Delete the old API key
3. Create a new API key
4. Update `/etc/environment` on the server

### 5. Update Server Environment

SSH into the production server and update `/etc/environment`:

```bash
ssh root@159.65.181.148

# Edit the environment file
sudo nano /etc/environment

# Add/update these variables with NEW values:
SESSION_SECRET="<new-value>"
ENCRYPTION_KEY="<new-value>"
QBO_CLIENT_ID="<new-value>"
QBO_CLIENT_SECRET="<new-value>"
STRIPE_SECRET_KEY="<new-value>"
STRIPE_WEBHOOK_SECRET="<new-value>"
SENDGRID_API_KEY="<new-value>"

# Save and exit (Ctrl+X, Y, Enter)

# Reload environment
source /etc/environment

# Verify secrets are loaded
env | grep -E 'SESSION_SECRET|ENCRYPTION_KEY|QBO_'
```

### 6. Restart Application

```bash
# On the server
pm2 restart pcs-ui --update-env

# Verify startup
pm2 logs pcs-ui | grep "CONFIG_OK"
```

### 7. Delete Sensitive Files

```bash
# Remove the production-secrets.txt file
rm production-secrets.txt

# Commit the deletion
git add -A
git commit -m "chore: Remove production-secrets.txt"
git push origin main
```

## Verification

After rotation, verify everything is working:

```bash
# Check health endpoint
curl -s https://pcsmilesai.com/api/health | jq

# Check ready endpoint
curl -s https://pcsmilesai.com/api/ready | jq

# Check QBO health
curl -s https://pcsmilesai.com/api/qbo/health | jq

# Test Stripe webhook (if applicable)
# Use Stripe CLI to trigger a test event

# Test SendGrid (if applicable)
# Send a test email through the app
```

## Prevention

Going forward:

1. **Never commit secrets** to Git
2. **Use environment variables** for all secrets
3. **Use `/etc/environment`** on production servers
4. **Use a secret manager** (AWS Secrets Manager, HashiCorp Vault, etc.) for better security
5. **Enable pre-commit hooks** to prevent secret commits:

```bash
# Install pre-commit
pip install pre-commit

# Add to .pre-commit-config.yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
```

## Code Changes

The following changes have been made to prevent this in the future:

1. **ecosystem.config.js**: Removed all hardcoded secrets, added validation
2. **start-production.sh**: Removed all hardcoded secrets, loads from `/etc/environment`
3. **lib/config/env.ts**: New secure config loader that validates environment variables

## Questions?

If you have questions about this incident or the remediation steps, please contact the security team.

---

**Status:** ✅ Code remediated | ⏳ Awaiting secret rotation | ⏳ Awaiting server restart

