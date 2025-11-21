#!/bin/bash
set -e

echo "=== Deploying Invoice Reassignment Fix ==="

# Step 1: Commit locally
echo "Step 1: Committing fix locally..."
cd /Users/BraxtonEllsworth/Desktop/pcs-ui
git add lib/invoices/reassignmentService.ts
git -c user.email="business@pcsmilesai.com" -c user.name="PCS AI" commit -m "fix: Correct reassignment targets extraction logic

- Fix bug in getReassignmentTargets() where find() result was incorrectly indexed
- find() returns a single element, not an array, so [0] was causing undefined
- Now correctly extracts manager email from office_managers configuration"

# Step 2: Push to GitHub
echo "Step 2: Pushing to GitHub..."
git push origin main

# Step 3: Pull on server
echo "Step 3: Pulling on server..."
ssh -o StrictHostKeyChecking=no root@159.65.181.148 "cd /var/www/pcs-ui && git pull origin main"

# Step 4: Rebuild
echo "Step 4: Rebuilding..."
ssh -o StrictHostKeyChecking=no root@159.65.181.148 "cd /var/www/pcs-ui && npm run build"

# Step 5: Restart
echo "Step 5: Restarting PM2..."
ssh -o StrictHostKeyChecking=no root@159.65.181.148 "pm2 restart pcs-ui"

echo "✅ Deployment complete!"

