# PCS UI Operations Runbook

## System Health Checks

### Quick Status

```bash
# Check all health endpoints
curl -s https://pcsmilesai.com/api/health | jq
curl -s https://pcsmilesai.com/api/ready | jq
curl -s https://pcsmilesai.com/api/qbo/health | jq
curl -s https://pcsmilesai.com/api/stripe/status | jq
```

### Detailed Diagnostics

```bash
# SSH to server
ssh root@159.65.181.148

# Check PM2 status
pm2 status
pm2 logs pcs-ui --lines 50

# Check database
sqlite3 /var/www/pcs-ui-data/pcs.db ".tables"
sqlite3 /var/www/pcs-ui-data/pcs.db "SELECT COUNT(*) FROM invoices;"

# Check disk space
df -h /var/www/pcs-ui-data

# Check environment variables
grep -E "STRIPE|QBO|SESSION" /etc/environment
```

---

## Deployment

### Standard Deployment

```bash
# Local machine
cd /Desktop/pcs-ui
git add -A
git commit -m "Your message"
git push origin main

# Server
ssh root@159.65.181.148
cd /var/www/pcs-ui
git pull origin main
npm run build
pm2 restart pcs-ui --update-env

# Verify
curl -s https://pcsmilesai.com/api/ready | jq '.ready'
```

### Rollback

```bash
# If deployment fails
ssh root@159.65.181.148
cd /var/www/pcs-ui
git log --oneline -5
git revert <commit-hash>
npm run build
pm2 restart pcs-ui --update-env
```

---

## Environment Variable Management

### View Current Secrets

```bash
ssh root@159.65.181.148
grep -E "STRIPE|QBO|SESSION|ENCRYPTION" /etc/environment
```

### Update a Secret

```bash
ssh root@159.65.181.148

# Edit /etc/environment
nano /etc/environment

# Or append
echo "NEW_VAR=value" >> /etc/environment

# Reload
source /etc/environment

# Restart app
pm2 restart pcs-ui --update-env

# Verify
pm2 logs pcs-ui --lines 10 | grep CONFIG
```

### Rotate All Secrets

```bash
# 1. Generate new secrets
# - Stripe: https://dashboard.stripe.com/apikeys
# - QBO: https://developer.intuit.com/app/developer/myapps
# - Session: openssl rand -hex 32
# - Encryption: openssl rand -hex 32

# 2. Update server
ssh root@159.65.181.148
nano /etc/environment
# Update all secrets

# 3. Restart
pm2 restart pcs-ui --update-env

# 4. Verify
curl -s https://pcsmilesai.com/api/ready | jq
```

---

## Database Maintenance

### Backup Database

```bash
ssh root@159.65.181.148
cp /var/www/pcs-ui-data/pcs.db /var/www/pcs-ui-data/pcs.db.backup.$(date +%Y%m%d)
```

### Check Database Integrity

```bash
ssh root@159.65.181.148
sqlite3 /var/www/pcs-ui-data/pcs.db "PRAGMA integrity_check;"
```

### Vacuum Database

```bash
ssh root@159.65.181.148
sqlite3 /var/www/pcs-ui-data/pcs.db "VACUUM;"
```

---

## Troubleshooting

### App Won't Start

```bash
# Check logs
pm2 logs pcs-ui --lines 100

# Check for config errors
pm2 logs pcs-ui | grep CONFIG

# Check environment variables
grep -E "SESSION_SECRET|ENCRYPTION_KEY" /etc/environment

# Restart
pm2 restart pcs-ui --update-env
```

### High Memory Usage

```bash
# Check memory
pm2 monit

# Restart app
pm2 restart pcs-ui

# Check for memory leaks in logs
pm2 logs pcs-ui | grep -i "memory\|leak"
```

### Database Locked

```bash
# Check for stuck processes
sqlite3 /var/www/pcs-ui-data/pcs.db ".open"

# Restart app
pm2 restart pcs-ui

# If still locked, check file permissions
ls -la /var/www/pcs-ui-data/pcs.db
```

### Slow Queries

```bash
# Enable query logging
sqlite3 /var/www/pcs-ui-data/pcs.db "PRAGMA query_only=OFF;"

# Check slow queries
pm2 logs pcs-ui | grep "duration_ms" | sort -t: -k2 -rn | head -10
```

---

## Emergency Procedures

### Kill Switch (Disable All Risky Operations)

```bash
ssh root@159.65.181.148
nano /etc/environment

# Add these lines
FEATURE_QBO_SYNC_ENABLED=false
FEATURE_STRIPE_WEBHOOKS_ENABLED=false
FEATURE_EMAIL_INGESTION_ENABLED=false
FEATURE_INVOICE_AUTO_APPROVAL_ENABLED=false

pm2 restart pcs-ui --update-env
```

### Restart Application

```bash
ssh root@159.65.181.148
pm2 restart pcs-ui
pm2 logs pcs-ui --lines 20
```

### Full System Restart

```bash
ssh root@159.65.181.148
pm2 kill
pm2 start ecosystem.config.js
pm2 logs pcs-ui --lines 20
```

---

## Monitoring

### Set Up Alerts

```bash
# Check health every 5 minutes
*/5 * * * * curl -s https://pcsmilesai.com/api/ready | jq -e '.ready' || alert "PCS UI not ready"

# Check database every hour
0 * * * * sqlite3 /var/www/pcs-ui-data/pcs.db "PRAGMA integrity_check;" | grep -v "ok" || alert "Database integrity check failed"
```

### Log Aggregation

```bash
# View recent errors
pm2 logs pcs-ui --err

# Search logs
pm2 logs pcs-ui | grep "ERROR\|FATAL"

# Export logs
pm2 logs pcs-ui > /tmp/pcs-ui-logs.txt
```

