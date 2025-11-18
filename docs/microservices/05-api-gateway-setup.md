# API Gateway Setup Guide

## 🎯 Why API Gateway?

- **Single Entry Point**: All requests go through one gateway
- **Authentication**: Centralized JWT validation
- **Rate Limiting**: Protect services from overload
- **Routing**: Route requests to appropriate services
- **Load Balancing**: Distribute traffic across service instances
- **Monitoring**: Centralized logging and metrics

## 🛠️ Technology Choice: Kong API Gateway

**Why Kong?**
- Open-source and free
- Highly scalable
- Plugin ecosystem
- Easy configuration
- Good documentation
- Supports both REST and GraphQL

## 📦 Installation

### Option 1: Docker Compose (Development)

```yaml
# docker-compose.kong.yml
version: '3.8'

services:
  kong-database:
    image: postgres:15
    environment:
      POSTGRES_USER: kong
      POSTGRES_PASSWORD: kong
      POSTGRES_DB: kong
    volumes:
      - kong_data:/var/lib/postgresql/data

  kong-migrations:
    image: kong:latest
    command: kong migrations bootstrap
    environment:
      KONG_DATABASE: postgres
      KONG_PG_HOST: kong-database
      KONG_PG_USER: kong
      KONG_PG_PASSWORD: kong
      KONG_PG_DATABASE: kong
    depends_on:
      - kong-database

  kong:
    image: kong:latest
    environment:
      KONG_DATABASE: postgres
      KONG_PG_HOST: kong-database
      KONG_PG_USER: kong
      KONG_PG_PASSWORD: kong
      KONG_PG_DATABASE: kong
      KONG_PROXY_ACCESS_LOG: /dev/stdout
      KONG_ADMIN_ACCESS_LOG: /dev/stdout
      KONG_PROXY_ERROR_LOG: /dev/stderr
      KONG_ADMIN_ERROR_LOG: /dev/stderr
      KONG_ADMIN_LISTEN: 0.0.0.0:8001
    ports:
      - "8000:8000"  # Proxy port
      - "8443:8443"  # Proxy SSL port
      - "8001:8001"  # Admin API
      - "8444:8444"  # Admin API SSL
    depends_on:
      - kong-database
      - kong-migrations

  kong-dashboard:
    image: pgbi/kong-dashboard:latest
    ports:
      - "8080:8080"
    environment:
      KONG_API_URL: http://kong:8001
    depends_on:
      - kong

volumes:
  kong_data:
```

### Option 2: Kubernetes (Production)

```yaml
# kong-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kong
  namespace: api-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: kong
  template:
    metadata:
      labels:
        app: kong
    spec:
      containers:
      - name: kong
        image: kong:latest
        env:
        - name: KONG_DATABASE
          value: "postgres"
        - name: KONG_PG_HOST
          value: "kong-database"
        - name: KONG_PG_USER
          value: "kong"
        - name: KONG_PG_PASSWORD
          valueFrom:
            secretKeyRef:
              name: kong-secrets
              key: password
        ports:
        - containerPort: 8000
        - containerPort: 8001
---
apiVersion: v1
kind: Service
metadata:
  name: kong
  namespace: api-gateway
spec:
  selector:
    app: kong
  ports:
  - port: 80
    targetPort: 8000
    name: proxy
  - port: 8001
    targetPort: 8001
    name: admin
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: kong-ingress
  namespace: api-gateway
spec:
  rules:
  - host: api.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: kong
            port:
              number: 80
```

## 🔧 Configuration

### 1. Add Services to Kong

```bash
# Add Auth Service
curl -i -X POST http://localhost:8001/services/ \
  --data "name=auth-service" \
  --data "url=http://auth-service:8000"

# Add Student Service
curl -i -X POST http://localhost:8001/services/ \
  --data "name=student-service" \
  --data "url=http://student-service:8000"

# Add Teacher Service
curl -i -X POST http://localhost:8001/services/ \
  --data "name=teacher-service" \
  --data "url=http://teacher-service:8000"
```

### 2. Add Routes

```bash
# Route for Auth Service
curl -i -X POST http://localhost:8001/services/auth-service/routes \
  --data "hosts[]=api.yourdomain.com" \
  --data "paths[]=/api/auth"

# Route for Student Service
curl -i -X POST http://localhost:8001/services/student-service/routes \
  --data "hosts[]=api.yourdomain.com" \
  --data "paths[]=/api/students"

# Route for Teacher Service
curl -i -X POST http://localhost:8001/services/teacher-service/routes \
  --data "hosts[]=api.yourdomain.com" \
  --data "paths[]=/api/teachers"
```

### 3. Enable Plugins

#### JWT Authentication Plugin

```bash
# Enable JWT plugin for all services (except auth)
curl -i -X POST http://localhost:8001/services/student-service/plugins \
  --data "name=jwt"

# Configure JWT secret (same as Auth Service)
curl -i -X POST http://localhost:8001/services/student-service/plugins \
  --data "name=jwt" \
  --data "config.secret_is_base64=false" \
  --data "config.key_claim_name=user_id"
```

#### Rate Limiting Plugin

```bash
# Add rate limiting
curl -i -X POST http://localhost:8001/services/student-service/plugins \
  --data "name=rate-limiting" \
  --data "config.minute=100" \
  --data "config.hour=1000"
```

#### CORS Plugin

```bash
# Enable CORS
curl -i -X POST http://localhost:8001/services/student-service/plugins \
  --data "name=cors" \
  --data "config.origins=*" \
  --data "config.methods=GET,POST,PUT,DELETE,OPTIONS" \
  --data "config.headers=Accept,Authorization,Content-Type"
```

#### Request Logging Plugin

```bash
# Enable request logging
curl -i -X POST http://localhost:8001/services/student-service/plugins \
  --data "name=file-log" \
  --data "config.path=/tmp/kong-access.log"
```

## 🔐 JWT Validation Setup

### Custom JWT Validator (Validate with Auth Service)

Create a custom plugin to validate JWT tokens with Auth Service:

```lua
-- kong/plugins/jwt-validator/jwt-validator.lua
local http = require "resty.http"
local cjson = require "cjson"

local JwtValidator = {}

function JwtValidator:access(conf)
  local token = ngx.req.get_headers()["Authorization"]
  
  if not token then
    ngx.status = 401
    ngx.say('{"error": "Missing token"}')
    ngx.exit(401)
  end
  
  -- Extract token
  token = string.gsub(token, "Bearer ", "")
  
  -- Validate with Auth Service
  local httpc = http.new()
  local res, err = httpc:request_uri("http://auth-service:8000/api/auth/validate-token", {
    method = "POST",
    headers = {
      ["Content-Type"] = "application/json",
      ["Authorization"] = "Bearer " .. token
    }
  })
  
  if not res or res.status ~= 200 then
    ngx.status = 401
    ngx.say('{"error": "Invalid token"}')
    ngx.exit(401)
  end
  
  -- Add user info to headers for downstream services
  local user_data = cjson.decode(res.body)
  ngx.req.set_header("X-User-Id", user_data.user_id)
  ngx.req.set_header("X-User-Role", user_data.role)
end

return JwtValidator
```

## 📊 Monitoring Setup

### Prometheus Plugin

```bash
# Enable Prometheus metrics
curl -i -X POST http://localhost:8001/services/student-service/plugins \
  --data "name=prometheus"
```

### Access Metrics

```bash
# Get metrics
curl http://localhost:8001/metrics
```

## 🔄 Routing Configuration (Declarative)

Create `kong.yml` for declarative configuration:

```yaml
_format_version: "3.0"

services:
  - name: auth-service
    url: http://auth-service:8000
    routes:
      - name: auth-route
        paths:
          - /api/auth
        methods:
          - GET
          - POST
          - PUT
          - DELETE
    plugins:
      - name: cors
        config:
          origins:
            - "*"
          methods:
            - GET
            - POST
            - PUT
            - DELETE
            - OPTIONS

  - name: student-service
    url: http://student-service:8000
    routes:
      - name: student-route
        paths:
          - /api/students
        methods:
          - GET
          - POST
          - PUT
          - DELETE
    plugins:
      - name: jwt
      - name: rate-limiting
        config:
          minute: 100
          hour: 1000
      - name: cors
        config:
          origins:
            - "*"
          methods:
            - GET
            - POST
            - PUT
            - DELETE
            - OPTIONS

  - name: teacher-service
    url: http://teacher-service:8000
    routes:
      - name: teacher-route
        paths:
          - /api/teachers
    plugins:
      - name: jwt
      - name: rate-limiting
        config:
          minute: 100

  - name: attendance-service
    url: http://attendance-service:8000
    routes:
      - name: attendance-route
        paths:
          - /api/attendance
    plugins:
      - name: jwt

  - name: notification-service
    url: http://notification-service:8000
    routes:
      - name: notification-route
        paths:
          - /api/notifications
    plugins:
      - name: jwt

  - name: academic-service
    url: http://academic-service:8000
    routes:
      - name: academic-route
        paths:
          - /api/campus
          - /api/classes
          - /api/grades
          - /api/levels
    plugins:
      - name: jwt
```

### Apply Configuration

```bash
# Apply declarative config
kong config -c kong.yml db_import
```

## 🚀 Production Best Practices

### 1. High Availability
- Deploy multiple Kong instances
- Use load balancer in front
- Database replication for Kong DB

### 2. Security
- Enable HTTPS/TLS
- Use secrets for sensitive config
- Regular security updates

### 3. Performance
- Enable caching plugin
- Optimize plugin order
- Monitor response times

### 4. Monitoring
- Setup Prometheus + Grafana
- Alert on high error rates
- Track request latency

## 📝 Example: Complete Setup Script

```bash
#!/bin/bash

# Setup Kong Services
KONG_ADMIN="http://localhost:8001"

# Auth Service
curl -X POST $KONG_ADMIN/services \
  -d "name=auth-service" \
  -d "url=http://auth-service:8000"

curl -X POST $KONG_ADMIN/services/auth-service/routes \
  -d "paths[]=/api/auth"

# Student Service
curl -X POST $KONG_ADMIN/services \
  -d "name=student-service" \
  -d "url=http://student-service:8000"

curl -X POST $KONG_ADMIN/services/student-service/routes \
  -d "paths[]=/api/students"

curl -X POST $KONG_ADMIN/services/student-service/plugins \
  -d "name=jwt"

curl -X POST $KONG_ADMIN/services/student-service/plugins \
  -d "name=rate-limiting" \
  -d "config.minute=100"

# Repeat for other services...
```

## ✅ Testing

### Test Routes

```bash
# Test Auth Service (no JWT needed)
curl http://localhost:8000/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Test Student Service (JWT required)
curl http://localhost:8000/api/students/ \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🔍 Troubleshooting

### Check Service Status
```bash
curl http://localhost:8001/services/
```

### Check Routes
```bash
curl http://localhost:8001/routes/
```

### Check Plugins
```bash
curl http://localhost:8001/plugins/
```

### View Logs
```bash
# Kong logs
docker logs kong

# Or in Kubernetes
kubectl logs -n api-gateway deployment/kong
```

