# GPS Tracker MQTT - Deployment Guide

## 🚀 Unified Docker Deployment

Aplikasi ini menggunakan **unified Docker image** yang menggabungkan frontend (React + Nginx) dan backend (Node.js) dalam satu container untuk kemudahan deployment.

### Arsitektur

```
┌─────────────────────────────────────┐
│   Container: gpstracker-app         │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Nginx (Port 80)             │  │
│  │  - Serve Frontend Static     │  │
│  │  - Proxy /api/* → :5050      │  │
│  │  - Proxy /socket.io/* → :5050│  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Node.js Backend (Port 5050) │  │
│  │  - REST API                  │  │
│  │  - WebSocket (Socket.IO)     │  │
│  │  - MQTT Client               │  │
│  └──────────────────────────────┘  │
│                                     │
│  Managed by: Supervisord            │
└─────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│   Container: gpstracker-mongo       │
│   MongoDB Database                  │
└─────────────────────────────────────┘
```

## 📋 Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum
- Port 80, 5050, 27017, 8081 available

## 🔧 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/duwiarsana/GPS-TRACKER-MQTT.git
cd GPS-TRACKER-MQTT
```

### 2. Configure Environment (Optional)

```bash
cp .env.example .env
nano .env
```

Edit environment variables sesuai kebutuhan:
- `JWT_SECRET`: Ganti dengan secret key yang aman
- `MQTT_BROKER_URL`: URL MQTT broker Anda
- `TELEGRAM_BOT_TOKEN`: Token bot Telegram (opsional)
- `TELEGRAM_DEFAULT_CHAT_ID`: Chat ID Telegram (opsional)

### 3. Deploy dengan Docker Compose

```bash
# Pull image dari Docker Hub (jika sudah tersedia)
docker-compose pull

# Atau build lokal
docker-compose up --build -d
```

### 4. Verifikasi Deployment

```bash
# Check status containers
docker-compose ps

# Check logs
docker-compose logs -f app

# Test frontend
curl http://localhost:80

# Test backend API
curl http://localhost:80/health
```

## 🌐 Access Points

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost | Dashboard GPS Tracker |
| **Backend API** | http://localhost/api/v1 | REST API (proxied via Nginx) |
| **WebSocket** | http://localhost/socket.io | Real-time updates |
| **Health Check** | http://localhost/health | Application health status |
| **Mongo Express** | http://localhost:8081 | MongoDB admin UI |
| **MongoDB** | localhost:27017 | Database direct access |

## 📦 Docker Image Details

### Image: `duwiarsana/gpsmqtt:latest`

**Multi-stage Build:**
1. **Stage 1**: Build React frontend → static files
2. **Stage 2**: Install Node.js backend dependencies
3. **Stage 3**: Combine everything dengan Nginx + Supervisord

**Image Size:** ~200MB (optimized)

**Included:**
- ✅ Frontend React app (production build)
- ✅ Backend Node.js API
- ✅ Nginx web server
- ✅ Supervisord process manager
- ✅ Health checks
- ✅ Auto-restart on failure

## 🔄 Update Deployment

### Pull Latest Image dari Docker Hub

```bash
docker-compose pull app
docker-compose up -d
```

### Rebuild dari Source

```bash
docker-compose up --build -d
```

## 🛠️ Management Commands

### Start Services
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### Stop & Remove All Data
```bash
docker-compose down -v
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f mongo
```

### Restart Services
```bash
docker-compose restart app
```

### Execute Commands in Container
```bash
# Access app container shell
docker-compose exec app sh

# Check nginx status
docker-compose exec app supervisorctl status

# View backend logs
docker-compose exec app tail -f /var/log/supervisor/supervisord.log
```

## 🔐 Production Deployment

### 1. Security Checklist

- [ ] Change `JWT_SECRET` to a strong random value
- [ ] Configure firewall (allow only 80, 443)
- [ ] Enable HTTPS with SSL certificate
- [ ] Remove or secure Mongo Express (port 8081)
- [ ] Set strong MongoDB authentication
- [ ] Configure CORS properly
- [ ] Review and limit exposed ports

### 2. Environment Variables untuk Production

```bash
# .env file
JWT_SECRET=your-super-secret-random-key-min-32-chars
MQTT_BROKER_URL=mqtt://your-mqtt-broker:1883
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_DEFAULT_CHAT_ID=your-chat-id
LOG_LEVEL=warn
```

### 3. Remove Mongo Express di Production

Edit `docker-compose.yml`, comment out atau hapus service `mongo-express`:

```yaml
# mongo-express:
#   image: mongo-express:1.0.2
#   ...
```

### 4. Enable HTTPS (Recommended)

Gunakan reverse proxy seperti Nginx atau Traefik dengan Let's Encrypt:

```yaml
services:
  app:
    # ... existing config
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.gpstracker.rule=Host(`your-domain.com`)"
      - "traefik.http.routers.gpstracker.entrypoints=websecure"
      - "traefik.http.routers.gpstracker.tls.certresolver=letsencrypt"
```

## 📊 Monitoring

### Health Checks

Container memiliki built-in health check:

```bash
# Check health status
docker inspect gpstracker-app | grep -A 10 Health
```

### Resource Usage

```bash
# Monitor resource usage
docker stats gpstracker-app gpstracker-mongo
```

## 🐛 Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs app

# Check if ports are in use
lsof -i :80
lsof -i :5050

# Restart with fresh build
docker-compose down -v
docker-compose up --build -d
```

### Frontend Not Loading

```bash
# Check nginx status inside container
docker-compose exec app supervisorctl status nginx

# Check nginx logs
docker-compose exec app cat /var/log/nginx/error.log
```

### Backend API Not Responding

```bash
# Check backend status
docker-compose exec app supervisorctl status backend

# Check backend logs
docker-compose logs app | grep backend

# Check MongoDB connection
docker-compose exec mongo mongosh --eval "db.adminCommand('ping')"
```

### Database Connection Issues

```bash
# Ensure MongoDB is healthy
docker-compose ps mongo

# Check MongoDB logs
docker-compose logs mongo

# Test connection from app container
docker-compose exec app wget -O- http://mongo:27017
```

## 🔄 GitHub Actions CI/CD

Image akan otomatis di-build dan di-push ke Docker Hub saat push ke branch `main`:

```yaml
# .github/workflows/dockergpsdeploy.yml
# Automatically builds and pushes:
# - duwiarsana/gpsmqtt:latest
# - duwiarsana/gpsmqtt:latest_gpsmqtt
```

Setelah GitHub Actions selesai build, deploy dengan:

```bash
docker-compose pull
docker-compose up -d
```

## 📝 Notes

- **Single Port Access**: Semua akses melalui port 80 (Nginx proxy)
- **WebSocket Support**: Socket.IO di-proxy melalui Nginx
- **Process Management**: Supervisord mengelola Nginx + Node.js
- **Auto Restart**: Kedua service akan auto-restart jika crash
- **Health Checks**: Container health check setiap 30 detik
- **Optimized Build**: Multi-stage build untuk minimize image size

## 🆘 Support

Jika ada masalah, check:
1. Logs: `docker-compose logs -f app`
2. Container status: `docker-compose ps`
3. Health check: `curl http://localhost/health`
4. Process status: `docker-compose exec app supervisorctl status`

---

**Happy Tracking! 🛰️📍**
