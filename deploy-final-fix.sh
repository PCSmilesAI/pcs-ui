#!/bin/bash
set -e

echo "=== Deploying fix to production server ==="

# Pull latest code
echo "Pulling latest code..."
ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=no root@159.65.181.148 'cd /var/www/pcs-ui && git pull origin main'

# Rebuild
echo "Rebuilding..."
ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=no root@159.65.181.148 'cd /var/www/pcs-ui && npm run build'

# Restart
echo "Restarting PM2..."
ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=no root@159.65.181.148 'pm2 restart pcs-ui'

echo "✅ Deployment complete!"

