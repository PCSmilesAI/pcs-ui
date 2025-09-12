#!/bin/bash

# PCS UI Deployment Script for Digital Ocean Droplet
# IP: 159.65.181.148

echo "🚀 Deploying PCS UI to Digital Ocean Droplet..."

# Configuration
DROPLET_IP="159.65.181.148"
DROPLET_USER="root"
APP_DIR="/var/www/pcs-ui"
DOMAIN="pcsmilesai.com"  # Update this to your domain

echo "📋 Configuration:"
echo "  Droplet IP: $DROPLET_IP"
echo "  App Directory: $APP_DIR"
echo "  Domain: $DOMAIN"

# Create deployment package
echo "📦 Creating deployment package..."
tar -czf pcs-ui-deployment.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.next \
  --exclude=*.log \
  --exclude=pcs_ai_data/invoice_queue_backup_*.json \
  .

echo "📤 Uploading to droplet..."
scp pcs-ui-deployment.tar.gz $DROPLET_USER@$DROPLET_IP:/tmp/

echo "🔧 Setting up on droplet..."
ssh $DROPLET_USER@$DROPLET_IP << 'EOF'
  # Update system
  apt update && apt upgrade -y
  
  # Install Node.js 18 if not installed
  if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    apt-get install -y nodejs
  fi
  
  # Install PM2 if not installed
  if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
  fi
  
  # Create app directory
  mkdir -p /var/www/pcs-ui
  cd /var/www/pcs-ui
  
  # Extract deployment package
  tar -xzf /tmp/pcs-ui-deployment.tar.gz
  
  # Install dependencies
  npm install
  
  # Create environment file
  cat > .env.local << 'ENVEOF'
# QuickBooks OAuth Configuration
QBO_CLIENT_ID=ABfG1MwE5yhkAAqCw0RA2viwkI9cMdn33oagtgGOaJWdrkRBVl
QBO_CLIENT_SECRET=WWbNuMbbXQZKwKdYcpuDHs5H7mwvfP0eVcdsiIEy
QBO_REDIRECT_URI=https://pcsmilesai.com/api/qbo/callback
QBO_SCOPES=com.intuit.quickbooks.accounting
QBO_ENV=production

# Next.js Configuration
NEXT_PUBLIC_APP_URL=https://pcsmilesai.com
NODE_ENV=production
ENVEOF

  # Create data directory for SQLite
  mkdir -p pcs_ai_data
  chmod 755 pcs_ai_data
  
  # Build the application
  npm run build
  
  # Create PM2 ecosystem file
  cat > ecosystem.config.js << 'PM2EOF'
module.exports = {
  apps: [{
    name: 'pcs-ui',
    script: 'npm',
    args: 'start',
    cwd: '/var/www/pcs-ui',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
PM2EOF

  # Start with PM2
  pm2 start ecosystem.config.js
  pm2 save
  pm2 startup
  
  echo "✅ Application deployed and started!"
  echo "📊 PM2 Status:"
  pm2 status
EOF

echo "🌐 Setting up Nginx reverse proxy..."
ssh $DROPLET_USER@$DROPLET_IP << 'EOF'
  # Install Nginx if not installed
  if ! command -v nginx &> /dev/null; then
    apt install -y nginx
  fi
  
  # Create Nginx configuration
  cat > /etc/nginx/sites-available/pcs-ui << 'NGINXEOF'
server {
    listen 80;
    server_name pcsmilesai.com www.pcsmilesai.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINXEOF

  # Enable the site
  ln -sf /etc/nginx/sites-available/pcs-ui /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
  
  # Test and reload Nginx
  nginx -t && systemctl reload nginx
  
  echo "✅ Nginx configured!"
EOF

echo "🔒 Setting up SSL with Let's Encrypt..."
ssh $DROPLET_USER@$DROPLET_IP << 'EOF'
  # Install Certbot if not installed
  if ! command -v certbot &> /dev/null; then
    apt install -y certbot python3-certbot-nginx
  fi
  
  # Get SSL certificate
  certbot --nginx -d pcsmilesai.com -d www.pcsmilesai.com --non-interactive --agree-tos --email your-email@example.com
  
  echo "✅ SSL certificate installed!"
EOF

# Clean up
rm pcs-ui-deployment.tar.gz

echo "🎉 Deployment complete!"
echo "🌐 Your app should be available at: https://pcsmilesai.com"
echo "📊 Check status with: ssh $DROPLET_USER@$DROPLET_IP 'pm2 status'"
echo "📝 View logs with: ssh $DROPLET_USER@$DROPLET_IP 'pm2 logs pcs-ui'"
