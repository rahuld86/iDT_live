#!/usr/bin/env bash
# Passwords are prompted securely, never accepted as command-line arguments.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [[ ! -x venv/bin/python ]]; then
    echo "Run ./deploy.sh first to create the virtual environment." >&2
    exit 1
fi
exec venv/bin/python scripts/configure_auth.py "$@"
