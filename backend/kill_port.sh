#!/bin/bash

# Aggressive port cleanup script
# Use this if stop.sh doesn't work

PORT=${1:-5000}

echo "Aggressively cleaning port ${PORT}..."

# Stop systemd service
sudo systemctl stop decision-tree-api 2>/dev/null || true
sleep 2

# Kill all processes on the port - multiple methods
echo "Killing all processes on port ${PORT}..."

# Using lsof
if command -v lsof &> /dev/null; then
    sudo lsof -ti:${PORT} | xargs -r sudo kill -9 2>/dev/null || true
fi

# Using netstat
if command -v netstat &> /dev/null; then
    sudo netstat -tulpn 2>/dev/null | grep ":${PORT} " | awk '{print $7}' | cut -d'/' -f1 | xargs -r sudo kill -9 2>/dev/null || true
fi

# Using ss
if command -v ss &> /dev/null; then
    sudo ss -tulpn 2>/dev/null | grep ":${PORT} " | awk '{print $6}' | cut -d',' -f2 | cut -d'=' -f2 | xargs -r sudo kill -9 2>/dev/null || true
fi

# Kill all gunicorn processes
ps aux | grep '[g]unicorn' | awk '{print $2}' | xargs -r sudo kill -9 2>/dev/null || true

# Kill all python processes running wsgi:app
ps aux | grep '[w]sgi:app' | awk '{print $2}' | xargs -r sudo kill -9 2>/dev/null || true

sleep 3

# Verify
if command -v lsof &> /dev/null; then
    REMAINING=$(sudo lsof -ti:${PORT} 2>/dev/null || echo "")
    if [ -z "$REMAINING" ]; then
        echo "✓ Port ${PORT} is now free"
    else
        echo "✗ Some processes may still be running: $REMAINING"
        echo "Run manually: sudo kill -9 $REMAINING"
    fi
else
    echo "Note: Could not verify with lsof. Please check manually."
    echo "  sudo netstat -tulpn | grep :${PORT}"
fi

