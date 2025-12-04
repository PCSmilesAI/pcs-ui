---
type: "always_apply"
---

# CRITICAL DEPLOYMENT PROCESS

## Server Information
- **Production Server**: 137.184.183.253 (new droplet)
- **Old Server** (database backup source if needed): 159.65.181.148
- **Local Repo**: /Users/BraxtonEllsworth/Desktop/pcs-ui
- **Server Repo**: /var/www/pcs-ui
- **Server Database**: /var/www/pcs-ui/pcs_ui_data/pcs.db (NOT tracked by git)

## Standard Deployment Sequence

Every time you make code edits, follow this EXACT sequence:

### Step 1: Edit locally
```bash
cd /Users/BraxtonEllsworth/Desktop/pcs-ui
# Make your code edits
```

### Step 2: Build locally to verify no errors
```bash
npm run build
```

### Step 3: Commit and push to GitHub
```bash
git add -A
git commit -m "descriptive commit message"
git push origin main
```

### Step 4: Deploy to server (SAFE command that preserves database)
```bash
ssh root@137.184.183.253 "cd /var/www/pcs-ui && git pull origin main && npm run build && pm2 restart pcs-ui"
```

## ⚠️ CRITICAL: Database Protection

**NEVER use these commands on the server** - they can overwrite the database:
- `git stash` (stashes db files, then pull replaces them)
- `git checkout -- .` (reverts all files including db)
- `git reset --hard` (destroys local changes including db)

**If git pull fails due to local changes:**
1. First, backup the database:
   ```bash
   ssh root@137.184.183.253 "cp /var/www/pcs-ui/pcs_ui_data/pcs.db /tmp/pcs_backup_$(date +%Y%m%d_%H%M%S).db"
   ```

2. Then do the pull (db files are in .gitignore so won't be affected):
   ```bash
   ssh root@137.184.183.253 "cd /var/www/pcs-ui && git checkout -- . && git pull origin main && npm run build && pm2 restart pcs-ui"
   ```

3. Verify database is intact:
   ```bash
   ssh root@137.184.183.253 "sqlite3 /var/www/pcs-ui/pcs_ui_data/pcs.db 'SELECT COUNT(*) FROM invoices; SELECT COUNT(*) FROM invoice_categories;'"
   ```

## Database Recovery (if database gets corrupted/overwritten)

The old server (159.65.181.148) has a backup of the correct database.

### Recovery Steps:
```bash
# 1. Checkpoint WAL on old server to merge changes into main db file
ssh root@159.65.181.148 "sqlite3 /var/www/pcs-ui-data/pcs.db 'PRAGMA wal_checkpoint(TRUNCATE);'"

# 2. Copy from old server to local
scp root@159.65.181.148:/var/www/pcs-ui-data/pcs.db /tmp/correct_pcs.db

# 3. Verify the backup has correct data
sqlite3 /tmp/correct_pcs.db "SELECT COUNT(*) FROM invoices; SELECT COUNT(*) FROM invoice_categories;"
# Should show 1200+ invoices and 1200+ categories

# 4. Stop server, upload, restart
ssh root@137.184.183.253 "pm2 stop pcs-ui"
scp /tmp/correct_pcs.db root@137.184.183.253:/var/www/pcs-ui/pcs_ui_data/pcs.db
ssh root@137.184.183.253 "chmod 644 /var/www/pcs-ui/pcs_ui_data/pcs.db && pm2 start pcs-ui"

# 5. Verify restoration
ssh root@137.184.183.253 "sqlite3 /var/www/pcs-ui/pcs_ui_data/pcs.db 'SELECT COUNT(*) FROM invoices; SELECT COUNT(*) FROM invoice_categories;'"
```

## Files NOT tracked by git (in .gitignore)
- `pcs_ui_data/pcs.db*` - Main database files
- `pcs_ai_data/` - AI/queue data
- `email_invoices/` - Invoice PDFs
- `output_jsons/` - Parsed JSON files

## Quick Health Check
```bash
# Check server status
ssh root@137.184.183.253 "pm2 status && sqlite3 /var/www/pcs-ui/pcs_ui_data/pcs.db 'SELECT COUNT(*) as invoices FROM invoices;'"
```

