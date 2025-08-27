# 🚀 Production Deployment Guide

## **Overview**

This guide covers deploying your PCS AI QuickBooks Integration to production using different strategies:

1. **🐳 Docker Compose** (Local/Dev Production)
2. **🚀 Direct Production** (Simple Production)
3. **⚡ PM2 Process Manager** (Recommended Production)
4. **☁️ Cloud Platforms** (AWS/GCP/Azure)
5. **🔄 Kubernetes** (Enterprise Production)

---

## **🔧 Pre-Deployment Checklist**

### **Required Updates**
- [ ] Update `QBO_CLIENT_ID` with your production QuickBooks app ID
- [ ] Update `QBO_CLIENT_SECRET` with your production QuickBooks app secret
- [ ] Update domain URLs in `CORS_ORIGIN` and webhook URLs
- [ ] Configure SSL certificates if using HTTPS
- [ ] Set up monitoring and error reporting (Sentry, etc.)

### **Security Verification**
- [ ] API keys are secure and unique
- [ ] Session secrets are cryptographically strong
- [ ] Rate limiting is enabled
- [ ] Security headers are configured
- [ ] File upload restrictions are set

---

## **🐳 Option 1: Docker Compose Production**

### **Prerequisites**
```bash
# Install Docker and Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
docker --version
docker-compose --version
```

### **Deployment Steps**
```bash
# 1. Build and start production services
docker-compose -f docker-compose.yml up -d

# 2. Check service status
docker-compose ps

# 3. View logs
docker-compose logs -f pcs-ai-qbo

# 4. Stop services
docker-compose down
```

### **Environment Configuration**
```bash
# Copy production environment file
cp production.env .env

# Edit with your actual values
nano .env

# Start with environment file
docker-compose --env-file production.env up -d
```

---

## **🚀 Option 2: Direct Production Deployment**

### **Simple Production Start**
```bash
# Make startup script executable
chmod +x start-production.sh

# Start production server
./start-production.sh
```

### **Manual Production Start**
```bash
# Set environment variables
export NODE_ENV=production
export API_KEYS="your-api-key-1,your-api-key-2"
export SESSION_SECRET="your-session-secret"
export ENCRYPTION_KEY="your-encryption-key"

# Start server
node dev-server.js
```

---

## **⚡ Option 3: PM2 Process Manager (Recommended)**

### **Installation**
```bash
# Install PM2 globally
npm install -g pm2

# Verify installation
pm2 --version
```

### **Production Deployment**
```bash
# 1. Start with PM2
pm2 start ecosystem.config.js --env production

# 2. Save PM2 configuration
pm2 save

# 3. Setup PM2 startup script
pm2 startup

# 4. Monitor your application
pm2 monit

# 5. View logs
pm2 logs pcs-ai-quickbooks

# 6. Restart application
pm2 restart pcs-ai-quickbooks

# 7. Stop application
pm2 stop pcs-ai-quickbooks
```

### **PM2 Commands Reference**
```bash
# List all processes
pm2 list

# Monitor processes
pm2 monit

# View logs
pm2 logs

# Restart all
pm2 restart all

# Reload configuration
pm2 reload ecosystem.config.js --env production

# Delete from PM2
pm2 delete pcs-ai-quickbooks
```

---

## **☁️ Option 4: Cloud Platform Deployment**

### **AWS EC2 Deployment**
```bash
# 1. Connect to your EC2 instance
ssh -i your-key.pem ubuntu@your-ec2-ip

# 2. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install PM2
npm install -g pm2

# 4. Clone your repository
git clone https://github.com/yourusername/pcs-ui.git
cd pcs-ui

# 5. Install dependencies
npm install

# 6. Start with PM2
pm2 start ecosystem.config.js --env production
```

### **Google Cloud Platform**
```bash
# 1. Create Compute Engine instance
gcloud compute instances create pcs-ai-server \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=debian-11 \
  --image-project=debian-cloud

# 2. Connect and deploy (similar to AWS)
gcloud compute ssh pcs-ai-server --zone=us-central1-a
```

### **Azure VM Deployment**
```bash
# 1. Create VM through Azure Portal
# 2. Connect via SSH
# 3. Follow similar deployment steps as AWS
```

---

## **🔄 Option 5: Kubernetes Deployment**

### **Prerequisites**
```bash
# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/

# Install minikube (for local testing)
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube
```

### **Deployment Steps**
```bash
# 1. Create namespace
kubectl create namespace pcs-ai

# 2. Apply Kubernetes manifests
kubectl apply -f k8s/deployment.yaml

# 3. Check deployment status
kubectl get pods -n pcs-ai

# 4. View logs
kubectl logs -f deployment/pcs-ai-quickbooks -n pcs-ai

# 5. Access your application
kubectl port-forward svc/pcs-ai-quickbooks-service 3001:80 -n pcs-ai
```

---

## **🔍 Production Verification**

### **Health Checks**
```bash
# Test health endpoint
curl http://your-server:3001/health

# Test metrics endpoint
curl http://your-server:3001/metrics

# Test API endpoints
curl -H "x-api-key: your-api-key" http://your-server:3001/api/test
```

### **Security Tests**
```bash
# Test rate limiting
for i in {1..110}; do curl http://your-server:3001/api/test; done

# Test API key validation
curl http://your-server:3001/api/test  # Should fail without API key

# Test with valid API key
curl -H "x-api-key: your-api-key" http://your-server:3001/api/test
```

### **Performance Tests**
```bash
# Test with Apache Bench
ab -n 1000 -c 10 http://your-server:3001/health

# Test with wrk
wrk -t12 -c400 -d30s http://your-server:3001/health
```

---

## **📊 Monitoring & Maintenance**

### **Log Management**
```bash
# View application logs
tail -f logs/app.log

# View PM2 logs
pm2 logs pcs-ai-quickbooks

# View Docker logs
docker-compose logs -f pcs-ai-qbo

# View Kubernetes logs
kubectl logs -f deployment/pcs-ai-quickbooks -n pcs-ai
```

### **Backup Management**
```bash
# Manual backup
cp -r pcs_ai_data backups/$(date +%Y%m%d_%H%M%S)

# Automated backup (cron job)
0 2 * * * /usr/bin/cp -r /path/to/pcs_ai_data /path/to/backups/$(date +\%Y\%m\%d_\%H\%M\%S)
```

### **Performance Monitoring**
```bash
# Monitor system resources
htop
iotop
nethogs

# Monitor application metrics
curl http://your-server:3001/metrics | jq

# Monitor PM2 processes
pm2 monit
```

---

## **🚨 Troubleshooting**

### **Common Issues**

#### **1. Port Already in Use**
```bash
# Find process using port 3001
lsof -i :3001

# Kill process
kill -9 <PID>

# Or use different port
export PORT=3002
```

#### **2. Permission Denied**
```bash
# Fix directory permissions
sudo chown -R $USER:$USER logs backups pcs_ai_data uploads
chmod 755 logs backups pcs_ai_data uploads
```

#### **3. QuickBooks Authentication Failed**
```bash
# Check OAuth tokens
cat qbo_tokens.json

# Re-authenticate if needed
# Delete qbo_tokens.json and restart OAuth flow
```

#### **4. Memory Issues**
```bash
# Check memory usage
free -h
pm2 monit

# Restart application
pm2 restart pcs-ai-quickbooks
```

---

## **🔒 Security Best Practices**

### **Production Security Checklist**
- [ ] Use HTTPS in production
- [ ] Set secure API keys
- [ ] Enable rate limiting
- [ ] Configure security headers
- [ ] Set up firewall rules
- [ ] Regular security updates
- [ ] Monitor access logs
- [ ] Backup encryption

### **SSL/TLS Configuration**
```bash
# Install Let's Encrypt
sudo apt-get install certbot

# Get SSL certificate
sudo certbot certonly --standalone -d yourdomain.com

# Configure SSL in your application
export SSL_ENABLED=true
export SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
export SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
```

---

## **📈 Scaling Considerations**

### **Horizontal Scaling**
- Use load balancer (nginx, haproxy)
- Deploy multiple instances
- Use PM2 clustering
- Consider Kubernetes for large scale

### **Vertical Scaling**
- Increase server resources
- Optimize database queries
- Use caching (Redis)
- Implement connection pooling

---

## **🎯 Next Steps**

1. **Choose your deployment strategy** based on your needs
2. **Update configuration** with your actual values
3. **Deploy to production** using the chosen method
4. **Verify functionality** with health checks
5. **Monitor performance** and set up alerts
6. **Plan for scaling** as your usage grows

---

**🚀 Your PCS AI QuickBooks Integration is ready for production!**

Choose the deployment method that best fits your infrastructure and requirements. The PM2 option is recommended for most production scenarios as it provides process management, clustering, and monitoring out of the box.
