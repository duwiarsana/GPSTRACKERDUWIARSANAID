# Frontend Dockerfile (production)
# 1) Build stage
FROM node:18-alpine AS build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
# Ensure API base can be overridden at runtime via env if needed; for now REACT_APP_API_URL can be set in build args
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=${REACT_APP_API_URL}
RUN npm run build

# 2) Nginx serve stage
FROM nginx:1.27-alpine AS serve
WORKDIR /usr/share/nginx/html
# Remove default static content
RUN rm -rf ./*
# Copy build artifacts
COPY --from=build /app/frontend/build ./
# Copy nginx config
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
