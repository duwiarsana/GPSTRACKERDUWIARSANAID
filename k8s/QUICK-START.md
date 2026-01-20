# Quick Start Guide - Kubernetes Deployment

## Prerequisites

- Kubernetes cluster running
- `kubectl` configured
- Docker image built and pushed to Docker Hub

## 1. Update Secrets (IMPORTANT!)

Edit `k8s/02-secret.yaml` and change these values:

```yaml
stringData:
  JWT_SECRET: "your-super-secret-key-here"
  ADMIN_EMAIL: "admin@admin.com"
  ADMIN_PASSWORD: "admin123"
```

## 2. Deploy Everything

```bash
# Deploy all resources
kubectl apply -f k8s/

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l app=gpstracker-app -n gpstracker --timeout=300s
```

## 3. Check Status

```bash
# View all resources
kubectl get all -n gpstracker

# Check pods
kubectl get pods -n gpstracker

# View logs
kubectl logs -f deployment/gpstracker-app -n gpstracker
```

## 4. Access Application

```bash
# Get LoadBalancer IP
kubectl get svc gpstracker-app -n gpstracker

# Access via browser
# Frontend: http://<EXTERNAL-IP>
# Backend: http://<EXTERNAL-IP>:5050

# Or use port-forward for testing
kubectl port-forward svc/gpstracker-app 8080:80 -n gpstracker
# Then open: http://localhost:8080
```

## 5. Login

- **Email**: admin@admin.com
- **Password**: admin123

## Update Deployment

```bash
# After GitHub Actions builds new image
kubectl set image deployment/gpstracker-app gpstracker=duwiarsana/gpsmqtt:latest -n gpstracker

# Check rollout status
kubectl rollout status deployment/gpstracker-app -n gpstracker
```

## Troubleshooting

```bash
# View pod logs
kubectl logs -f deployment/gpstracker-app -n gpstracker

# Describe pod
kubectl describe pod <pod-name> -n gpstracker

# Check events
kubectl get events -n gpstracker --sort-by='.lastTimestamp'

# Restart deployment
kubectl rollout restart deployment/gpstracker-app -n gpstracker
```

## Cleanup

```bash
# Delete everything
kubectl delete namespace gpstracker
```

For detailed documentation, see [README.md](./README.md)
