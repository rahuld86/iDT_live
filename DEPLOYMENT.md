# EC2 deployment guide

This is the canonical runbook for this repository. The deployment scripts support
Ubuntu on EC2, including Ubuntu 26.04 with system Python 3.14. Use Python **3.12**
for the application; the pinned dependencies also support 3.10-3.12. Do not
replace Ubuntu's system Python or loosen dependency pins to fix an installation.

## 1. Instance and system packages

Use an x86_64 Ubuntu LTS instance with enough RAM for your datasets, workers, and
DataFrame caches, plus space for uploaded CSVs and Parquet files. Size from actual
workloads; a per-worker cache budget is not the application's total RAM usage.

Allow SSH (22) from your administrator IP, and HTTP/HTTPS (80/443) as appropriate.
Keep 5000 and 6379 closed externally. Gunicorn and Redis listen on localhost.

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx redis-server
sudo systemctl enable --now redis-server
redis-cli ping
# Expected: PONG
```

Check Redis's bind/protected-mode settings in /etc/redis/redis.conf before use.
If Redis requires a password, set the same single-quoted REDIS_PASSWORD in .env.

Install Python 3.12 alongside the system Python with uv, as the normal ubuntu
user. The installer and managed Python distributions come from Astral.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
"$HOME/.local/bin/uv" python install 3.12
```

Reference: [uv Python installation](https://docs.astral.sh/uv/guides/install-python/).

For frontend builds, install a supported Node.js LTS release (for example Node 22)
using the official Node.js installation instructions. Then verify:

```bash
node --version
npm --version
```

Do not reuse the old Node 18 instructions; Node 18 is end-of-life.
See the [Node.js release schedule](https://github.com/nodejs/Release).

## 2. Copy the repository and deploy the backend

The examples assume /home/ubuntu/project_iDT_2 contains backend/, frontend/, and
specs/. Adjust the paths if your clone includes an extra parent directory.

```bash
cd ~
git clone <YOUR_REPOSITORY_URL> project_iDT_2
cd ~/project_iDT_2/backend
chmod +x deploy.sh start.sh stop.sh setup_user_password.sh
./deploy.sh
```

Run deploy.sh as ubuntu, not root. It works from any current directory. It:

- Reuses a supported existing venv without replacing it.
- Prefers python3.12, accepts a compatible python3, or uses uv to create Python 3.12.
- Accepts an explicit interpreter with PYTHON_BIN=/path/to/python3.12 ./deploy.sh.
- Installs the pinned dependencies, requires wheels for pandas/numpy/pyarrow, and
  runs pip check.
- Creates runtime directories and seeds .env only if absent.
- Preserves existing credentials and never starts, stops, or disables services.

### Recover from a Python 3.14 virtual environment

The pandas metadata error in this session contained Python 3.14 and a compiler
killed while building pandas. NumPy 1.26.4 supports Python 3.9-3.12; it is not a
Python 3.14 dependency set. More RAM or installing pkg-config alone is not the fix.
See [NumPy's release notes](https://numpy.org/doc/1.26/release/1.26.4-notes.html).

Stop the running application before replacing its environment:

```bash
sudo systemctl stop decision-tree-api  # if installed
# For a manual ./start.sh process, press Ctrl+C in that terminal.
cd ~/project_iDT_2/backend
deactivate 2>/dev/null || true
mv venv "venv-backup-$(date +%Y%m%d%H%M%S)"
./deploy.sh
venv/bin/python --version
# Python 3.12.x on the uv path
```

The old directory is a backup, not an environment to run in place after moving.
Do not delete .env, uploads/, df_store/, or Redis state when recreating venv.

## 3. Configure .env and authentication

deploy.sh creates backend/.env from backend/env.example only when it is missing.
Never overwrite an existing server's .env with the template during updates.
The template intentionally contains no working user or JWT secret.

```bash
cd ~/project_iDT_2/backend
nano .env
./setup_user_password.sh idfcuser
```

The helper prompts for a password and confirmation using hidden input, writes a
scrypt hash in single quotes, generates a random JWT secret if missing/invalid,
and preserves other users and settings. It never prints passwords, hashes, or
secrets. A valid existing JWT secret is preserved.

Configure these values:

```env
# Exactly the frontend address users open, including scheme and nonstandard port.
CORS_ORIGINS='http://YOUR_PUBLIC_IP'
# Or: CORS_ORIGINS='https://yourdomain.com'
# Or: CORS_ORIGINS='http://YOUR_PUBLIC_IP,https://yourdomain.com'

JWT_ACCESS_TOKEN_EXPIRES=86400  # 24-hour login tokens
PORT=5000
WEB_CONCURRENCY=4
GUNICORN_TIMEOUT=300
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
SESSION_TTL_SECONDS=86400
SESSION_CLEANUP_INTERVAL=3600
DF_STORE_BACKEND=disk
DF_STORE_DIR='./df_store'
DF_CACHE_MAX_BYTES=2147483648
AWS_REGION=ap-south-1  # use your bucket's actual region
```

The helper supplies JWT_SECRET_KEY and AUTH_USERS; do not paste placeholders.
The stored format is AUTH_USERS='user1:scrypt:...$salt$hash user2:scrypt:...$salt$hash'
on one line. Use the actual password at login, not its stored hash.

.env is trusted Bash-compatible configuration, loaded by start.sh. Single-quote
values containing dollar signs, spaces, or shell metacharacters. Inline comments
are supported. Do not use export $(cat .env ... | xargs), double-quote hashes, or
install untrusted .env files. Keep .env private (chmod 600); it is Git-ignored.
The helper changes .env to mode 600; start the service as the same owning user.

CORS_ORIGINS is the frontend origin, not /api or the backend's internal address.
Do not add a trailing slash or spaces after commas. '*' permits all origins;
restrict it for production. With nginx serving the frontend and /api together,
normal requests are same-origin and do not need CORS permission.

A 2 GiB cache times four workers is up to 8 GiB for caches alone, plus data loading,
training, Python, Redis, and OS overhead. Reduce workers/cache budgets on small
instances. GUNICORN_TIMEOUT must cover the synchronous upload/training workload;
nginx's proxy timeout does not override Gunicorn's timeout.

### Add or reset users

```bash
./setup_user_password.sh seconduser
./setup_user_password.sh idfcuser --reset
sudo systemctl restart decision-tree-api
```

Adding an existing user fails unless --reset is supplied. Other users are retained.
Usernames support letters, digits, underscores, dots, @ and hyphens. Passwords are
never passed on the command line. Each distinct username maps to one workspace;
sessions for the same username share that workspace. A password reset does not
revoke previously issued stateless JWTs; token expiry still applies.

## 4. Optional S3 access

Local CSV uploads and login do not need AWS credentials. For S3 reads and writes
from EC2, attach an IAM role granting s3:GetObject and s3:PutObject on the required
bucket/prefix. Being in the same AWS account is not sufficient permission.

In EC2: Instances -> select instance -> Actions -> Security -> Modify IAM role.
Create a role trusted by EC2 through IAM first if needed.

Remove AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY from .env when using the role,
including the template's old placeholder values. Boto3 obtains rotating role
credentials automatically when no other credentials override them. Check for old
credentials in the service environment or the ubuntu user's ~/.aws/credentials if
the wrong identity is used. Keep AWS_REGION set to the bucket's region.

SSE-KMS objects may also require kms:Decrypt for reads and kms:GenerateDataKey for
writes, with permission in the KMS key policy. See [backend/S3_SETUP.md](backend/S3_SETUP.md).
Do not enable DF_STORE_BACKEND=s3: the heavy DataFrame storage backend currently
implements disk only. S3 file import/export is a separate, implemented feature.

## 5. Manual startup and health check

```bash
cd ~/project_iDT_2/backend
./start.sh
```

Gunicorn runs in the foreground: the terminal staying occupied after "Listening"
and "Booting worker" is expected. Use a second SSH session:

```bash
curl -i http://127.0.0.1:5000/api/health
# Expected: HTTP 200 and {"message":"Decision Tree API is running","status":"healthy"}
```

This only confirms the health route responds; upload a CSV and build a tree to
exercise authentication, Redis and dataset storage. Press Ctrl+C in the first
terminal before starting systemd. Do not run manual and systemd instances together.

start.sh loads .env before Gunicorn config, invokes venv/bin/python explicitly,
binds localhost, and records its master PID in backend/run/gunicorn.pid.

## 6. Install the systemd service

```bash
sudo cp ~/project_iDT_2/backend/systemd.service.example /etc/systemd/system/decision-tree-api.service
sudo nano /etc/systemd/system/decision-tree-api.service
# Confirm User, WorkingDirectory and ExecStart paths match this installation.
sudo systemd-analyze verify /etc/systemd/system/decision-tree-api.service
sudo systemctl daemon-reload
sudo systemctl enable decision-tree-api
sudo systemctl restart decision-tree-api
sudo systemctl status decision-tree-api --no-pager -l
curl -i http://127.0.0.1:5000/api/health
```

The template starts /bin/bash .../start.sh. Do not add EnvironmentFile=.env:
start.sh owns loading/quoting consistently, including inline comments. Do not add
ExecStartPre calls to stop.sh, port-killing commands, or Bash parameter defaults
such as ${PORT:-5000} directly to ExecStart. systemd does not run those as a shell.

Expected status: active (running), with a successful health check. A brief start
is normal; activating (auto-restart) with Result: exit-code means a failure loop.
Check:

```bash
sudo journalctl -u decision-tree-api -n 60 --no-pager
```

Review logs locally before sharing: the existing application can log data or hash
fragments. No systemd pre-start command should stop/disable the service itself.

## 7. Build the frontend and configure nginx

```bash
cd ~/project_iDT_2/frontend/tree-forge-ui
npm ci
VITE_API_BASE_URL=/api npm run build
test -f dist/index.html
```

Serve built assets from /var/www so nginx does not need access to your private
home directory. Repeat the copy whenever rebuilding the frontend:

```bash
sudo mkdir -p /var/www/decision-tree
sudo cp -a ~/project_iDT_2/frontend/tree-forge-ui/dist/. /var/www/decision-tree/
sudo find /var/www/decision-tree -type d -exec chmod 755 {} +
sudo find /var/www/decision-tree -type f -exec chmod 644 {} +
sudo cp ~/project_iDT_2/backend/nginx.conf.example /etc/nginx/sites-available/decision-tree
sudo nano /etc/nginx/sites-available/decision-tree
# Confirm root /var/www/decision-tree; and proxy_pass http://127.0.0.1:5000;
sudo ln -sfn /etc/nginx/sites-available/decision-tree /etc/nginx/sites-enabled/decision-tree
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

The nginx template does not impose a request-body size cap and uses 300-second
proxy timeouts. Adjust `GUNICORN_TIMEOUT` if exceptionally large imports need
more processing time.
Do not expose Gunicorn's port through the EC2 security group.

```bash
curl -i http://127.0.0.1/api/health
curl -I http://127.0.0.1/
```

Open http://YOUR_PUBLIC_IP, log in, upload CSV, set target/types, and build a tree.
For HTTPS with a domain pointing at the instance:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
# Change CORS_ORIGINS in .env to https://yourdomain.com, then:
sudo systemctl restart decision-tree-api
```

## 8. Operations and updates

```bash
sudo systemctl status decision-tree-api --no-pager -l
sudo journalctl -u decision-tree-api -f
sudo systemctl restart decision-tree-api
sudo systemctl stop decision-tree-api
```

stop.sh stops the systemd service without disabling boot startup. For manual
processes it uses this checkout's PID file and verifies the process before TERM.
It never kills all Gunicorn processes or every process using port 5000. Legacy
manual runs without a PID file should be stopped with Ctrl+C in their terminal.

For an update:

```bash
cd ~/project_iDT_2
git pull
sudo systemctl stop decision-tree-api
cd backend
./deploy.sh
# Do not replace .env or rerun user setup unless changing credentials.
# If this update changes the service template, install it again and daemon-reload.
sudo systemctl restart decision-tree-api
curl -i http://127.0.0.1:5000/api/health
```

Rebuild/copy the frontend separately if its code changed. Restarting workers clears
in-process caches, not the metadata in Redis or Parquet files on disk (subject to
session expiry). One workspace exists per username. The frontend currently clears
local credentials on logout; backend /api/logout performs the explicit workspace
purge. Do not assume the browser logout button has deleted the stored workspace.

Monitor EBS space, Redis memory, worker RAM, request duration and disk permissions.
The cleanup scheduler removes orphaned Parquet datasets after session expiry;
raw uploaded CSVs under uploads/ have a separate lifetime and need operational
retention management. Keep backups of settings and required source datasets.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| pandas metadata-generation-failed / Python 3.14 / compiler killed | Recreate venv with Python 3.12; use the recovery steps above. |
| export: '#' or '24h': not a valid identifier | Install the updated start.sh; it sources .env without xargs. |
| Listening / Booting worker and no shell prompt | Normal foreground operation; use another SSH session for curl. |
| activating (auto-restart), exit-code | Read journalctl; install the corrected service template and daemon-reload. |
| Address already in use | Stop the manual instance or existing service; inspect sudo ss -ltnp. Do not kill arbitrary listeners. |
| Wrong username/password | Use scripts/check_login.py below; reset the intended user and restart. |
| Redis 503 | Check redis-server, REDIS_HOST/PORT/PASSWORD and redis-cli ping. |
| Session data expired (400) | Upload the dataset again; check TTL and df_store availability. |
| Oversized upload (413) | Check for a size cap imposed by the hosting platform or another proxy. |
| Worker timeout | Tune GUNICORN_TIMEOUT and proxy timeouts to measured workload. |
| nginx 500 / permission denied | Serve assets from /var/www; check root and nginx error log. |
| S3 access denied | Check role, bucket/prefix policy, region, KMS and overriding static credentials. |

Safe login diagnostic (prompts normally; prints no token or hash):

```bash
cd ~/project_iDT_2/backend
venv/bin/python scripts/check_login.py
```

- Password matches .env: False / API 401: wrong username/password, unsupported or
  damaged hash. Reset via ./setup_user_password.sh USER --reset.
- True / API 401: service environment differs; check quoting, the script path,
  old EnvironmentFile settings, then restart.
- True / API 200: direct backend login works; check the browser's API URL and nginx.
- A connection error or 5xx needs service/configuration diagnosis.

Never paste passwords, JWT secrets, access keys, tokens or stored hashes into chat.
