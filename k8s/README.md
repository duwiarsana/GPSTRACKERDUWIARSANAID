# Kubernetes Deployment Guide for GPS Tracker MQTT

This guide explains how to deploy the GPS Tracker MQTT application to a Kubernetes cluster using the provided manifests and GitHub Actions CI/CD pipeline.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Quick Start](#quick-start)
4. [Detailed Deployment Steps](#detailed-deployment-steps)
5. [GitHub Actions CI/CD](#github-actions-cicd)
6. [Configuration](#configuration)
7. [Monitoring and Scaling](#monitoring-and-scaling)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

- Kubernetes cluster (v1.24+)
- `kubectl` CLI installed and configured
- Docker Hub account (for image registry)
- GitHub repository with Actions enabled
- (Optional) Ingress controller (nginx, traefik, etc.)
- (Optional) cert-manager for TLS certificates

## Architecture Overview

The application consists of:

- **MongoDB**: Database for storing GPS tracker data (1 replica with persistent storage)
- **GPS Tracker App**: Unified frontend (React) + backend (Node.js) application (2+ replicas with auto-scaling)
- **Services**: ClusterIP for MongoDB, LoadBalancer for App
- **Ingress**: Optional HTTP/HTTPS routing with custom domain
- **HPA**: Horizontal Pod Autoscaler for automatic scaling based on CPU/Memory

```
┌─────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                    │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              Namespace: gpstracker                  │ │
│  │                                                     │ │
│  │  ┌──────────────┐         ┌──────────────────┐    │ │
│  │  │   Ingress    │────────▶│  LoadBalancer    │    │ │
│  │  │  (Optional)  │         │    Service       │    │ │
│  │  └──────────────┘         └────────┬─────────┘    │ │
│  │                                    │              │ │
│  │                          ┌─────────▼─────────┐    │ │
│  │                          │  GPS Tracker App  │    │ │
│  │                          │   (2-10 Pods)     │    │ │
│  │                          │  Frontend+Backend │    │ │
│  │                          └─────────┬─────────┘    │ │
│  │                                    │              │ │
│  │                          ┌─────────▼─────────┐    │ │
│  │                          │   MongoDB Service │    │ │
│  │                          │    (ClusterIP)    │    │ │
│  │                          └─────────┬─────────┘    │ │
│  │                                    │              │ │
│  │                          ┌─────────▼─────────┐    │ │
│  │                          │     MongoDB       │    │ │
│  │                          │    (1 Pod)        │    │ │
│  │                          │  + PersistentVol  │    │ │
│  │                          └───────────────────┘    │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Deploy to Kubernetes

```bash
# Apply all manifests in order
kubectl apply -f k8s/

# Or apply individually
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-configmap.yaml
kubectl apply -f k8s/02-secret.yaml
kubectl apply -f k8s/03-mongodb-pvc.yaml
kubectl apply -f k8s/04-mongodb-deployment.yaml
kubectl apply -f k8s/05-mongodb-service.yaml
kubectl apply -f k8s/06-app-deployment.yaml
kubectl apply -f k8s/07-app-service.yaml
kubectl apply -f k8s/08-ingress.yaml      # Optional
kubectl apply -f k8s/09-hpa.yaml          # Optional
```

### 2. Verify Deployment

```bash
# Check all resources
kubectl get all -n gpstracker

# Check pods status
kubectl get pods -n gpstracker

# Check services
kubectl get svc -n gpstracker

# View logs
kubectl logs -f deployment/gpstracker-app -n gpstracker
```

### 3. Access the Application

```bash
# Get LoadBalancer external IP
kubectl get svc gpstracker-app -n gpstracker

# Access via LoadBalancer IP
# Frontend: http://<EXTERNAL-IP>
# Backend API: http://<EXTERNAL-IP>:5050

# Or use port-forward for local testing
kubectl port-forward svc/gpstracker-app 8080:80 -n gpstracker
# Access: http://localhost:8080
```

## Detailed Deployment Steps

### Step 1: Configure Secrets

**IMPORTANT**: Update secrets before deploying to production!

```bash
# Edit the secret file
vim k8s/02-secret.yaml

# Update these values:
# - JWT_SECRET: Generate a strong random secret
# - TELEGRAM_BOT_TOKEN: Your Telegram bot token (optional)
# - TELEGRAM_DEFAULT_CHAT_ID: Your Telegram chat ID (optional)
# - ADMIN_EMAIL: Admin email for initial login
# - ADMIN_PASSWORD: Admin password for initial login
```

Or create secret from command line:

```bash
kubectl create secret generic gpstracker-secret \
  --from-literal=JWT_SECRET='your-super-secret-jwt-key' \
  --from-literal=TELEGRAM_BOT_TOKEN='your-telegram-bot-token' \
  --from-literal=TELEGRAM_DEFAULT_CHAT_ID='your-chat-id' \
  --from-literal=ADMIN_EMAIL='admin@admin.com' \
  --from-literal=ADMIN_PASSWORD='admin123' \
  -n gpstracker
```

### Step 2: Configure Storage

Edit `k8s/03-mongodb-pvc.yaml` to match your cluster's storage class:

```yaml
spec:
  storageClassName: standard  # Change to your storage class
  resources:
    requests:
      storage: 10Gi  # Adjust size as needed
```

Check available storage classes:

```bash
kubectl get storageclass
```

### Step 3: Configure Ingress (Optional)

If using Ingress for custom domain:

1. Edit `k8s/08-ingress.yaml`
2. Update the host to your domain
3. Configure TLS if needed
4. Ensure ingress controller is installed

```bash
# Example: Install nginx ingress controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml
```

### Step 4: Deploy Application

```bash
# Create namespace and deploy all resources
kubectl apply -f k8s/

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l app=gpstracker-app -n gpstracker --timeout=300s
```

### Step 5: Verify Deployment

```bash
# Check deployment status
kubectl rollout status deployment/gpstracker-app -n gpstracker
kubectl rollout status deployment/mongo -n gpstracker

# Check pod logs
kubectl logs -f deployment/gpstracker-app -n gpstracker

# Check MongoDB logs
kubectl logs -f deployment/mongo -n gpstracker
```

## GitHub Actions CI/CD

The repository includes a GitHub Actions workflow that automatically builds and pushes Docker images to Docker Hub.

### Workflow Features

- **Automatic versioning**: Tags images based on git commits, branches, and semantic versions
- **Multi-architecture builds**: Supports both `linux/amd64` and `linux/arm64`
- **Build caching**: Speeds up subsequent builds
- **Pull request validation**: Builds images without pushing for PRs

### Setup GitHub Actions

1. **Add Docker Hub credentials to GitHub Secrets**:
   - Go to your repository → Settings → Secrets and variables → Actions
   - Add secret: `DOCKERTOKEN` with your Docker Hub access token

2. **Trigger the workflow**:
   ```bash
   # Push to main branch
   git push origin main
   
   # Or create a version tag
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. **Image tags generated**:
   - `duwiarsana/gpsmqtt:latest` - Latest main branch build
   - `duwiarsana/gpsmqtt:main-<sha>` - Specific commit on main
   - `duwiarsana/gpsmqtt:v1.0.0` - Semantic version tag
   - `duwiarsana/gpsmqtt:1.0` - Major.minor version
   - `duwiarsana/gpsmqtt:1` - Major version

### Update Kubernetes Deployment

After GitHub Actions builds a new image:

```bash
# Option 1: Update to latest
kubectl set image deployment/gpstracker-app gpstracker=duwiarsana/gpsmqtt:latest -n gpstracker

# Option 2: Update to specific version
kubectl set image deployment/gpstracker-app gpstracker=duwiarsana/gpsmqtt:v1.0.0 -n gpstracker

# Option 3: Edit deployment manifest
kubectl edit deployment gpstracker-app -n gpstracker

# Verify rollout
kubectl rollout status deployment/gpstracker-app -n gpstracker
```

### Automated Deployment (Optional)

For fully automated deployments, you can extend the GitHub Actions workflow to deploy to Kubernetes:

```yaml
# Add this job to .github/workflows/dockergpsdeploy.yml
deploy:
  needs: build-and-push
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main'
  steps:
    - name: Checkout
      uses: actions/checkout@v3
    
    - name: Configure kubectl
      uses: azure/k8s-set-context@v3
      with:
        method: kubeconfig
        kubeconfig: ${{ secrets.KUBECONFIG }}
    
    - name: Deploy to Kubernetes
      run: |
        kubectl set image deployment/gpstracker-app \
          gpstracker=duwiarsana/gpsmqtt:main-${{ github.sha }} \
          -n gpstracker
        kubectl rollout status deployment/gpstracker-app -n gpstracker
```

## Configuration

### Environment Variables

All environment variables are managed through ConfigMap and Secret:

**ConfigMap** (`k8s/01-configmap.yaml`):
- `NODE_ENV`: production
- `PORT`: 5050
- `MONGODB_URI`: mongodb://mongo:27017/gpstracker
- `MQTT_BROKER_URL`: MQTT broker URL
- `CORS_ORIGIN`: CORS settings
- And more...

**Secret** (`k8s/02-secret.yaml`):
- `JWT_SECRET`: JWT signing secret
- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `ADMIN_EMAIL`: Admin email
- `ADMIN_PASSWORD`: Admin password

### Updating Configuration

```bash
# Edit ConfigMap
kubectl edit configmap gpstracker-config -n gpstracker

# Edit Secret
kubectl edit secret gpstracker-secret -n gpstracker

# Restart pods to apply changes
kubectl rollout restart deployment/gpstracker-app -n gpstracker
```

## Monitoring and Scaling

### Horizontal Pod Autoscaler (HPA)

The HPA automatically scales the application based on CPU and memory usage:

```bash
# Check HPA status
kubectl get hpa -n gpstracker

# View HPA details
kubectl describe hpa gpstracker-app-hpa -n gpstracker
```

Configuration:
- **Min replicas**: 2
- **Max replicas**: 10
- **CPU threshold**: 70%
- **Memory threshold**: 80%

### Manual Scaling

```bash
# Scale manually
kubectl scale deployment gpstracker-app --replicas=5 -n gpstracker

# Check scaling status
kubectl get deployment gpstracker-app -n gpstracker
```

### Resource Monitoring

```bash
# View resource usage
kubectl top pods -n gpstracker
kubectl top nodes

# View detailed pod info
kubectl describe pod <pod-name> -n gpstracker
```

## Troubleshooting

### Common Issues

#### 1. Pods not starting

```bash
# Check pod status
kubectl get pods -n gpstracker

# View pod events
kubectl describe pod <pod-name> -n gpstracker

# Check logs
kubectl logs <pod-name> -n gpstracker
```

#### 2. MongoDB connection issues

```bash
# Check MongoDB pod
kubectl get pod -l app=mongo -n gpstracker

# Check MongoDB logs
kubectl logs -f deployment/mongo -n gpstracker

# Test MongoDB connection from app pod
kubectl exec -it deployment/gpstracker-app -n gpstracker -- sh
nc -zv mongo 27017
```

#### 3. Image pull errors

```bash
# Check image pull secrets
kubectl get secrets -n gpstracker

# Verify image exists
docker pull duwiarsana/gpsmqtt:latest

# Check pod events for pull errors
kubectl describe pod <pod-name> -n gpstracker
```

#### 4. Service not accessible

```bash
# Check service
kubectl get svc gpstracker-app -n gpstracker

# Check endpoints
kubectl get endpoints gpstracker-app -n gpstracker

# Test service from within cluster
kubectl run test-pod --rm -it --image=busybox -n gpstracker -- sh
wget -O- http://gpstracker-app
```

### Debug Commands

```bash
# Get all resources
kubectl get all -n gpstracker

# Describe deployment
kubectl describe deployment gpstracker-app -n gpstracker

# View events
kubectl get events -n gpstracker --sort-by='.lastTimestamp'

# Execute commands in pod
kubectl exec -it deployment/gpstracker-app -n gpstracker -- sh

# View logs with timestamps
kubectl logs -f deployment/gpstracker-app -n gpstracker --timestamps

# View previous container logs (if crashed)
kubectl logs deployment/gpstracker-app -n gpstracker --previous
```

### Rollback Deployment

```bash
# View rollout history
kubectl rollout history deployment/gpstracker-app -n gpstracker

# Rollback to previous version
kubectl rollout undo deployment/gpstracker-app -n gpstracker

# Rollback to specific revision
kubectl rollout undo deployment/gpstracker-app --to-revision=2 -n gpstracker
```

## Cleanup

To remove all resources:

```bash
# Delete namespace (removes all resources)
kubectl delete namespace gpstracker

# Or delete individual resources
kubectl delete -f k8s/
```

## Security Best Practices

1. **Always change default secrets** in production
2. **Use RBAC** to limit access to resources
3. **Enable network policies** to restrict pod-to-pod communication
4. **Use TLS/HTTPS** for ingress
5. **Regularly update** Docker images for security patches
6. **Scan images** for vulnerabilities
7. **Use resource limits** to prevent resource exhaustion
8. **Enable pod security policies** or pod security standards

## Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Docker Hub - GPS Tracker MQTT](https://hub.docker.com/r/duwiarsana/gpsmqtt)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Kubernetes Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/)

## Support

For issues or questions:
- Check the [Troubleshooting](#troubleshooting) section
- Review pod logs: `kubectl logs -f deployment/gpstracker-app -n gpstracker`
- Open an issue in the GitHub repository
