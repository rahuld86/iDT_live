# EC2 Deployment Checklist

Use this checklist when deploying to EC2 to avoid common issues.

## Pre-Deployment

- [ ] EC2 instance running (Ubuntu 20.04+ or Amazon Linux 2)
- [ ] Security group allows HTTP (port 80) from 0.0.0.0/0
- [ ] Security group allows HTTPS (port 443) if using SSL
- [ ] Python 3.8+ installed
- [ ] Node.js 18+ installed
- [ ] nginx installed (`sudo apt install nginx`)

## Backend Deployment

- [ ] Project files copied to `/home/ubuntu/project_iDT_2/backend`
- [ ] Virtual environment created (`python3 -m venv venv`)
- [ ] Dependencies installed (`pip install -r requirements.txt`)
- [ ] `.env` file created from `env.example`
- [ ] `.env` file configured with correct values
- [ ] Backend starts successfully (`./start.sh`)
- [ ] Health check works (`curl http://localhost:5000/api/health`)
- [ ] Systemd service configured (optional but recommended)

## Frontend Deployment

- [ ] Project files copied to `/home/ubuntu/project_iDT_2/frontend/tree-forge-ui`
- [ ] Dependencies installed (`npm install`)
- [ ] Frontend built (`VITE_API_BASE_URL=/api npm run build`)
- [ ] `dist/` directory exists and contains `index.html`

## Nginx Configuration

- [ ] Nginx config created (`sudo cp nginx.conf.example /etc/nginx/sites-available/decision-tree`)
- [ ] **CRITICAL: `/home/ubuntu` permissions fixed (`sudo chmod 755 /home/ubuntu`)**
- [ ] Root path in nginx config matches installation path
- [ ] `server_name` set correctly (use `_` for EC2 without domain)
- [ ] `default_server` added to `listen` directive (to avoid conflicts)
- [ ] Default nginx site disabled (`sudo rm /etc/nginx/sites-enabled/default`)
- [ ] Decision-tree site enabled (`sudo ln -s /etc/nginx/sites-available/decision-tree /etc/nginx/sites-enabled/`)
- [ ] Nginx config test passes (`sudo nginx -t`)
- [ ] Nginx reloaded (`sudo systemctl reload nginx`)

## Permissions (Critical!)

- [ ] `/home/ubuntu` is 755 (not 700!)
- [ ] `/home` is 755 (if needed)
- [ ] All parent directories have execute permission
- [ ] `dist/` directory is 755
- [ ] Nginx user can traverse path (`sudo -u www-data test -x /home/ubuntu`)
- [ ] Nginx user can read files (`sudo -u www-data test -r /path/to/dist/index.html`)

## Verification

- [ ] Backend accessible: `curl http://localhost:5000/api/health`
- [ ] Frontend accessible: `curl http://localhost`
- [ ] No 500 errors in nginx logs: `sudo tail -20 /var/log/nginx/error.log`
- [ ] Public IP accessible from browser
- [ ] API calls work from frontend

## Common Issues Fixed

- ✅ Port 5000 in use → Run `./stop.sh`
- ✅ Nginx symbolic link exists → Remove and recreate
- ✅ npm install errors → Run `./clean_install.sh`
- ✅ Terser not found → Use esbuild (already configured)
- ✅ Permission denied → Fix `/home/ubuntu` to 755
- ✅ Conflicting server_name → Use `default_server` with `server_name _`

## Quick Verification Scripts

```bash
# Backend verification
cd ~/project_iDT_2/backend
./verify_deployment.sh

# Frontend verification
./check_frontend.sh

# Fix permissions comprehensively
sudo ./fix_permissions.sh
```

