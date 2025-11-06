#!/bin/bash
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
rm -f pcs-ui-deployment.tar.gz
tar -czf pcs-ui-deployment.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.next \
  --exclude='pcs-ui sep13 copy' \
  --exclude='backup-ui-*' \
  --exclude='.next_static_archive' \
  --exclude=pcs_ai_data \
  --exclude=*.log \
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
  
  # Create app directory (do NOT wipe to preserve old Next chunks for open tabs)
  mkdir -p /var/www/pcs-ui
  cd /var/www/pcs-ui
  
  # Preserve existing Next chunks to avoid stale-tab 404s
  TS=$(date +%Y%m%d-%H%M%S)
  if [ -d .next/static/chunks ]; then
    mkdir -p /var/www/pcs-ui/.next_static_archive/$TS
    cp -a .next/static/chunks/. /var/www/pcs-ui/.next_static_archive/$TS/ || true
  fi

  # Extract deployment package (fresh contents only)
  tar -xzf /tmp/pcs-ui-deployment.tar.gz
  
  # Ensure any local backup folders are not part of the build context
  rm -rf "/var/www/pcs-ui/pcs-ui sep13 copy" || true
  rm -rf /var/www/pcs-ui/backup-ui-* || true
  
  # Install dependencies
  npm install
  
  # Create environment file
  cat > .env.local << 'ENVEOF'
# QuickBooks OAuth Configuration
QBO_CLIENT_ID=AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE
QBO_CLIENT_SECRET=SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74
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

  # After build, restore archived chunks alongside new ones
  if [ -d /var/www/pcs-ui/.next_static_archive/$TS ]; then
    rsync -a --ignore-existing /var/www/pcs-ui/.next_static_archive/$TS/ .next/static/chunks/ || true
  fi
  
  # Create PM2 ecosystem file
  cat > ecosystem.config.js << 'PM2EOF'
module.exports = {
  apps: [{
    name: 'pcs-ui',
    script: 'node_modules/.bin/next',
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

  # Start with PM2 (serve Next.js server)
  pm2 start ecosystem.config.js --update-env
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
# Canonicalize host: redirect www -> apex
server {
    listen 80;
    server_name www.pcsmilesai.com;
    return 301 https://pcsmilesai.com$request_uri;
}

server {
    listen 80;
    server_name pcsmilesai.com;

    # Defensive: rewrite bad path /next/... -> /_next/...
    location ^~ /next/ {
        return 301 /_$uri$is_args$args;
    }

    # Static Next assets: long-lived, immutable
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # APIs: never cache
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        add_header Cache-Control "no-store";
    }

    # Everything else (HTML): no-store
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        add_header Cache-Control "no-store";
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
