# Docker & nginx

## Dockerfile (Multi-stage)

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Build args for VITE_ env vars (needed at build time)
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY package*.json ./
RUN npm ci --prefer-offline

COPY . .
RUN npm run build

# Stage 2: Serve (minimal nginx)
FROM nginx:alpine AS server

# Run as non-root
USER nginx

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/conf.d/ /etc/nginx/conf.d/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/health || exit 1
```

## nginx.conf

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
    gzip_min_length 1000;

    include /etc/nginx/conf.d/*.conf;
}
```

## conf.d/default.conf

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Security headers on all responses
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # Static assets — aggressive caching (Vite hashes filenames)
    location ~* \.(js|css|woff2?|ttf|svg|ico|png|jpg|webp|avif)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API proxy (adjust upstream as needed)
    location /service/ {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 35s;
    }

    # Healthcheck
    location /health {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }

    # SPA fallback — MUST be last
    location / {
        try_files $uri $uri/ /200.html;
    }
}
```

## conf.d/rate-limit.conf

```nginx
# Rate limiting zones — include in http block
limit_req_zone $binary_remote_addr zone=api_general:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=queryui:10m rate=10r/s;
```

## docker-compose.yml

```yaml
services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        VITE_API_BASE_URL: ${VITE_API_BASE_URL:-http://localhost:8080}
    ports:
      - "3000:80"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/health"]
      interval: 30s
      timeout: 3s
      retries: 3
```

## SvelteKit adapter-static Config

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: '200.html',  // SPA fallback file
      precompress: false,
      strict: true
    })
  }
};
```

## Environment Variables

```env
# .env.example
# Build-time (VITE_ prefix — embedded in JS bundle)
VITE_API_BASE_URL=https://api.example.com

# Never commit secrets. Runtime config via Brand Config API or /config endpoint.
# MSW auto-enabled when NODE_ENV !== 'production' (no env var needed)
```

Rules:
- `VITE_*` vars are embedded at build time — do NOT put secrets here
- Runtime config (API keys, tenant config) must be fetched via API after app loads
- Never put `VITE_SECRET_*` or tokens in build args
