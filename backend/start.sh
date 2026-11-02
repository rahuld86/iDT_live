#!/usr/bin/env bash
# Foreground entry point for both interactive use and systemd.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if [[ ! -x venv/bin/python ]]; then
    echo "Error: backend/venv is missing. Run ./deploy.sh first." >&2
    exit 1
fi
if [[ ! -f .env ]]; then
    echo "Error: backend/.env is missing. Run ./deploy.sh and configure it first." >&2
    exit 1
fi

# Trusted Bash-compatible configuration. Single-quote hashes/passwords containing $.
# This preserves quoted spaces and ignores inline comments, unlike export/xargs.
set -a
source ./.env
set +a

export PORT="${PORT:-5000}"
export WEB_CONCURRENCY="${WEB_CONCURRENCY:-4}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export GUNICORN_TIMEOUT="${GUNICORN_TIMEOUT:-300}"

venv/bin/python - <<'PY'
import os
import sys

if not (3, 10) <= sys.version_info[:2] <= (3, 12):
    raise SystemExit("Unsupported venv Python; use Python 3.10-3.12. See ../DEPLOYMENT.md.")
secret = os.getenv("JWT_SECRET_KEY", "")
if len(secret) < 32 or secret in {"your-super-secret-key-change-in-production", "change-this-secret-key"}:
    raise SystemExit("Configure JWT_SECRET_KEY with ./setup_user_password.sh before startup.")
if not os.getenv("AUTH_USERS", "").strip():
    raise SystemExit("Configure AUTH_USERS with ./setup_user_password.sh before startup.")
for entry in os.environ["AUTH_USERS"].split():
    username, separator, password_hash = entry.partition(":")
    if not username or not separator or not password_hash.startswith(("scrypt:", "pbkdf2:")) or password_hash.count("$") != 2:
        raise SystemExit("Invalid AUTH_USERS entry. Use ./setup_user_password.sh USER --reset; single-quote AUTH_USERS.")
PY

mkdir -p run
chmod 700 run
# Gunicorn owns the bind check; never sudo or kill another process to free a port.
exec venv/bin/python -m gunicorn \
    --config gunicorn_config.py \
    --bind "127.0.0.1:${PORT}" \
    --pid "$PWD/run/gunicorn.pid" \
    --timeout "$GUNICORN_TIMEOUT" \
    wsgi:app
