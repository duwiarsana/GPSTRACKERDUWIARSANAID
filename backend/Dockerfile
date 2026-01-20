# Backend Dockerfile (production)
FROM node:18-alpine AS base
WORKDIR /app

# Install dependencies first (leverage Docker cache)
COPY backend/package*.json ./backend/
RUN cd backend \
 && npm install --omit=dev

# Copy source
COPY backend ./backend
WORKDIR /app/backend

ENV NODE_ENV=production
EXPOSE 5050

CMD ["node", "src/server.js"]
