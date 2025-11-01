#!/bin/bash

# Production startup script for EC2 deployment

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Load environment variables
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Set default values
export PORT=${PORT:-5000}
export WEB_CONCURRENCY=${WEB_CONCURRENCY:-4}
export LOG_LEVEL=${LOG_LEVEL:-info}

# Check if port is already in use
check_port() {
    PORT=$1
    # Try multiple methods to check if port is in use
    if command -v lsof &> /dev/null; then
        if lsof -ti:${PORT} &> /dev/null || sudo lsof -ti:${PORT} &> /dev/null; then
            return 1
        fi
    elif command -v netstat &> /dev/null; then
        if netstat -tuln 2>/dev/null | grep -q ":${PORT} "; then
            return 1
        fi
    elif command -v ss &> /dev/null; then
        if ss -tuln 2>/dev/null | grep -q ":${PORT} "; then
            return 1
        fi
    fi
    return 0
}

# Check if port is in use
if ! check_port ${PORT}; then
    echo "Error: Port ${PORT} is already in use"
    echo ""
    echo "To find what's using the port, run:"
    echo "  sudo lsof -i :${PORT}"
    echo "  or"
    echo "  sudo netstat -tulpn | grep :${PORT}"
    echo ""
    echo "To stop existing processes, run:"
    echo "  ./stop.sh"
    echo "  or if using systemd:"
    echo "  sudo systemctl stop decision-tree-api"
    echo ""
    exit 1
fi

# Start gunicorn
exec gunicorn \
    --config gunicorn_config.py \
    --bind 0.0.0.0:${PORT} \
    wsgi:app

