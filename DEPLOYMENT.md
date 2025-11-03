# PCS UI Deployment Guide

This document provides step-by-step instructions for deploying the PCS UI application to the production server.

## Server Information

- **Server IP**: `159.65.181.148`
- **Application Path**: `/var/www/pcs-ui`
- **Port**: `3000` (proxied through Nginx)
- **Domain**: `pcsmilesai.com`

## Prerequisites

- SSH access to the server
- Git repository access
- PM2 installed on the server
- Nginx configured and running

---

## Quick Deployment (Zero-Downtime)

For typical deployments with code changes:

```bash
ssh root@159.65.181.148 "
  set -e
  cd /var/www/pcs-ui
  git pull --rebase
  npm ci
  npm run build
  pm2 restart pcs-ui --update-env
  nginx -t && systemctl reload nginx
"
```

---

## Step-by-Step Deployment

### 1. Connect to the Server

```bash
ssh root@159.65.181.148
cd /var/www/pcs-ui
```

### 2. Pull Latest Code

If using git:

```bash
git fetch --all
git checkout main
git pull --rebase
```

**Note**: If you have local changes that conflict:

```bash
# Stash local changes
git stash push -m "Deployment stash - $(date +%Y%m%d-%H%M%S)"

# Then pull
git pull --rebase

# Optionally restore stashed changes later
git stash list
git stash pop
```

### 3. Install Dependencies

```bash
npm ci
```

**Note**: `npm ci` is preferred over `npm install` for production as it:
- Installs exact versions from `package-lock.json`
- Removes `node_modules` before installing
- Ensures consistent builds

### 4. Build the Application

```bash
npm run build
```

This creates an optimized production build in the `.next` directory.

### 5. Set/Update Environment Variables

Environment variables can be set in:
- `ecosystem.config.js` (preferred for PM2-managed env)
- `.env` or `.env.local` files

**Key QuickBooks OAuth Variables**:

```bash
export QBO_ENVIRONMENT=sandbox
export QBO_CLIENT_ID=xxxx
export QBO_CLIENT_SECRET=xxxx
export QBO_REDIRECT_URI=https://pcsmilesai.com/api/qbo/callback
export QBO_SCOPES=com.intuit.quickbooks.accounting
```

If you edit `ecosystem.config.js`, use `--update-env` flag when restarting PM2.

### 6. Start or Restart with PM2

**First time deployment**:

```bash
pm2 start ecosystem.config.js --env production
```

**Subsequent deployments**:

```bash
pm2 restart pcs-ui --update-env
```

**Alternative (using npm script)**:

```bash
pm2 start "npm run start" --name pcs-ui
pm2 restart pcs-ui --update-env
```

### 7. Verify Deployment

**Check PM2 status**:

```bash
pm2 status
pm2 logs pcs-ui --lines 50
```

**Health checks**:

```bash
# Check local application
curl -I http://localhost:3000 | head -5

# Check live site
curl -I https://pcsmilesai.com | head -5
```

### 8. Nginx Configuration

Nginx should already be configured to proxy to `localhost:3000`.

**Verify Nginx config**:

```bash
grep -A3 -B3 'proxy_pass' /etc/nginx/sites-available/pcsmilesai.com
```

**Ensure site is enabled**:

```bash
ln -sf /etc/nginx/sites-available/pcsmilesai.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## Common Issues and Fixes

### 502 Bad Gateway from Nginx

**Symptoms**: Nginx returns 502 error

**Diagnosis**:

```bash
# Check if app is running on port 3000
curl -s http://localhost:3000 | head

# Check Nginx upstream configuration
grep 'proxy_pass' /etc/nginx/sites-available/pcsmilesai.com
```

**Fix**:

```bash
# Restart the application
pm2 restart pcs-ui

# Reload Nginx
nginx -t && systemctl reload nginx
```

### Environment Variables Not Updating

**Symptoms**: Changes to environment variables don't take effect

**Fix**:

```bash
pm2 restart pcs-ui --update-env
```

**Verify**:
Add a temporary API route that logs `process.env.QBO_CLIENT_ID` to confirm values.

### Next.js "Could not find a production build"

**Symptoms**: Error about missing production build

**Fix**:

```bash
npm run build
npm run start
```

### Cache Issues After Big Changes

**Symptoms**: Old code still running after deployment

**Fix**:

```bash
rm -rf .next
npm run build
pm2 restart pcs-ui --update-env
```

### TypeScript Build Errors

**Symptoms**: Build fails with TypeScript errors

**Fix**:

1. Check the error message for the specific file and line
2. Fix the TypeScript error in the code
3. Rebuild: `npm run build`

### Git Conflicts During Pull

**Symptoms**: `git pull` fails due to local changes

**Fix**:

```bash
# Stash local changes
git stash push -m "Pre-deployment stash"

# Pull latest code
git pull --rebase

# If needed, restore stashed changes
git stash pop
```

---

## PM2 Commands Reference

```bash
# Start application
pm2 start ecosystem.config.js --env production

# Restart application
pm2 restart pcs-ui

# Restart with updated environment variables
pm2 restart pcs-ui --update-env

# Stop application
pm2 stop pcs-ui

# View logs
pm2 logs pcs-ui
pm2 logs pcs-ui --lines 100
pm2 logs pcs-ui --lines 50 --nostream

# View status
pm2 status

# Monitor resources
pm2 monit

# Save PM2 process list (for auto-restart on reboot)
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

---

## Rollback Procedure

If a deployment causes issues:

```bash
# 1. Check git log to find previous working commit
git log --oneline -10

# 2. Checkout previous commit
git checkout <commit-hash>

# 3. Rebuild and restart
npm ci
npm run build
pm2 restart pcs-ui --update-env
```

---

## Monitoring and Logs

**View application logs**:

```bash
pm2 logs pcs-ui --lines 100
```

**View Nginx logs**:

```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

**Check disk space**:

```bash
df -h
```

**Check memory usage**:

```bash
free -h
```

---

## Security Notes

- Never commit `.env` files with sensitive credentials
- Keep `QBO_CLIENT_SECRET` secure
- Regularly update dependencies: `npm audit fix`
- Keep server packages updated: `apt update && apt upgrade`

---

## Contact

For deployment issues or questions, contact the development team.

**Last Updated**: October 30, 2025

