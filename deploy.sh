#!/bin/bash

echo "Deploying PCS AI QuickBooks Integration..."

# Your email for SSL certificates
EMAIL="your-email@example.com"

# Install SSL certificate (if not already done)
if [ ! -d "/etc/letsencrypt/live/pcsmilesai.com" ]; then
    echo "Installing SSL certificate..."
    sudo certbot certonly --standalone -d pcsmilesai.com -d www.pcsmilesai.com --non-interactive --agree-tos -m $EMAIL
fi

# Build and deploy with Docker
docker-compose down
docker-compose build
docker-compose up -d

echo "Deployment complete!"
echo "Your app should be available at https://pcsmilesai.com"
echo ""
echo "Test OAuth flow: https://pcsmilesai.com/api/qbo/auth"
echo "Check status: https://pcsmilesai.com/api/qbo/status"
