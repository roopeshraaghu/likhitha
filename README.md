# vResolve 🌿

A social-wellness hybrid web app with a public Feed, anonymous Community Vault with AI-first responder (Gemini), and a Body/Mind Wellness tracker.

## Stack

- **Frontend** — Vanilla HTML/CSS/JS (served by Nginx)
- **Backend** — Node.js + Express + JWT Auth
- **Database** — PostgreSQL
- **AI** — Google Gemini 1.5 Flash
- **Infrastructure** — 2x AWS EC2 (t3.micro)

## Repo Structure

```
vresolve/
├── backend/
│   ├── server.js          # Express API
│   ├── package.json
│   └── .env.example       # Copy to .env and fill values
├── frontend/
│   └── index.html         # Full web app
├── database/
│   └── schema.sql         # PostgreSQL schema + seed data
├── scripts/
│   ├── setup-app.sh       # EC2 1 provisioning script
│   ├── setup-db.sh        # EC2 2 provisioning script
│   └── setup-ssl.sh       # Let's Encrypt SSL script
├── .github/
│   └── workflows/
│       └── deploy.yml     # CI/CD — auto deploy on push to main
└── README.md
```

## Quick Start (Local Dev)

### 1. Database
```bash
# Install PostgreSQL locally, then:
psql -U postgres -f database/schema.sql
```

### 2. Backend
```bash
cd backend
cp .env.example .env      # fill in your values
npm install
npm run dev               # runs on http://localhost:5000
```

### 3. Frontend
```bash
# Just open frontend/index.html in a browser
# Or serve with any static server:
npx serve frontend/
```

## Deployment on AWS EC2

### EC2 2 — Database Server
```bash
scp scripts/setup-db.sh ubuntu@<EC2-2-IP>:~/
scp database/schema.sql  ubuntu@<EC2-2-IP>:~/
ssh ubuntu@<EC2-2-IP>
sudo bash setup-db.sh
sudo -u postgres psql -d vresolve -f ~/schema.sql
```

### EC2 1 — App Server
```bash
scp scripts/setup-app.sh ubuntu@<EC2-1-IP>:~/
ssh ubuntu@<EC2-1-IP>
sudo bash setup-app.sh
```

Then push to GitHub and let CI/CD deploy automatically (see `.github/workflows/deploy.yml`).

### SSL (after domain is pointed to EC2 1)
```bash
scp scripts/setup-ssl.sh ubuntu@<EC2-1-IP>:~/
ssh ubuntu@<EC2-1-IP>
# Edit DOMAIN and EMAIL inside the script first
sudo bash setup-ssl.sh
```

## Environment Variables

See `backend/.env.example` for all required variables.

| Variable | Description |
|---|---|
| `DB_HOST` | EC2 2 private IP |
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET` | Random 64-char string |
| `GEMINI_API_KEY` | Google Gemini API key |
| `CORS_ORIGIN` | Your domain (https://yourdomain.com) |

## CI/CD

On every push to `main`, GitHub Actions will:
1. SSH into EC2 1
2. Pull latest code
3. Install dependencies
4. Restart the API via PM2

Set these secrets in your GitHub repo Settings → Secrets:

| Secret | Value |
|---|---|
| `EC2_HOST` | EC2 1 public IP |
| `EC2_USER` | ubuntu |
| `EC2_SSH_KEY` | Your EC2 private key (.pem contents) |
| `DB_HOST` | EC2 2 private IP |
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET` | Your JWT secret |
| `GEMINI_API_KEY` | Your Gemini API key |
| `CORS_ORIGIN` | https://yourdomain.com |

## License
MIT
