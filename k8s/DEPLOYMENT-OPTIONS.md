# Kubernetes Deployment Options

This project supports **two deployment architectures** for Kubernetes, each with different Docker images built by GitHub Actions.

## 📦 Docker Images

GitHub Actions automatically builds and pushes **3 Docker images** to Docker Hub:

1. **Unified Image**: `duwiarsana/gpsmqtt:latest`
   - Contains both frontend (Nginx + React) and backend (Node.js)
   - Managed by supervisord
   - Single container deployment

2. **Backend Image**: `duwiarsana/gpsmqtt-backend:latest`
   - Node.js REST API only
   - Separate container

3. **Frontend Image**: `duwiarsana/gpsmqtt-frontend:latest`
   - Nginx + React SPA only
   - Separate container

## 🏗️ Deployment Architectures

### Option 1: Unified Deployment (Recommended for Simple Setup)

**Location**: `k8s/` (root directory)

**Architecture**:
```
Ingress/LoadBalancer
        ↓
   Unified App Pods (2-10)
   [Nginx + Node.js]
        ↓
    MongoDB
```

**Pros**:
- ✅ Simpler setup
- ✅ Fewer pods to manage
- ✅ Single image to update
- ✅ Good for small to medium deployments

**Cons**:
- ❌ Cannot scale frontend/backend independently
- ❌ Higher resource usage per pod
- ❌ Must update both components together

**Deploy**:
```bash
kubectl apply -f k8s/
```

**Docker Image Used**:
- `duwiarsana/gpsmqtt:latest`

---

### Option 2: Separate Deployment (Recommended for Production)

**Location**: `k8s/separate/`

**Architecture**:
```
        Ingress
       /      \
      /        \
Frontend     Backend
(2-5 pods)   (2-10 pods)
[Nginx]      [Node.js]
      \        /
       \      /
       MongoDB
```

**Pros**:
- ✅ Independent scaling for frontend and backend
- ✅ Better resource utilization
- ✅ Update frontend or backend independently
- ✅ True microservices architecture
- ✅ Lower resource usage per pod

**Cons**:
- ❌ More complex setup
- ❌ More pods to manage
- ❌ Requires Ingress configuration

**Deploy**:
```bash
kubectl apply -f k8s/separate/
```

**Docker Images Used**:
- `duwiarsana/gpsmqtt-backend:latest`
- `duwiarsana/gpsmqtt-frontend:latest`

---

## 🚀 GitHub Actions Workflow

The workflow (`.github/workflows/dockergpsdeploy.yml`) builds all 3 images in parallel:

### Trigger Events
- Push to `main` branch
- Git tags (e.g., `v1.0.0`)
- Pull requests (build only, no push)
- Manual workflow dispatch

### Image Tags Generated

For each image, the following tags are created:

- `latest` - Latest main branch build
- `main-<sha>` - Specific commit on main
- `v1.0.0` - Semantic version tag
- `1.0` - Major.minor version
- `1` - Major version

**Example**:
```bash
# After pushing to main with commit abc123
duwiarsana/gpsmqtt:latest
duwiarsana/gpsmqtt:main-abc123
duwiarsana/gpsmqtt-backend:latest
duwiarsana/gpsmqtt-backend:main-abc123
duwiarsana/gpsmqtt-frontend:latest
duwiarsana/gpsmqtt-frontend:main-abc123

# After creating tag v1.0.0
duwiarsana/gpsmqtt:v1.0.0
duwiarsana/gpsmqtt:1.0
duwiarsana/gpsmqtt:1
duwiarsana/gpsmqtt-backend:v1.0.0
duwiarsana/gpsmqtt-backend:1.0
duwiarsana/gpsmqtt-backend:1
duwiarsana/gpsmqtt-frontend:v1.0.0
duwiarsana/gpsmqtt-frontend:1.0
duwiarsana/gpsmqtt-frontend:1
```

---

## 📊 Comparison Table

| Feature | Unified Deployment | Separate Deployment |
|---------|-------------------|---------------------|
| **Complexity** | Simple ⭐ | Moderate ⭐⭐ |
| **Setup Time** | Fast | Medium |
| **Total Pods** | 2-10 | 4-15 |
| **Scaling** | Together only | Independent ✅ |
| **Resource/Pod** | Higher | Lower |
| **Updates** | Both together | Independent ✅ |
| **Rollback** | Both together | Independent ✅ |
| **Best For** | Dev, Small prod | Production, High traffic |
| **Microservices** | No | Yes ✅ |
| **Cost** | Medium | Lower (better utilization) |

---

## 🎯 Which One Should You Choose?

### Choose **Unified Deployment** if:
- 🔹 You're just getting started
- 🔹 Small to medium traffic
- 🔹 Development or staging environment
- 🔹 Simple operations preferred
- 🔹 Team is small

### Choose **Separate Deployment** if:
- 🔹 Production environment
- 🔹 High traffic or expecting growth
- 🔹 Need independent scaling
- 🔹 Frontend and backend have different update cycles
- 🔹 Want better resource optimization
- 🔹 Following microservices architecture

---

## 📝 Quick Start Commands

### Unified Deployment
```bash
# 1. Update secrets
vim k8s/02-secret.yaml

# 2. Deploy
kubectl apply -f k8s/

# 3. Check status
kubectl get all -n gpstracker

# 4. Get access URL
kubectl get svc gpstracker-app -n gpstracker
```

### Separate Deployment
```bash
# 1. Update secrets
vim k8s/separate/02-secret.yaml

# 2. Deploy
kubectl apply -f k8s/separate/

# 3. Check status
kubectl get all -n gpstracker

# 4. Get access URL
kubectl get svc gpstracker-frontend -n gpstracker
```

---

## 🔄 Updating Deployments

### After GitHub Actions Builds New Images

**Unified Deployment**:
```bash
kubectl set image deployment/gpstracker-app \
  gpstracker=duwiarsana/gpsmqtt:latest -n gpstracker
  
kubectl rollout status deployment/gpstracker-app -n gpstracker
```

**Separate Deployment**:
```bash
# Update backend only
kubectl set image deployment/gpstracker-backend \
  backend=duwiarsana/gpsmqtt-backend:latest -n gpstracker

# Update frontend only
kubectl set image deployment/gpstracker-frontend \
  frontend=duwiarsana/gpsmqtt-frontend:latest -n gpstracker

# Check rollout
kubectl rollout status deployment/gpstracker-backend -n gpstracker
kubectl rollout status deployment/gpstracker-frontend -n gpstracker
```

---

## 🔧 Migration Between Deployments

### From Unified to Separate

```bash
# 1. Backup data (optional but recommended)
kubectl exec -n gpstracker deployment/mongo -- \
  mongodump --out=/tmp/backup

# 2. Delete unified deployment (keeps MongoDB and data)
kubectl delete deployment gpstracker-app -n gpstracker
kubectl delete service gpstracker-app -n gpstracker
kubectl delete hpa gpstracker-app-hpa -n gpstracker

# 3. Deploy separate architecture
kubectl apply -f k8s/separate/

# 4. Verify
kubectl get all -n gpstracker
```

### From Separate to Unified

```bash
# 1. Backup data (optional but recommended)
kubectl exec -n gpstracker deployment/mongo -- \
  mongodump --out=/tmp/backup

# 2. Delete separate deployments (keeps MongoDB and data)
kubectl delete deployment gpstracker-backend -n gpstracker
kubectl delete deployment gpstracker-frontend -n gpstracker
kubectl delete service gpstracker-backend -n gpstracker
kubectl delete service gpstracker-frontend -n gpstracker
kubectl delete hpa gpstracker-backend-hpa -n gpstracker
kubectl delete hpa gpstracker-frontend-hpa -n gpstracker

# 3. Deploy unified architecture
kubectl apply -f k8s/

# 4. Verify
kubectl get all -n gpstracker
```

---

## 📚 Additional Documentation

- **Unified Deployment**: [k8s/README.md](./README.md)
- **Separate Deployment**: [k8s/separate/README.md](./separate/README.md)
- **GitHub Actions**: [.github/workflows/dockergpsdeploy.yml](../.github/workflows/dockergpsdeploy.yml)
- **Docker Compose**: [docker-compose.yml](../docker-compose.yml)

---

## 🆘 Support

For issues or questions:
1. Check the deployment-specific README
2. Review pod logs: `kubectl logs -f deployment/<name> -n gpstracker`
3. Check events: `kubectl get events -n gpstracker --sort-by='.lastTimestamp'`
4. Open an issue in the GitHub repository
