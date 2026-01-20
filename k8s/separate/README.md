# Separate Backend/Frontend Kubernetes Deployment

This directory contains Kubernetes manifests for deploying the GPS Tracker MQTT application with **separate backend and frontend containers**.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                    │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              Namespace: gpstracker                  │ │
│  │                                                     │ │
│  │  ┌──────────────┐         ┌──────────────────┐    │ │
│  │  │   Ingress    │────────▶│  LoadBalancer    │    │ │
│  │  │              │         │    (Frontend)    │    │ │
│  │  └──────┬───────┘         └────────┬─────────┘    │ │
│  │         │                          │              │ │
│  │         │ /api/*                   │              │ │
│  │         │ /socket.io/*    ┌────────▼─────────┐    │ │
│  │         │                 │    Frontend      │    │ │
│  │         │                 │  (2-5 Pods)      │    │ │
│  │         │                 │  Nginx + React   │    │ │
│  │         │                 └──────────────────┘    │ │
│  │         │                                         │ │
│  │         │                 ┌──────────────────┐    │ │
│  │         └────────────────▶│    Backend       │    │ │
│  │                           │  (2-10 Pods)     │    │ │
│  │                           │  Node.js API     │    │ │
│  │                           └─────────┬────────┘    │ │
│  │                                     │             │ │
│  │                           ┌─────────▼────────┐    │ │
│  │                           │  MongoDB Service │    │ │
│  │                           │   (ClusterIP)    │    │ │
│  │                           └─────────┬────────┘    │ │
│  │                                     │             │ │
│  │                           ┌─────────▼────────┐    │ │
│  │                           │     MongoDB      │    │ │
│  │                           │    (1 Pod)       │    │ │
│  │                           │ + PersistentVol  │    │ │
│  │                           └──────────────────┘    │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Components

### Docker Images Used

- **Backend**: `duwiarsana/gpsmqtt-backend:latest`
- **Frontend**: `duwiarsana/gpsmqtt-frontend:latest`
- **MongoDB**: `mongo:6`

### Services

1. **MongoDB** (1 replica)
   - Database for storing GPS tracker data
   - Persistent storage with PVC

2. **Backend** (2-10 replicas with HPA)
   - Node.js REST API
   - WebSocket support (Socket.IO)
   - MQTT integration
   - Auto-scaling based on CPU/Memory

3. **Frontend** (2-5 replicas with HPA)
   - React SPA served by Nginx
   - Proxies API requests to backend
   - Auto-scaling based on CPU/Memory

## Advantages of Separate Deployment

✅ **Independent Scaling**: Scale frontend and backend independently
✅ **Better Resource Utilization**: Different resource limits for each component
✅ **Easier Updates**: Update frontend or backend without affecting the other
✅ **Microservices Architecture**: Better separation of concerns
✅ **Flexible Deployment**: Deploy to different nodes/zones

## Quick Start

### 1. Update Secrets

```bash
# Edit secrets
vim k8s/separate/02-secret.yaml

# Update:
# - JWT_SECRET
# - TELEGRAM_BOT_TOKEN (optional)
# - ADMIN_EMAIL
# - ADMIN_PASSWORD
```

### 2. Deploy All Resources

```bash
# Deploy everything
kubectl apply -f k8s/separate/

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l app=gpstracker-backend -n gpstracker --timeout=300s
kubectl wait --for=condition=ready pod -l app=gpstracker-frontend -n gpstracker --timeout=300s
```

### 3. Verify Deployment

```bash
# Check all resources
kubectl get all -n gpstracker

# Check pods
kubectl get pods -n gpstracker

# Check services
kubectl get svc -n gpstracker

# View backend logs
kubectl logs -f deployment/gpstracker-backend -n gpstracker

# View frontend logs
kubectl logs -f deployment/gpstracker-frontend -n gpstracker
```

### 4. Access Application

```bash
# Get LoadBalancer external IP
kubectl get svc gpstracker-frontend -n gpstracker

# Access via browser
# http://<EXTERNAL-IP>

# Or use port-forward
kubectl port-forward svc/gpstracker-frontend 8080:80 -n gpstracker
# Open: http://localhost:8080
```

## Configuration

### Environment Variables

Managed through ConfigMap (`01-configmap.yaml`) and Secret (`02-secret.yaml`).

### Updating Configuration

```bash
# Edit ConfigMap
kubectl edit configmap gpstracker-config -n gpstracker

# Edit Secret
kubectl edit secret gpstracker-secret -n gpstracker

# Restart deployments to apply changes
kubectl rollout restart deployment/gpstracker-backend -n gpstracker
kubectl rollout restart deployment/gpstracker-frontend -n gpstracker
```

## Scaling

### Automatic Scaling (HPA)

**Backend HPA:**
- Min: 2 replicas
- Max: 10 replicas
- CPU threshold: 70%
- Memory threshold: 80%

**Frontend HPA:**
- Min: 2 replicas
- Max: 5 replicas
- CPU threshold: 70%
- Memory threshold: 80%

### Manual Scaling

```bash
# Scale backend
kubectl scale deployment gpstracker-backend --replicas=5 -n gpstracker

# Scale frontend
kubectl scale deployment gpstracker-frontend --replicas=3 -n gpstracker
```

## Updating Images

After GitHub Actions builds new images:

```bash
# Update backend
kubectl set image deployment/gpstracker-backend \
  backend=duwiarsana/gpsmqtt-backend:latest -n gpstracker

# Update frontend
kubectl set image deployment/gpstracker-frontend \
  frontend=duwiarsana/gpsmqtt-frontend:latest -n gpstracker

# Or use specific version
kubectl set image deployment/gpstracker-backend \
  backend=duwiarsana/gpsmqtt-backend:v1.0.0 -n gpstracker

# Verify rollout
kubectl rollout status deployment/gpstracker-backend -n gpstracker
kubectl rollout status deployment/gpstracker-frontend -n gpstracker
```

## Ingress Configuration

The Ingress routes traffic as follows:

- `/` → Frontend Service (port 80)
- `/api/*` → Backend Service (port 5050)
- `/socket.io/*` → Backend Service (port 5050)

### Enable Ingress

1. Install Ingress Controller (e.g., nginx):
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml
   ```

2. Update domain in `10-ingress.yaml`:
   ```yaml
   spec:
     rules:
     - host: your-domain.com  # Change this
   ```

3. Apply Ingress:
   ```bash
   kubectl apply -f k8s/separate/10-ingress.yaml
   ```

## Monitoring

```bash
# View resource usage
kubectl top pods -n gpstracker
kubectl top nodes

# View HPA status
kubectl get hpa -n gpstracker

# View detailed pod info
kubectl describe pod <pod-name> -n gpstracker

# View events
kubectl get events -n gpstracker --sort-by='.lastTimestamp'
```

## Troubleshooting

### Backend Issues

```bash
# Check backend pods
kubectl get pods -l app=gpstracker-backend -n gpstracker

# View backend logs
kubectl logs -f deployment/gpstracker-backend -n gpstracker

# Describe backend pod
kubectl describe pod <backend-pod-name> -n gpstracker

# Test backend from within cluster
kubectl run test --rm -it --image=busybox -n gpstracker -- sh
wget -O- http://gpstracker-backend:5050/health
```

### Frontend Issues

```bash
# Check frontend pods
kubectl get pods -l app=gpstracker-frontend -n gpstracker

# View frontend logs
kubectl logs -f deployment/gpstracker-frontend -n gpstracker

# Describe frontend pod
kubectl describe pod <frontend-pod-name> -n gpstracker

# Test frontend from within cluster
kubectl run test --rm -it --image=busybox -n gpstracker -- sh
wget -O- http://gpstracker-frontend
```

### MongoDB Connection Issues

```bash
# Check MongoDB pod
kubectl get pod -l app=mongo -n gpstracker

# Check MongoDB logs
kubectl logs -f deployment/mongo -n gpstracker

# Test MongoDB connection from backend pod
kubectl exec -it deployment/gpstracker-backend -n gpstracker -- sh
nc -zv mongo 27017
```

## Rollback

```bash
# View rollout history
kubectl rollout history deployment/gpstracker-backend -n gpstracker
kubectl rollout history deployment/gpstracker-frontend -n gpstracker

# Rollback to previous version
kubectl rollout undo deployment/gpstracker-backend -n gpstracker
kubectl rollout undo deployment/gpstracker-frontend -n gpstracker

# Rollback to specific revision
kubectl rollout undo deployment/gpstracker-backend --to-revision=2 -n gpstracker
```

## Cleanup

```bash
# Delete all resources
kubectl delete -f k8s/separate/

# Or delete namespace (removes everything)
kubectl delete namespace gpstracker
```

## Comparison: Unified vs Separate

| Feature | Unified Deployment | Separate Deployment |
|---------|-------------------|---------------------|
| **Complexity** | Simple | Moderate |
| **Scaling** | Scale together | Scale independently |
| **Resource Usage** | Higher per pod | Lower per pod |
| **Updates** | Update both together | Update independently |
| **Best For** | Small deployments | Production, high traffic |
| **Pods** | 2-10 (unified) | 4-15 (2-10 backend + 2-5 frontend) |

## When to Use Separate Deployment

✅ Production environments
✅ High traffic applications
✅ Need independent scaling
✅ Different update cycles for frontend/backend
✅ Better resource optimization
✅ Microservices architecture

## Additional Resources

- [Main Kubernetes README](../README.md)
- [Unified Deployment](../)
- [GitHub Actions Workflow](../../.github/workflows/dockergpsdeploy.yml)
