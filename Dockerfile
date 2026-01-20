# Multi-stage Dockerfile for GPS Tracker MQTT
# Optimized unified image with frontend (Nginx) + backend (Node.js)

# ============================================
# Stage 1: Build Frontend
# ============================================
FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend

# Copy package files and install dependencies
COPY frontend/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy frontend source and build
COPY frontend ./
ARG REACT_APP_API_URL=/api/v1
ENV REACT_APP_API_URL=${REACT_APP_API_URL}
RUN npm run build

# ============================================
# Stage 2: Build Backend Dependencies
# ============================================
FROM node:18-alpine AS backend-deps
WORKDIR /app/backend

# Copy package files and install production dependencies only
COPY backend/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ============================================
# Stage 3: Final Production Image
# ============================================
FROM node:18-alpine AS production

# Install nginx and supervisor for process management
RUN apk add --no-cache \
    nginx \
    supervisor \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy backend application
COPY backend ./backend
COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules

# Copy frontend build to nginx html directory
COPY --from=frontend-build /app/frontend/build /usr/share/nginx/html

# Copy nginx configuration
COPY frontend/nginx.conf /etc/nginx/http.d/default.conf

# Create necessary directories
RUN mkdir -p /run/nginx /var/log/supervisor /app/logs

# Create supervisord configuration
RUN echo '[supervisord]' > /etc/supervisord.conf && \
    echo 'nodaemon=true' >> /etc/supervisord.conf && \
    echo 'user=root' >> /etc/supervisord.conf && \
    echo 'logfile=/var/log/supervisor/supervisord.log' >> /etc/supervisord.conf && \
    echo 'pidfile=/var/run/supervisord.pid' >> /etc/supervisord.conf && \
    echo '' >> /etc/supervisord.conf && \
    echo '[program:nginx]' >> /etc/supervisord.conf && \
    echo 'command=nginx -g "daemon off;"' >> /etc/supervisord.conf && \
    echo 'autostart=true' >> /etc/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisord.conf && \
    echo 'stdout_logfile=/dev/stdout' >> /etc/supervisord.conf && \
    echo 'stdout_logfile_maxbytes=0' >> /etc/supervisord.conf && \
    echo 'stderr_logfile=/dev/stderr' >> /etc/supervisord.conf && \
    echo 'stderr_logfile_maxbytes=0' >> /etc/supervisord.conf && \
    echo '' >> /etc/supervisord.conf && \
    echo '[program:backend]' >> /etc/supervisord.conf && \
    echo 'command=node src/server.js' >> /etc/supervisord.conf && \
    echo 'directory=/app/backend' >> /etc/supervisord.conf && \
    echo 'autostart=true' >> /etc/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisord.conf && \
    echo 'stdout_logfile=/dev/stdout' >> /etc/supervisord.conf && \
    echo 'stdout_logfile_maxbytes=0' >> /etc/supervisord.conf && \
    echo 'stderr_logfile=/dev/stderr' >> /etc/supervisord.conf && \
    echo 'stderr_logfile_maxbytes=0' >> /etc/supervisord.conf

# Environment variables
ENV NODE_ENV=production \
    PORT=5050

# Expose ports (80 for frontend, 5050 for backend API)
EXPOSE 80 5050

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Start supervisord to manage both nginx and node
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
