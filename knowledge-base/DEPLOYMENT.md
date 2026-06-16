# Deployment Guide

## Infrastructure Overview

```
┌──────────────────────────────────────────────────────────┐
│                  Hostinger VPS (Ubuntu)                    │
│                  Host: srv1566548                          │
│                                                            │
│  ┌──────────┐     ┌────────────────────────────────────┐  │
│  │  Nginx   │────→│  App 1: ProCRM (port 3000)         │  │
│  │  :80/:443│     │  PM2 name: "procrm"                │  │
│  │          │     │  Path: /opt/procrm/                 │  │
│  │          │     └────────────────────────────────────┘  │
│  │          │                                              │
│  │          │     ┌────────────────────────────────────┐  │
│  │          │────→│  App 2: WhatsApp Broadcast (3001)  │  │
│  │          │     │  PM2 name: "whatsapp-broadcast"    │  │
│  │          │     │  Path: /opt/whatsapp-broadcast/    │  │
│  └──────────┘     └────────────────────────────────────┘  │
│                                                            │
│  ┌──────────┐                                              │
│  │ MySQL 8  │  DB: whatsapp_broadcast                      │
│  │ :3306    │  User: wauser                                │
│  └──────────┘                                              │
└──────────────────────────────────────────────────────────┘
```

## Domain: broadcast.innodify.in

### DNS Setup (Hostinger DNS Zone)
Add an **A record** in your Hostinger DNS zone for `innodify.in`:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | broadcast | [VPS IP ADDRESS] | 3600 |

To find VPS IP: run `curl ifconfig.me` on the VPS.

## Step-by-Step Deployment Commands

Run these on the VPS in order. Each step is numbered.

### Step 1: Create MySQL Database

```bash
mysql -u root -p
```

Then in MySQL prompt:
```sql
CREATE DATABASE whatsapp_broadcast CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'wauser'@'localhost' IDENTIFIED BY '<strong-random-db-password>';
GRANT ALL PRIVILEGES ON whatsapp_broadcast.* TO 'wauser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Step 2: Clone the Repository

```bash
mkdir -p /opt/whatsapp-broadcast
cd /opt/whatsapp-broadcast
git clone https://github.com/shivanshu407/whatsapp-broadcast-saas.git .
```

Note: If the repo has a nested folder structure, adjust:
```bash
# If cloned as /opt/whatsapp-broadcast/whatsapp-broadcast-saas/
# Move contents up:
mv whatsapp-broadcast-saas/* .
mv whatsapp-broadcast-saas/.* . 2>/dev/null
rmdir whatsapp-broadcast-saas
```

### Step 3: Install Backend Dependencies

```bash
cd /opt/whatsapp-broadcast/backend
npm install --production
```

### Step 4: Build Frontend

```bash
cd /opt/whatsapp-broadcast/frontend
npm install
npm run build
```

The built files go to `frontend/dist/`.

### Step 5: Create Environment File

```bash
cat > /opt/whatsapp-broadcast/backend/.env << 'EOF'
PORT=3001
NODE_ENV=production

DB_HOST=localhost
DB_USER=wauser
DB_PASSWORD=<strong-random-db-password>
DB_NAME=whatsapp_broadcast

JWT_SECRET=<strong-random-jwt-secret>
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<strong-random-whatsapp-webhook-token>

SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=broadcast@innodify.in
SMTP_PASSWORD=CHANGE_THIS
SMTP_FROM_NAME=WhatsApp Broadcast
SMTP_FROM_EMAIL=broadcast@innodify.in
EOF
```

### Step 6: Configure Nginx

Create the Nginx server block:

```bash
cat > /etc/nginx/sites-available/whatsapp-broadcast << 'EOF'
server {
    listen 80;
    server_name broadcast.innodify.in;

    # Frontend (serve built files)
    root /opt/whatsapp-broadcast/frontend/dist;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }

    # Webhook proxy (no auth)
    location /webhook/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA fallback — all other routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
```

Enable the site:
```bash
ln -sf /etc/nginx/sites-available/whatsapp-broadcast /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### Step 7: SSL with Let's Encrypt

```bash
certbot --nginx -d broadcast.innodify.in
```

If certbot is not installed:
```bash
apt update && apt install -y certbot python3-certbot-nginx
certbot --nginx -d broadcast.innodify.in
```

### Step 8: Start with PM2

```bash
cd /opt/whatsapp-broadcast/backend
pm2 start src/server.js --name "whatsapp-broadcast" --env production
pm2 save
```

Verify both apps running:
```bash
pm2 list
```

You should see:
```
│ 0 │ procrm              │ online │ :3000 │
│ 1 │ whatsapp-broadcast  │ online │ :3001 │
```

### Step 9: Configure Meta Webhook

In Meta Developer Console:
1. Go to your WhatsApp app → Configuration → Webhook
2. Set callback URL: `https://broadcast.innodify.in/webhook/whatsapp`
3. Set verify token to the same value as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
4. Subscribe to: `messages`, `message_deliveries`, `message_reads`

## Updating the App

When you push new code to GitHub:

```bash
cd /opt/whatsapp-broadcast
git pull origin main

# If backend changed:
cd backend && npm install --production
pm2 restart whatsapp-broadcast

# If frontend changed:
cd frontend && npm install && npm run build
# No restart needed — Nginx serves static files
```

## Troubleshooting

```bash
# Check app logs
pm2 logs whatsapp-broadcast --lines 50

# Check if port is in use
ss -tlnp | grep 3001

# Check nginx config
nginx -t

# Restart nginx
systemctl restart nginx

# Check MySQL connection
mysql -u wauser -p'<strong-random-db-password>' whatsapp_broadcast -e "SHOW TABLES;"

# Check disk space
df -h

# Check memory
free -h
```

## Important Notes

1. **The backend auto-creates tables** on first startup (database.js runs migrations)
2. **Frontend API base URL**: The store.js uses relative URLs (`/api/v1/...`) — Nginx proxies them to port 3001
3. **File uploads**: Multer stores CSV imports in `backend/uploads/` — ensure write permissions
4. **PM2 startup**: Run `pm2 startup` to auto-start apps on VPS reboot
