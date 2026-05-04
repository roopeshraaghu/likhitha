#!/bin/bash
# ============================================================
# EC2 2 — Database Server Setup (PostgreSQL)
# Run as: chmod +x setup-db.sh && sudo ./setup-db.sh
# Ubuntu 22.04 LTS
# ============================================================

set -e
echo "🗄️  Setting up vResolve Database Server..."

# ── Variables (change these!) ────────────────────────────────
DB_PASSWORD="Vresolve@123456"
EC2_APP_PRIVATE_IP="10.0.0.62"   # <-- Set EC2 1 private IP here

# ── Update system ────────────────────────────────────────────
apt-get update -y && apt-get upgrade -y

# ── Install PostgreSQL 15 ────────────────────────────────────
apt-get install -y postgresql postgresql-contrib

# ── Start and enable PostgreSQL ──────────────────────────────
systemctl start postgresql
systemctl enable postgresql

# ── Set postgres user password ───────────────────────────────
sudo -u postgres psql -c "ALTER USER postgres PASSWORD '$DB_PASSWORD';"

# ── Create database and run schema ───────────────────────────
sudo -u postgres psql << SQL
CREATE DATABASE vresolve;
\c vresolve
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
SQL

echo "✅ Database created"

# ── Configure PostgreSQL to accept connections from EC2 1 ────
PG_VERSION=$(psql --version | awk '{print $3}' | cut -d. -f1)
PG_CONF="/etc/postgresql/$PG_VERSION/main/postgresql.conf"
PG_HBA="/etc/postgresql/$PG_VERSION/main/pg_hba.conf"

# Listen on all interfaces
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" $PG_CONF

# Allow EC2 1 to connect
echo "# Allow EC2 App Server" >> $PG_HBA
echo "host    vresolve    postgres    $EC2_APP_PRIVATE_IP/32    md5" >> $PG_HBA

systemctl restart postgresql
echo "✅ PostgreSQL configured to accept connections from $EC2_APP_PRIVATE_IP"

# ── UFW Firewall — only allow EC2 1 on port 5432 ─────────────
apt-get install -y ufw
ufw allow ssh
ufw allow from $EC2_APP_PRIVATE_IP to any port 5432
ufw --force enable
echo "✅ Firewall configured"

echo ""
echo "✅ EC2 2 DB setup complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Copy schema:  scp schema.sql ubuntu@<EC2-2-IP>:~/"
echo "  2. SSH into EC2 2 and run:"
echo "       sudo -u postgres psql -d vresolve -f ~/schema.sql"
echo ""
echo "  3. Update EC2 1 .env with:"
echo "       DB_HOST=$(hostname -I | awk '{print $1}')"
echo "       DB_PASSWORD=$DB_PASSWORD"
echo ""
echo "  ⚠️  AWS Security Group for EC2 2:"
echo "     - Allow port 5432 ONLY from EC2 1 private IP"
echo "     - Allow port 22 from your IP only"