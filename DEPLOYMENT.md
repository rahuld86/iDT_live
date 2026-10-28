# End-to-End Deployment Guide (Fresh EC2 Instance)

This guide walks through deploying the Decision Tree application on a brand-new EC2
instance, from launching the instance to a working app in the browser. It covers
**Redis**, the **Flask backend**, the **React frontend**, **nginx**, and the
**systemd** service, including all the configuration the session-state-isolation
feature requires (Redis-backed sessions, DataFrame store on disk, raised upload
limit, and multiple Gunicorn workers).

> For deep troubleshooting (nginx permissions, port conflicts, npm/build errors),
> see `backend/DEPLOYMENT.md`. This document is the primary, sequential runbook.

## Architecture on a single instance

Everything runs on one EC2 instance (Phase 1):

- **nginx** serves the built frontend and reverse-proxies `/api` to Gunicorn.
- **Gunicorn** runs the Flask backend with multiple workers.
- **Redis** (same instance) holds per-user session metadata (small data + the tree
  as JSON + pointers to heavy DataFrames).
- **Local disk** (`df_store/`) holds the heavy pandas DataFrames as parquet files.

Because session state is externalized to Redis + disk, multiple Gunicorn workers
are safe and users are isolated from each other.

```
Browser ──HTTP──> nginx ──/api──> Gunicorn (N workers) ──> Redis (session metadata)
                    │                                   └──> df_store/ (parquet frames)
                    └── serves frontend dist/
```

---

## Step 0 — Launch and connect to the EC2 instance

1. In the AWS Console, launch an instance:
   - **AMI:** Ubuntu Server 22.04 LTS (x86_64).
   - **Instance type:** `r5.xlarge` (4 vCPU, 32 GB RAM) is a good fit for ~10
     concurrent users with ~500 MB datasets. Smaller (`t3.large`) works for light use.
   - **Storage:** at least 50 GB gp3 EBS (heavy DataFrames are written to disk).
   - **Key pair:** select or create one for SSH.

2. **Security Group — inbound rules:**
   | Type  | Port | Source                | Purpose            |
   |-------|------|-----------------------|--------------------|
   | SSH   | 22   | Your IP only          | Admin access       |
   | HTTP  | 80   | 0.0.0.0/0             | App traffic        |
   | HTTPS | 443  | 0.0.0.0/0             | App traffic (TLS)  |

   Do **not** open port 6379 (Redis) or 5000 (Gunicorn) to the internet — both
   stay bound to localhost.

3. Connect:
   ```bash
   ssh -i /path/to/key.pem ubuntu@<EC2_PUBLIC_IP>
   ```

---

## Step 1 — Install system packages

```bash
# Update the base system
sudo apt update && sudo apt upgrade -y

# Python, build tools, git, nginx
sudo apt install -y python3-pip python3-venv python3-dev build-essential git nginx

# Redis server
sudo apt install -y redis-server

# Node.js 18 LTS (for building the frontend)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify versions
python3 --version        # 3.10+ expected on Ubuntu 22.04
node --version           # v18.x
redis-server --version
nginx -v
```

---

## Step 2 — Configure and start Redis

Redis runs on the same instance and only listens on localhost.

```bash
# Ensure Redis binds to localhost only (default on Ubuntu, but confirm)
sudo grep -E "^bind" /etc/redis/redis.conf
# Expected: bind 127.0.0.1 ::1

# (Optional, recommended) set a password: uncomment/set 'requirepass' in the config
# sudo nano /etc/redis/redis.conf   ->  requirepass <a-strong-password>

# Enable Redis to start on boot and start it now
sudo systemctl enable redis-server
sudo systemctl restart redis-server

# Verify it responds
redis-cli ping           # -> PONG
# If you set a password:
# redis-cli -a '<password>' ping
```

Redis persistence (RDB snapshots) is enabled by default on Ubuntu, which is fine —
sessions are short-lived and also expire via TTL. No further tuning is required for
Phase 1.

---

## Step 3 — Get the application code onto the instance

```bash
# Clone your repository (or copy files up with scp)
cd ~
git clone <YOUR_REPO_URL> project_iDT_2
# Resulting layout: /home/ubuntu/project_iDT_2/{backend,frontend,...}

cd ~/project_iDT_2
```

If you copy with `scp` instead of git:
```bash
# from your local machine
scp -i /path/to/key.pem -r ./project_iDT_2 ubuntu@<EC2_PUBLIC_IP>:/home/ubuntu/
```

Make the helper scripts executable:
```bash
cd ~/project_iDT_2/backend
chmod +x deploy.sh start.sh stop.sh setup_nginx.sh
```

---

## Step 4 — Deploy the backend

The `deploy.sh` script creates a virtualenv, installs `requirements.txt` (which now
includes `redis`, `pyarrow`, and `APScheduler`), creates the `uploads/` directory,
and seeds a `.env` from `env.example`.

```bash
cd ~/project_iDT_2/backend
./deploy.sh
```

### 4a. Create the DataFrame store directory

Heavy DataFrames are persisted here as parquet files. It must exist and be writable
by the service user (`ubuntu`):

```bash
mkdir -p ~/project_iDT_2/backend/df_store
```

### 4b. Configure environment variables

Edit the `.env` the deploy script created:

```bash
nano ~/project_iDT_2/backend/.env
```

Set the following (the session-isolation feature adds the Redis / session / store
variables). A complete reference lives in `backend/env.example`:

```env
# --- Flask ---
FLASK_ENV=production
FLASK_DEBUG=False
FLASK_PORT=5000

# --- CORS: set to how users reach the app (your EC2 IP or domain) ---
CORS_ORIGINS=http://<EC2_PUBLIC_IP>

# --- Auth (generate a real hash; see note below) ---
JWT_SECRET_KEY=<generate-a-long-random-secret>
JWT_ACCESS_TOKEN_EXPIRES=86400
AUTH_USERS=idfcuser:<bcrypt-hash-here>

# --- Redis (session metadata store; same instance in Phase 1) ---
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
# REDIS_PASSWORD=<password>        # only if you set 'requirepass' in redis.conf

# --- Session lifecycle ---
SESSION_TTL_SECONDS=86400          # abandoned sessions expire after 24h
SESSION_CLEANUP_INTERVAL=3600      # background cleanup sweep cadence (seconds)

# --- DataFrame store ---
DF_STORE_BACKEND=disk
DF_STORE_DIR=/home/ubuntu/project_iDT_2/backend/df_store
DF_CACHE_MAX_BYTES=2147483648      # 2GB per-worker cache budget (tune to RAM)

# --- Upload limit (~600MB) ---
MAX_UPLOAD_SIZE=629145600

# --- Gunicorn: multiple workers now safe (state is externalized) ---
PORT=5000
WEB_CONCURRENCY=4
LOG_LEVEL=info

# --- AWS S3 (optional, only for S3 import/export of trees) ---
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
# AWS_REGION=ap-south-1
```

Generate the values that must be secret:
```bash
# JWT secret
python3 -c "import secrets; print(secrets.token_urlsafe(48))"

# A bcrypt password hash for a login user (run inside the venv so werkzeug is present)
cd ~/project_iDT_2/backend && source venv/bin/activate
python3 -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('YOUR_PASSWORD'))"
```
Put the hash into `AUTH_USERS` as `username:hash`.

> Notes
> - `DF_CACHE_MAX_BYTES` is **per worker**. With `WEB_CONCURRENCY=4` the cache can
>   use up to ~8 GB total — keep it comfortably under instance RAM.
> - `WEB_CONCURRENCY` rule of thumb: `(2 × vCPU) + 1`, capped by RAM.
> - If `REDIS_PASSWORD` is unset, leave it commented out.

### 4c. Smoke-test the backend manually

```bash
cd ~/project_iDT_2/backend
source venv/bin/activate
./start.sh
# In another shell:
curl http://localhost:5000/api/health      # -> {"status":"healthy",...}
# Stop the manual run before setting up systemd:
./stop.sh
```

---

## Step 5 — Run the backend under systemd

Install the service (an up-to-date template lives at
`backend/systemd.service.example`):

```bash
sudo cp ~/project_iDT_2/backend/systemd.service.example /etc/systemd/system/decision-tree-api.service
# Review it; the defaults assume WorkingDirectory /home/ubuntu/project_iDT_2/backend
sudo nano /etc/systemd/system/decision-tree-api.service
```

The service reads `.env` (so Redis/store/worker settings apply) and starts Gunicorn
via `wsgi:app`. Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable decision-tree-api
sudo systemctl start decision-tree-api
sudo systemctl status decision-tree-api        # should be active (running)
```

The background session-cleanup job starts automatically with the app (it sweeps
orphaned parquet files every `SESSION_CLEANUP_INTERVAL` seconds).

---

## Step 6 — Build the frontend

```bash
cd ~/project_iDT_2/frontend/tree-forge-ui

npm install
# If npm errors with ENOTEMPTY, use the clean installer:
# chmod +x clean_install.sh && ./clean_install.sh

# Build; the API is served under /api on the same origin via nginx
VITE_API_BASE_URL=/api npm run build

# Verify the build output exists
ls -la dist/index.html
```

The compiled static site is in
`~/project_iDT_2/frontend/tree-forge-ui/dist`, which nginx will serve.

---

## Step 7 — Configure nginx

nginx serves the frontend and proxies `/api` to Gunicorn. The repo ships an example
at `backend/nginx.conf.example` (already set to `client_max_body_size 600M`).

```bash
sudo nano /etc/nginx/sites-available/decision-tree
```

```nginx
server {
    listen 80 default_server;
    server_name _;   # accept any host/IP; replace with your domain if you have one

    # Frontend static files
    location / {
        root /home/ubuntu/project_iDT_2/frontend/tree-forge-ui/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API -> Gunicorn
    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Large uploads can take a while
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Must match MAX_UPLOAD_SIZE (~600MB) so large CSVs reach the backend
    client_max_body_size 600M;
}
```

Enable the site and reload:

```bash
# Remove the default site so our server block is the default
sudo rm -f /etc/nginx/sites-enabled/default

# Link our site (remove a stale link first if it exists)
sudo rm -f /etc/nginx/sites-enabled/decision-tree
sudo ln -s /etc/nginx/sites-available/decision-tree /etc/nginx/sites-enabled/

sudo nginx -t                 # test config
sudo systemctl enable nginx
sudo systemctl restart nginx
```

### Fix the home-directory permission gotcha

On Ubuntu `/home/ubuntu` is `700`, so the nginx user cannot traverse into it to read
`dist/`. This causes a 500 / "Permission denied" error. Fix:

```bash
sudo chmod 755 /home/ubuntu
# verify nginx can traverse
sudo -u www-data test -x /home/ubuntu && echo OK || echo STILL_BLOCKED
sudo systemctl reload nginx
```

If you prefer not to loosen the home directory, copy the build to `/var/www`:
```bash
sudo mkdir -p /var/www/decision-tree
sudo cp -r ~/project_iDT_2/frontend/tree-forge-ui/dist/* /var/www/decision-tree/
sudo chown -R www-data:www-data /var/www/decision-tree
# then set 'root /var/www/decision-tree;' in the nginx config and reload
```

---

## Step 8 — Verify end to end

```bash
# 1. Redis is up
redis-cli ping                                  # PONG

# 2. Backend is up (direct)
curl http://localhost:5000/api/health           # {"status":"healthy",...}

# 3. Backend via nginx
curl http://localhost/api/health                # same JSON through the proxy

# 4. Frontend is served
curl -I http://localhost/                        # 200 OK, text/html
```

Then open `http://<EC2_PUBLIC_IP>/` in a browser, log in with the user you configured
in `AUTH_USERS`, and run an upload → set target → build tree flow.

Confirm session isolation is actually working:
```bash
# After a logged-in user uploads a file, a session key appears in Redis:
redis-cli keys 'session:*'
# And a parquet file appears under the DataFrame store:
ls -R ~/project_iDT_2/backend/df_store
# After that user logs out, both are purged.
```

---

## Step 9 (recommended) — Enable HTTPS

If you have a domain pointing at the instance:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
# Then update CORS_ORIGINS in .env to https://your-domain.com and restart:
sudo systemctl restart decision-tree-api
```

Certbot updates the nginx config and sets up auto-renewal.

---

## Updating / redeploying

```bash
cd ~/project_iDT_2
git pull

# Backend: reinstall deps if requirements changed, then restart
cd backend
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart decision-tree-api

# Frontend: rebuild
cd ../frontend/tree-forge-ui
VITE_API_BASE_URL=/api npm run build
sudo systemctl reload nginx
```

Restarting the backend clears the per-worker in-memory DataFrame caches, but **not**
user state — sessions live in Redis and frames live in `df_store/`, so active users
keep their work across a restart (subject to `SESSION_TTL_SECONDS`).

---

## Operations cheat sheet

```bash
# Backend logs
sudo journalctl -u decision-tree-api -f

# Restart / stop backend
sudo systemctl restart decision-tree-api
sudo systemctl stop decision-tree-api

# nginx logs and reload
sudo tail -f /var/log/nginx/error.log
sudo systemctl reload nginx

# Redis
redis-cli ping
redis-cli keys 'session:*'          # live sessions
redis-cli info memory

# DataFrame store usage
du -sh ~/project_iDT_2/backend/df_store
```

### What to monitor

- **Disk** on the EBS volume — heavy parquet frames accumulate; the cleanup sweep
  removes orphans, but confirm free space.
- **Redis memory** — session metadata is small, but watch it under load.
- **Worker memory** — `WEB_CONCURRENCY × DF_CACHE_MAX_BYTES` is the cache ceiling;
  keep it under instance RAM.

---

## Phase 2 (future, not required now) — horizontal scale

The code is designed so scaling out is configuration, not a rewrite:

- Move Redis to **ElastiCache**: point `REDIS_HOST` at the ElastiCache endpoint.
- Move DataFrames to **S3**: set `DF_STORE_BACKEND=s3` with `DF_S3_BUCKET` /
  `DF_S3_PREFIX` (the S3 store backend is a Phase-2 item and must be implemented
  before enabling).
- Run multiple instances behind an Application Load Balancer; optionally enable
  sticky sessions so a user benefits from a warm per-instance DataFrame cache.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| API returns **503 "Session store unavailable"** | Redis not running / wrong `REDIS_HOST`/`REDIS_PASSWORD` | `sudo systemctl status redis-server`; `redis-cli ping`; check `.env` |
| API returns **400 "Session data expired, please re-upload"** | The referenced parquet file is gone (TTL expiry/cleanup) | Expected after logout/timeout — re-upload |
| API returns **413** on upload | Body exceeds the cap | Confirm `MAX_UPLOAD_SIZE` in `.env` and `client_max_body_size 600M` in nginx |
| Frontend loads but API calls fail (CORS) | `CORS_ORIGINS` doesn't match the URL users hit | Set `CORS_ORIGINS` to your IP/domain; restart backend |
| nginx **500 / Permission denied** serving the site | `/home/ubuntu` is `700` | `sudo chmod 755 /home/ubuntu` (Step 7) |
| Can't reach the site from a browser | Security Group missing port 80 | Allow inbound HTTP (80) from 0.0.0.0/0 |
| Backend won't start | bad `.env`, port in use, missing deps | `sudo journalctl -u decision-tree-api -n 50`; see `backend/DEPLOYMENT.md` |

For detailed, script-assisted troubleshooting (port conflicts, npm/build errors,
nginx permission deep-dives), see **`backend/DEPLOYMENT.md`**.
