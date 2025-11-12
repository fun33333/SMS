# Production WebSocket Setup Guide (Without Docker)

## ✅ Haan, Production Mein WebSocket Kaam Karega!

## Requirements

1. **ASGI Server (Daphne)** - ✅ Already configured
2. **Redis** - Channel layer ke liye zaroori
3. **Proper ALLOWED_HOSTS** - WebSocket security ke liye
4. **Process Manager** (PM2/Supervisor/systemd) - Server restart ke liye
5. **Nginx Configuration** (agar use kar rahe ho)

---

## Step-by-Step Production Setup

### 1. Redis Installation & Setup

```bash
# Ubuntu/Debian:
sudo apt-get update
sudo apt-get install redis-server

# Redis start karein
sudo systemctl start redis
sudo systemctl enable redis  # Auto-start on boot

# Redis status check
sudo systemctl status redis

# Test Redis connection
redis-cli ping
# Should return: PONG
```

### 2. Backend Dependencies Install

```bash
cd backend

# Virtual environment activate karein (agar use kar rahe ho)
source venv/bin/activate  # Linux/Mac
# ya
venv\Scripts\activate  # Windows

# Dependencies install
pip install -r requirements.txt

# Verify daphne install
daphne --version
```

### 3. Environment Variables Setup

`.env` file mein production settings:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Redis
REDIS_URL=redis://127.0.0.1:6379/1

# Django Settings
DEBUG=False
SECRET_KEY=your-secret-key-here
ALLOWED_HOSTS=sms.idaraalkhair.sbs,your-domain.com

# CORS
CORS_ALLOW_ALL_ORIGINS=False
CORS_ALLOWED_ORIGINS=https://sms.idaraalkhair.sbs,https://your-domain.com
```

### 4. Backend Server Start (Daphne)

**Option A: Direct Run (Testing ke liye)**
```bash
cd backend
daphne -b 0.0.0.0 -p 8000 backend.asgi:application
```

**Option B: PM2 (Recommended - Auto Restart)**
```bash
# PM2 install
npm install -g pm2

# Backend start with PM2
cd backend
pm2 start "daphne -b 0.0.0.0 -p 8000 backend.asgi:application" --name backend-api

# PM2 commands
pm2 list              # Status check
pm2 logs backend-api  # Logs dekhne ke liye
pm2 restart backend-api  # Restart
pm2 stop backend-api    # Stop
pm2 delete backend-api  # Remove

# Auto-start on server reboot
pm2 startup
pm2 save
```

**Option C: Supervisor (Alternative)**
```bash
# Supervisor install
sudo apt-get install supervisor

# Config file create
sudo nano /etc/supervisor/conf.d/backend.conf
```

Supervisor config (`/etc/supervisor/conf.d/backend.conf`):
```ini
[program:backend]
command=/path/to/venv/bin/daphne -b 0.0.0.0 -p 8000 backend.asgi:application
directory=/path/to/backend
user=www-data
autostart=true
autorestart=true
stderr_logfile=/var/log/backend/error.log
stdout_logfile=/var/log/backend/access.log
```

```bash
# Supervisor reload
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start backend
```

**Option D: systemd Service (Linux)**
```bash
# Service file create
sudo nano /etc/systemd/system/backend.service
```

systemd service file:
```ini
[Unit]
Description=Django Backend with Daphne
After=network.target redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/backend
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/daphne -b 0.0.0.0 -p 8000 backend.asgi:application
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# Service enable aur start
sudo systemctl daemon-reload
sudo systemctl enable backend
sudo systemctl start backend
sudo systemctl status backend
```

### 5. Nginx Configuration (WebSocket Support)

Agar Nginx use kar rahe ho, to yeh configuration add karein:

```nginx
# /etc/nginx/sites-available/backend
upstream django {
    server 127.0.0.1:8000;
}

server {
    listen 80;
    server_name sms.idaraalkhair.sbs;

    # SSL redirect (agar SSL use kar rahe ho)
    # return 301 https://$server_name$request_uri;

    # HTTP requests
    location / {
        proxy_pass http://django;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support - IMPORTANT!
    location /ws/ {
        proxy_pass http://django;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;  # 24 hours for long-lived connections
    }

    # Static files (agar serve kar rahe ho)
    location /static/ {
        alias /path/to/backend/staticfiles/;
    }

    location /media/ {
        alias /path/to/backend/media/;
    }
}
```

```bash
# Nginx config test
sudo nginx -t

# Nginx reload
sudo systemctl reload nginx
```

### 6. SSL/HTTPS Setup (Recommended)

```bash
# Certbot install
sudo apt-get install certbot python3-certbot-nginx

# SSL certificate generate
sudo certbot --nginx -d sms.idaraalkhair.sbs

# Auto-renewal
sudo certbot renew --dry-run
```

---

## Testing Production WebSocket

1. **Backend check:**
   ```bash
   curl http://localhost:8000/api/health/  # Agar health endpoint ho
   ```

2. **Redis check:**
   ```bash
   redis-cli ping
   ```

3. **Daphne check:**
   ```bash
   ps aux | grep daphne
   ```

4. **Frontend se connect:**
   - Browser console open karein
   - "✅ WebSocket connected successfully" dikhna chahiye
   - Agar nahi dikha, to error check karein

---

## Troubleshooting

### WebSocket Connection Failed

1. **Redis running hai?**
   ```bash
   sudo systemctl status redis
   redis-cli ping
   ```

2. **Daphne running hai?**
   ```bash
   ps aux | grep daphne
   pm2 list  # Agar PM2 use kar rahe ho
   ```

3. **Port 8000 open hai?**
   ```bash
   netstat -tulpn | grep 8000
   ```

4. **Nginx config correct hai?**
   ```bash
   sudo nginx -t
   sudo tail -f /var/log/nginx/error.log
   ```

5. **Backend logs check:**
   ```bash
   pm2 logs backend-api  # PM2
   sudo tail -f /var/log/backend/error.log  # Supervisor
   sudo journalctl -u backend -f  # systemd
   ```

### Common Errors

- **"Connection refused"** → Backend running nahi hai
- **"404 Not Found"** → Nginx WebSocket config missing
- **"Authentication failed"** → JWT token issue
- **"Redis connection failed"** → Redis running nahi hai

---

## Fallback System

Agar WebSocket fail ho, to automatically HTTP polling start ho jayegi (har 15 seconds). System kaam karega, lekin real-time nahi hoga.

---

## Production Checklist

- [ ] Redis installed aur running
- [ ] Daphne installed
- [ ] Environment variables set (.env file)
- [ ] ALLOWED_HOSTS configured
- [ ] Backend daphne se running (PM2/Supervisor/systemd)
- [ ] Nginx configured (agar use kar rahe ho)
- [ ] SSL certificate (agar HTTPS use kar rahe ho)
- [ ] Firewall ports open (8000, 6379)
- [ ] Logs monitoring setup
- [ ] Auto-restart configured

---

## Important Notes

- ✅ Production mein WebSocket **100% kaam karega** agar proper setup ho
- ✅ Daphne production-ready ASGI server hai
- ✅ Redis channel layer ke liye zaroori hai
- ✅ Process manager (PM2/Supervisor) use karein taake auto-restart ho
- ✅ Nginx WebSocket proxy configuration zaroori hai
- ✅ SSL/HTTPS recommended hai production ke liye

