#!/usr/bin/env bash
# Inspect this application's master and direct children, not all Gunicorn apps.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
MASTER_PID=""
if command -v systemctl >/dev/null 2>&1; then
    MASTER_PID="$(systemctl show decision-tree-api.service --property=MainPID --value 2>/dev/null || true)"
fi
if [[ -z "$MASTER_PID" || "$MASTER_PID" == 0 ]]; then
    if [[ -f run/gunicorn.pid ]]; then
        MASTER_PID="$(cat run/gunicorn.pid)"
    fi
fi
if [[ ! "$MASTER_PID" =~ ^[0-9]+$ || "$MASTER_PID" -le 1 ]]; then
    echo "No running application master found." >&2
    exit 1
fi
ps -p "$MASTER_PID" -o pid,ppid,args
ps --ppid "$MASTER_PID" -o pid,ppid,args
echo "Compare children with WEB_CONCURRENCY in .env; Redis-backed state supports multiple workers."
