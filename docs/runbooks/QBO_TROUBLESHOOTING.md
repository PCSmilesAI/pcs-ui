# QuickBooks Online Integration Troubleshooting Runbook

## Quick Health Check

```bash
# Check QBO configuration and token status
curl -s https://pcsmilesai.com/api/qbo/health | jq

# Check if tokens are available
curl -s https://pcsmilesai.com/api/qbo/env | jq
```

---

## Common Issues

### 1. "No QBO Tokens Available"

**Symptoms**: QBO health check shows `tokens.available: false`

**Diagnosis**:
```bash
# Check if user has authorized
sqlite3 /var/www/pcs-ui-data/pcs.db "SELECT * FROM qbo_tokens ORDER BY created_at DESC LIMIT 1;"

# Check token expiration
sqlite3 /var/www/pcs-ui-data/pcs.db "SELECT expires_at FROM qbo_tokens ORDER BY created_at DESC LIMIT 1;"
```

**Fix**:
1. User must authorize QBO connection
2. Go to: https://pcsmilesai.com/settings/qbo
3. Click "Connect to QuickBooks"
4. Complete OAuth flow
5. Verify: `curl -s https://pcsmilesai.com/api/qbo/health | jq '.tokens'`

---

### 2. Token Expired

**Symptoms**: QBO operations fail with `401 Unauthorized`

**Diagnosis**:
```bash
# Check token expiration
sqlite3 /var/www/pcs-ui-data/pcs.db \
  "SELECT expires_at, DATETIME('now') as now FROM qbo_tokens ORDER BY created_at DESC LIMIT 1;"
```

**Fix**:
1. Tokens auto-refresh if `FEATURE_QBO_TOKEN_REFRESH_ENABLED=true`
2. If not auto-refreshing, user must re-authorize
3. Go to: https://pcsmilesai.com/settings/qbo
4. Click "Reconnect to QuickBooks"

---

### 3. Redirect URI Mismatch

**Symptoms**: OAuth flow fails with `redirect_uri_mismatch`

**Diagnosis**:
```bash
# Check configured redirect URI
grep QBO_REDIRECT_URI /etc/environment

# Check what's in QBO app settings
# Go to: https://developer.intuit.com/app/developer/myapps
# Select app -> Settings -> Redirect URIs
```

**Fix**:
1. Ensure `QBO_REDIRECT_URI` matches exactly in both places
2. Must include protocol (https://) and path (/oauth/callback)
3. Update server if needed: `echo "QBO_REDIRECT_URI=https://pcsmilesai.com/oauth/callback" >> /etc/environment`
4. Restart: `pm2 restart pcs-ui --update-env`

---

### 4. Sandbox vs Production Mismatch

**Symptoms**: OAuth succeeds but API calls fail with `invalid_grant`

**Diagnosis**:
```bash
# Check QBO environment
grep QBO_ENV /etc/environment

# Check which realm ID is stored
sqlite3 /var/www/pcs-ui-data/pcs.db "SELECT realm_id FROM qbo_tokens ORDER BY created_at DESC LIMIT 1;"
```

**Fix**:
1. Ensure `QBO_ENV` matches the app environment (sandbox or production)
2. If switching environments, user must re-authorize
3. Update: `echo "QBO_ENV=production" >> /etc/environment`
4. Restart: `pm2 restart pcs-ui --update-env`

---

### 5. Bill Creation Fails

**Symptoms**: Logs show `[QBO] Bill creation failed`

**Diagnosis**:
```bash
# Check if bill creation is enabled
grep FEATURE_QBO_BILL_CREATION_ENABLED /etc/environment

# Check recent QBO API errors
pm2 logs pcs-ui --lines 100 | grep "QBO.*error"
```

**Fix**:
1. Verify feature flag: `FEATURE_QBO_BILL_CREATION_ENABLED=true`
2. Check QBO account has bill creation permission
3. Verify vendor is mapped to QBO vendor
4. Check invoice has required fields (vendor, amount, due_date)

---

## QBO Secret Rotation

**When**: After any suspected compromise or quarterly rotation

**Steps**:
1. Go to: https://developer.intuit.com/app/developer/myapps
2. Select app -> Settings -> Keys & OAuth
3. Generate new Client ID and Client Secret
4. Update server:
   ```bash
   echo "QBO_CLIENT_ID=..." >> /etc/environment
   echo "QBO_CLIENT_SECRET=..." >> /etc/environment
   ```
5. Restart: `pm2 restart pcs-ui --update-env`
6. User must re-authorize: https://pcsmilesai.com/settings/qbo

---

## Testing QBO Integration

```bash
# Test token refresh
curl -X POST https://pcsmilesai.com/api/qbo/refresh-token

# Test bill creation (if enabled)
curl -X POST https://pcsmilesai.com/api/qbo/test-bill \
  -H "Content-Type: application/json" \
  -d '{"vendorId":"...", "amount":100, "dueDate":"2025-12-31"}'
```

---

## Escalation

If issue persists:
1. Check QBO status page: https://status.intuit.com
2. Review QBO app logs: https://developer.intuit.com/app/developer/myapps -> Logs
3. Contact Intuit support with error details
4. Review full logs: `pm2 logs pcs-ui --lines 1000 | grep QBO`

