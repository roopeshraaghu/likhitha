#!/bin/bash
# ============================================================
# EC2 1 — App Server Setup (Node.js API + Nginx + Frontend)
# Run as: chmod +x setup-app.sh && sudo ./setup-app.sh
# Ubuntu 22.04 LTS
# ============================================================

set -e
echo "🚀 Setting up vResolve App Server..."

# ── Update system ────────────────────────────────────────────
apt-get update -y && apt-get upgrade -y

# ── Install Node.js 20 ───────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# ── Install Nginx ────────────────────────────────────────────
apt-get install -y nginx

# ── Install PM2 ──────────────────────────────────────────────
npm install -g pm2

# ── Create app directory ─────────────────────────────────────
mkdir -p /var/www/vresolve
mkdir -p /var/www/vresolve/public   # frontend goes here

# ── Nginx config ─────────────────────────────────────────────
cat > /etc/nginx/sites-available/vresolve << 'EOF'
server {
    listen 80;
    server_name _;

    # Serve frontend
    root /var/www/vresolve/public;
    index index.html;

    # Frontend routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to Node.js
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/vresolve /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
systemctl enable nginx

echo ""
echo "✅ EC2 1 setup complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Copy your app files:  scp -r ./vresolve-api/* ubuntu@<EC2-1-IP>:/var/www/vresolve/"
echo "  2. Copy frontend:        scp ./index.html ubuntu@<EC2-1-IP>:/var/www/vresolve/public/"
echo "  3. SSH in and run:"
echo "       cd /var/www/vresolve"
echo "       npm install"
echo "       cp .env.example .env   # then edit with your values"
echo "       pm2 start server.js --name vresolve-api"
echo "       pm2 save && pm2 startup"
echo ""
echo "  Your app will be at: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"