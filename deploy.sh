#!/bin/bash

# 🚀 PCS AI QuickBooks Integration - Production Deployment Script

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="pcs-ai-quickbooks"
VERSION="1.0.0"
NAMESPACE="pcs-ai"
DOCKER_REGISTRY="your-registry.com"
ENVIRONMENT=${1:-production}

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        error "Docker is not running. Please start Docker and try again."
    fi
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        error "kubectl is not installed. Please install kubectl and try again."
    fi
    
    # Check if helm is installed (optional)
    if ! command -v helm &> /dev/null; then
        warn "Helm is not installed. Some features may not work."
    fi
    
    log "Prerequisites check completed successfully."
}

# Generate secure secrets
generate_secrets() {
    log "Generating secure secrets..."
    
    # Create secrets directory
    mkdir -p secrets
    
    # Generate API keys
    API_KEY_1=$(openssl rand -hex 32)
    API_KEY_2=$(openssl rand -hex 32)
    echo "$API_KEY_1,$API_KEY_2" > secrets/api-keys.txt
    
    # Generate session secret
    SESSION_SECRET=$(openssl rand -hex 64)
    echo "$SESSION_SECRET" > secrets/session-secret.txt
    
    # Generate encryption key
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    echo "$ENCRYPTION_KEY" > secrets/encryption-key.txt
    
    # Generate database password
    DB_PASSWORD=$(openssl rand -base64 32)
    echo "$DB_PASSWORD" > secrets/db-password.txt
    
    log "Secrets generated and saved to secrets/ directory."
    warn "Keep these secrets secure and never commit them to version control!"
}

# Build Docker image
build_image() {
    log "Building Docker image..."
    
    # Build the image
    docker build -t $APP_NAME:$VERSION .
    docker tag $APP_NAME:$VERSION $APP_NAME:latest
    
    # Tag for registry if specified
    if [ ! -z "$DOCKER_REGISTRY" ]; then
        docker tag $APP_NAME:$VERSION $DOCKER_REGISTRY/$APP_NAME:$VERSION
        docker tag $APP_NAME:$VERSION $DOCKER_REGISTRY/$APP_NAME:latest
    fi
    
    log "Docker image built successfully."
}

# Push Docker image
push_image() {
    if [ -z "$DOCKER_REGISTRY" ]; then
        warn "No Docker registry specified. Skipping image push."
        return
    fi
    
    log "Pushing Docker image to registry..."
    
    docker push $DOCKER_REGISTRY/$APP_NAME:$VERSION
    docker push $DOCKER_REGISTRY/$APP_NAME:latest
    
    log "Docker image pushed successfully."
}

# Create Kubernetes namespace
create_namespace() {
    log "Creating Kubernetes namespace..."
    
    kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    
    log "Namespace '$NAMESPACE' created/updated successfully."
}

# Deploy to Kubernetes
deploy_kubernetes() {
    log "Deploying to Kubernetes..."
    
    # Apply the deployment
    kubectl apply -f k8s/deployment.yaml
    
    # Wait for deployment to be ready
    log "Waiting for deployment to be ready..."
    kubectl rollout status deployment/$APP_NAME -n $NAMESPACE --timeout=300s
    
    log "Kubernetes deployment completed successfully."
}

# Deploy with Docker Compose
deploy_docker_compose() {
    log "Deploying with Docker Compose..."
    
    # Create .env file from secrets
    if [ -f "secrets/api-keys.txt" ]; then
        export API_KEYS=$(cat secrets/api-keys.txt)
        export SESSION_SECRET=$(cat secrets/session-secret.txt)
        export ENCRYPTION_KEY=$(cat secrets/encryption-key.txt)
        export DB_PASSWORD=$(cat secrets/db-password.txt)
    fi
    
    # Start services
    docker-compose up -d
    
    log "Docker Compose deployment completed successfully."
}

# Setup monitoring
setup_monitoring() {
    log "Setting up monitoring..."
    
    # Create monitoring namespace
    kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
    
    # Deploy Prometheus
    if [ -f "k8s/prometheus.yaml" ]; then
        kubectl apply -f k8s/prometheus.yaml
    fi
    
    # Deploy Grafana
    if [ -f "k8s/grafana.yaml" ]; then
        kubectl apply -f k8s/grafana.yaml
    fi
    
    log "Monitoring setup completed."
}

# Setup ingress and SSL
setup_ingress() {
    log "Setting up ingress and SSL..."
    
    # Check if cert-manager is installed
    if kubectl get namespace cert-manager > /dev/null 2>&1; then
        log "Cert-manager detected. Setting up SSL certificates..."
        
        # Create ClusterIssuer for Let's Encrypt
        cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@pcs-ai.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
        
        log "SSL certificates will be automatically provisioned."
    else
        warn "Cert-manager not detected. SSL certificates will not be automatically provisioned."
    fi
}

# Health check
health_check() {
    log "Performing health check..."
    
    # Wait for service to be ready
    sleep 30
    
    # Check if service is responding
    if kubectl get service $APP_NAME-service -n $NAMESPACE > /dev/null 2>&1; then
        # Get service URL
        SERVICE_URL=$(kubectl get service $APP_NAME-service -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
        
        if [ ! -z "$SERVICE_URL" ]; then
            # Test health endpoint
            if curl -f "http://$SERVICE_URL/health" > /dev/null 2>&1; then
                log "Health check passed! Service is responding."
            else
                error "Health check failed! Service is not responding."
            fi
        else
            warn "Service URL not available yet. Health check skipped."
        fi
    else
        warn "Service not found. Health check skipped."
    fi
}

# Backup existing data
backup_data() {
    log "Creating backup of existing data..."
    
    # Create backup directory
    mkdir -p backups/$(date +%Y%m%d_%H%M%S)
    
    # Backup Kubernetes resources
    kubectl get all -n $NAMESPACE -o yaml > backups/$(date +%Y%m%d_%H%M%S)/k8s-backup.yaml 2>/dev/null || true
    
    # Backup persistent volumes
    kubectl get pvc -n $NAMESPACE -o yaml > backups/$(date +%Y%m%d_%H%M%S)/pvc-backup.yaml 2>/dev/null || true
    
    log "Backup completed successfully."
}

# Rollback function
rollback() {
    error "Deployment failed! Rolling back..."
    
    # Rollback Kubernetes deployment
    kubectl rollout undo deployment/$APP_NAME -n $NAMESPACE
    
    # Stop Docker Compose services
    docker-compose down
    
    log "Rollback completed."
}

# Main deployment function
main() {
    log "Starting PCS AI QuickBooks Integration deployment..."
    log "Environment: $ENVIRONMENT"
    log "Version: $VERSION"
    
    # Set trap for rollback on error
    trap rollback ERR
    
    # Check prerequisites
    check_prerequisites
    
    # Backup existing data
    backup_data
    
    # Generate secrets
    generate_secrets
    
    # Build Docker image
    build_image
    
    # Push image if registry specified
    push_image
    
    # Deploy based on environment
    if [ "$ENVIRONMENT" = "kubernetes" ]; then
        create_namespace
        deploy_kubernetes
        setup_monitoring
        setup_ingress
        health_check
    else
        deploy_docker_compose
    fi
    
    log "Deployment completed successfully!"
    log "Your PCS AI QuickBooks Integration is now running in $ENVIRONMENT mode."
    
    # Display access information
    if [ "$ENVIRONMENT" = "kubernetes" ]; then
        log "Access your application:"
        log "  - Health check: kubectl port-forward svc/$APP_NAME-service 3001:80 -n $NAMESPACE"
        log "  - Metrics: kubectl port-forward svc/$APP_NAME-service 9090:9090 -n $NAMESPACE"
    else
        log "Access your application:"
        log "  - Main app: http://localhost:3001"
        log "  - Health check: http://localhost:3001/health"
        log "  - Metrics: http://localhost:3001/metrics"
    fi
    
    # Remove trap
    trap - ERR
}

# Show usage
usage() {
    echo "Usage: $0 [environment]"
    echo "  environment: production (default), kubernetes, or docker-compose"
    echo ""
    echo "Examples:"
    echo "  $0                    # Deploy to production (Docker Compose)"
    echo "  $0 kubernetes         # Deploy to Kubernetes"
    echo "  $0 docker-compose     # Deploy with Docker Compose"
}

# Check if help is requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
    exit 0
fi

# Run main function
main "$@"
