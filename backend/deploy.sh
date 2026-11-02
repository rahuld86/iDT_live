#!/usr/bin/env bash
# Run as the application user. Never replace an existing environment.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
umask 077

supported_python() {
    "$1" -c 'import sys; raise SystemExit(not ((3, 10) <= sys.version_info[:2] <= (3, 12)))'
}

if [[ -d venv ]]; then
    if [[ ! -x venv/bin/python ]] || ! supported_python venv/bin/python; then
        echo "Error: existing venv needs Python 3.10-3.12 (3.12 recommended)." >&2
        echo 'Stop the app, deactivate, and back it up: mv venv "venv-backup-$(date +%Y%m%d%H%M%S)"' >&2
        echo "Then rerun deploy.sh. See ../DEPLOYMENT.md for Python 3.14 recovery." >&2
        exit 1
    fi
elif [[ -n "${PYTHON_BIN:-}" ]]; then
    supported_python "$PYTHON_BIN" || { echo "PYTHON_BIN must use Python 3.10-3.12." >&2; exit 1; }
    "$PYTHON_BIN" -m venv venv
elif command -v python3.12 >/dev/null 2>&1; then
    python3.12 -m venv venv
elif command -v python3 >/dev/null 2>&1 && supported_python python3; then
    python3 -m venv venv
else
    UV_BIN="$(command -v uv || true)"
    if [[ -z "$UV_BIN" && -x "$HOME/.local/bin/uv" ]]; then
        UV_BIN="$HOME/.local/bin/uv"
    fi
    if [[ -z "$UV_BIN" ]]; then
        echo "Python 3.12 is needed; the system Python is unsupported or unavailable." >&2
        echo 'Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh' >&2
        echo 'Then rerun ./deploy.sh; it will create a Python 3.12 venv using uv.' >&2
        exit 1
    fi
    "$UV_BIN" venv --python 3.12 --seed venv
fi

venv/bin/python --version
venv/bin/python -m ensurepip --upgrade
venv/bin/python -m pip install --upgrade pip
# Avoid expensive source builds of the pinned scientific packages on EC2.
venv/bin/python -m pip install --only-binary=pandas,numpy,pyarrow -r requirements.txt
venv/bin/python -m pip check

mkdir -p uploads df_store run
chmod 700 run
chmod +x deploy.sh start.sh stop.sh setup_user_password.sh
if [[ ! -f .env ]]; then
    cp env.example .env
    echo "Created .env. Configure CORS_ORIGINS, AWS_REGION and authentication before startup."
else
    echo "Preserved existing .env and credentials."
fi
chmod 600 .env

echo "Dependencies installed. Configure a user and JWT secret:"
echo "  ./setup_user_password.sh idfcuser"
echo "Then edit .env and follow ../DEPLOYMENT.md to start the systemd service."
