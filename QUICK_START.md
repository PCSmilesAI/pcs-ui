# 🚀 Quick Start Guide - Production Features

## **Overview**

This guide will get you up and running with the new production features in under 10 minutes!

## **🚀 Quick Start (3 Steps)**

### **Step 1: Install Dependencies**
```bash
npm install express-rate-limit helmet
```

### **Step 2: Test the New Features**
```bash
# Start your development server
npm run dev:api

# In another terminal, test the new endpoints
curl http://localhost:3001/health
curl http://localhost:3001/metrics
```

### **Step 3: Verify Everything Works**
Open `http://localhost:3001/local-test` in your browser and test the new PCS AI Workflow System buttons!

## **🔐 Security Features (Automatic)**

Once you restart your server, these features are **automatically enabled**:

- ✅ **API Key Authentication** - All endpoints require valid API keys
- ✅ **Rate Limiting** - 100 requests per 15 minutes per IP
- ✅ **Security Headers** - XSS protection, CSRF protection, etc.
- ✅ **Request Sanitization** - Automatic input validation
- ✅ **Enhanced Logging** - Detailed request/response logging

## **📊 Monitoring (Ready to Use)**

- **Health Check**: `GET /health` - System status and uptime
- **Metrics**: `GET /metrics` - Performance and system metrics
- **Performance Monitoring**: Automatic request timing and slow request detection

## **💾 Database Integration (File-based)**

- **Automatic Backups**: Every 24 hours
- **Invoice Tracking**: Complete CRUD operations
- **Processing History**: Detailed logs of all operations
- **Statistics**: Real-time processing metrics

## **⚡ Performance Features (Automatic)**

- **Circuit Breakers**: Prevents cascading failures
- **Request Optimization**: Configurable timeouts and limits
- **Memory Management**: Efficient resource usage

## **🔧 Configuration**

### **Environment Variables (Optional)**
Create a `.env` file for custom settings:

```bash
# Security
API_KEYS=your-api-key-1,your-api-key-2
SESSION_SECRET=your-super-secure-secret
ENCRYPTION_KEY=your-32-char-encryption-key

# Performance
MAX_CONCURRENT_REQUESTS=100
REQUEST_TIMEOUT_MS=30000
CIRCUIT_BREAKER_THRESHOLD=5

# Monitoring
ENABLE_METRICS=true
LOG_LEVEL=info
```

### **Default API Keys**
For local development, these keys are automatically generated:
- `local-dev-key-1`
- `local-dev-key-2`

## **🧪 Testing the New Features**

### **1. Health Check**
```bash
curl http://localhost:3001/health
```
**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-08-21T20:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### **2. System Metrics**
```bash
curl http://localhost:3001/metrics
```
**Expected Response:**
```json
{
  "timestamp": "2025-08-21T20:00:00.000Z",
  "system": {...},
  "quickbooks": {...},
  "pcsAI": {...}
}
```

### **3. PCS AI Workflow System**
Open `http://localhost:3001/local-test` and test:
- **PCS AI Workflow Statistics**
- **PCS AI Workflow Queue Status**
- **PCS AI Workflow System Status**
- **Add Invoice to PCS AI Queue**
- **Process PCS AI Workflow Queue**

### **4. Enhanced Webhooks**
Test the improved webhook handling:
- **Test Webhook Endpoint**
- **QuickBooks Webhook Endpoint**

## **🚨 Error Handling (Automatic)**

All errors now include:
- **Unique Error IDs** for tracking
- **Circuit Breaker Status** for debugging
- **Detailed Context** for faster resolution
- **Automatic Retry Logic** for transient failures

## **📈 Production Deployment**

### **Docker (Recommended)**
```bash
# Build and run with Docker Compose
docker-compose up -d

# Or use the deployment script
./deploy.sh docker-compose
```

### **Kubernetes**
```bash
# Deploy to Kubernetes
./deploy.sh kubernetes
```

### **Manual Deployment**
```bash
# Start production server
npm run start:prod

# Run security audit
npm run security:audit

# Create backup
npm run backup
```

## **🔍 Troubleshooting**

### **Common Issues**

#### **1. "API Key Required" Error**
**Solution**: Include API key in headers:
```bash
curl -H "x-api-key: local-dev-key-1" http://localhost:3001/health
```

#### **2. Rate Limit Exceeded**
**Solution**: Wait 15 minutes or increase limits in `.env`:
```bash
RATE_LIMIT_MAX_REQUESTS=200
```

#### **3. Circuit Breaker Open**
**Solution**: Wait for automatic recovery or check logs for root cause.

### **Logs and Debugging**
- **Console Logs**: All requests and errors are logged
- **Performance Logs**: Slow requests (>1s) are highlighted
- **Circuit Breaker Status**: Included in error responses

## **📚 Next Steps**

### **Immediate Actions**
1. ✅ **Test Health Endpoints** - Verify system is working
2. ✅ **Test PCS AI Workflow** - Verify new features work
3. ✅ **Test Security** - Verify API key authentication
4. ✅ **Monitor Performance** - Check metrics endpoint

### **Advanced Configuration**
1. **Custom API Keys** - Generate production-ready keys
2. **Database Migration** - Move to PostgreSQL/MySQL
3. **Redis Integration** - Add caching layer
4. **Monitoring Dashboards** - Set up Grafana

### **Production Deployment**
1. **Environment Setup** - Configure production variables
2. **SSL/TLS** - Set up HTTPS
3. **Load Balancing** - Scale horizontally
4. **Backup Strategy** - Implement automated backups

## **🎯 What's New Summary**

| Feature | Status | Description |
|---------|--------|-------------|
| 🔐 **Security** | ✅ **Active** | API keys, rate limiting, security headers |
| 📊 **Monitoring** | ✅ **Active** | Health checks, metrics, performance monitoring |
| 💾 **Database** | ✅ **Active** | File-based storage with backups |
| ⚡ **Performance** | ✅ **Active** | Circuit breakers, request optimization |
| 🚨 **Error Handling** | ✅ **Active** | Enhanced errors, retry logic |
| 🔄 **Workflow Engine** | ✅ **Active** | PCS AI processing queue |
| 📈 **Deployment** | ✅ **Ready** | Docker, Kubernetes, scripts |

## **🎉 You're All Set!**

Your PCS AI QuickBooks Integration now has **enterprise-grade production features** including:

- **Security**: API key authentication, rate limiting, security headers
- **Monitoring**: Health checks, metrics, performance tracking
- **Performance**: Circuit breakers, request optimization, error handling
- **Scalability**: Docker, Kubernetes, horizontal scaling
- **Reliability**: Automatic backups, retry logic, circuit breakers

**Next**: Test the features, configure production settings, and deploy to production! 🚀
