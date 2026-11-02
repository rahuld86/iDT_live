#!/usr/bin/env bash
# Stop this service or this checkout's manually started Gunicorn gracefully.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# Never call this script from ExecStartPre/ExecStop in the systemd unit.
if command -v systemctl >/dev/null 2>&1; then
    SERVICE_STATE="$(systemctl show decision-tree-api.service --property=ActiveState --value 2>/dev/null || true)"
    case "$SERVICE_STATE" in
        active|activating|reloading|deactivating)
            echo "Stopping decision-tree-api.service (boot enablement is preserved)..."
            if [[ "$EUID" -eq 0 ]]; then
                systemctl stop decision-tree-api.service
            else
                sudo systemctl stop decision-tree-api.service
            fi
            ;;
    esac
fi

PID_FILE="$PWD/run/gunicorn.pid"
if [[ ! -f "$PID_FILE" ]]; then
    echo "No manual Gunicorn PID file; nothing else to stop."
    exit 0
fi
PID="$(cat "$PID_FILE")"
if [[ ! "$PID" =~ ^[0-9]+$ || "$PID" -le 1 ]]; then
    echo "Invalid PID file; refusing to signal a process." >&2
    exit 1
fi
if [[ ! -d "/proc/$PID" ]]; then
    rm -- "$PID_FILE"
    echo "Removed stale PID file."
    exit 0
fi
PROCESS_DIR="$(readlink -f "/proc/$PID/cwd" || true)"
PROCESS_COMMAND="$(tr '\0' ' ' < "/proc/$PID/cmdline" 2>/dev/null || true)"
if [[ "$PROCESS_DIR" != "$PWD" || "$PROCESS_COMMAND" != *gunicorn* ]]; then
    echo "PID $PID does not identify this checkout's Gunicorn; refusing to stop it." >&2
    exit 1
fi
kill -TERM "$PID"
for ((attempt = 0; attempt < 30; attempt++)); do
    if ! kill -0 "$PID" 2>/dev/null; then
        echo "Gunicorn stopped."
        exit 0
    fi
    sleep 1
done
echo "Gunicorn has not exited after 30 seconds; inspect it before taking further action." >&2
exit 1
