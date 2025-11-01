#!/bin/bash

# Stop script for EC2 deployment

# Find and kill processes on port 5000
PORT=${PORT:-5000}

echo "Checking for processes on port ${PORT}..."

# Stop systemd service first (important!)
if systemctl is-active --quiet decision-tree-api 2>/dev/null || systemctl is-enabled --quiet decision-tree-api 2>/dev/null; then
    echo "Stopping systemd service: decision-tree-api"
    sudo systemctl stop decision-tree-api
    sudo systemctl disable decision-tree-api 2>/dev/null
    sleep 3
    echo "Service stopped"
fi

# Wait a bit for processes to clean up
sleep 2

# Find all PIDs using the port using multiple methods
echo "Finding processes on port ${PORT}..."

PIDS=""

# Method 1: lsof
if command -v lsof &> /dev/null; then
    LSOF_PIDS=$(sudo lsof -ti:${PORT} 2>/dev/null || lsof -ti:${PORT} 2>/dev/null || echo "")
    if [ ! -z "$LSOF_PIDS" ]; then
        PIDS="$PIDS $LSOF_PIDS"
    fi
fi

# Method 2: netstat
if command -v netstat &> /dev/null; then
    NETSTAT_PIDS=$(sudo netstat -tulpn 2>/dev/null | grep ":${PORT} " | awk '{print $7}' | cut -d'/' -f1 | grep -v '-' | sort -u | tr '\n' ' ')
    if [ ! -z "$NETSTAT_PIDS" ]; then
        PIDS="$PIDS $NETSTAT_PIDS"
    fi
fi

# Method 3: ss
if command -v ss &> /dev/null; then
    SS_PIDS=$(sudo ss -tulpn 2>/dev/null | grep ":${PORT} " | awk '{print $6}' | cut -d',' -f2 | cut -d'=' -f2 | sort -u | tr '\n' ' ')
    if [ ! -z "$SS_PIDS" ]; then
        PIDS="$PIDS $SS_PIDS"
    fi
fi

# Method 4: fuser (if available)
if command -v fuser &> /dev/null; then
    FUSER_PIDS=$(sudo fuser ${PORT}/tcp 2>/dev/null | awk '{print $2}' | tr '\n' ' ' || echo "")
    if [ ! -z "$FUSER_PIDS" ]; then
        PIDS="$PIDS $FUSER_PIDS"
    fi
fi

# Also find any gunicorn processes that might be lingering
GUNICORN_PIDS=$(ps aux | grep -E '[g]unicorn|wsgi:app' | grep -v grep | awk '{print $2}' | tr '\n' ' ' || echo "")
if [ ! -z "$GUNICORN_PIDS" ]; then
    PIDS="$PIDS $GUNICORN_PIDS"
fi

# Clean up PIDS: remove duplicates and empty values
PIDS=$(echo $PIDS | tr ' ' '\n' | sort -u | tr '\n' ' ' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

if [ -z "$PIDS" ] || [ "$PIDS" = "" ]; then
    echo "No process found on port ${PORT}"
    echo "Port ${PORT} is free"
    exit 0
fi

echo "Found processes on port ${PORT}: $PIDS"

# Kill all found processes
echo "Killing processes..."
for PID in $PIDS; do
    if [ ! -z "$PID" ] && [ "$PID" != "" ]; then
        # Check if process still exists
        if ps -p $PID > /dev/null 2>&1; then
            echo "Killing PID: $PID ($(ps -p $PID -o comm= 2>/dev/null || echo 'unknown'))"
            sudo kill -9 $PID 2>/dev/null || kill -9 $PID 2>/dev/null || true
        fi
    fi
done

# Wait for processes to die
sleep 3

# Verify port is free
echo "Verifying port ${PORT} is free..."

# Try all methods again
REMAINING_PIDS=""

if command -v lsof &> /dev/null; then
    REMAINING=$(sudo lsof -ti:${PORT} 2>/dev/null || lsof -ti:${PORT} 2>/dev/null || echo "")
    if [ ! -z "$REMAINING" ]; then
        REMAINING_PIDS="$REMAINING_PIDS $REMAINING"
    fi
fi

if command -v netstat &> /dev/null; then
    REMAINING=$(sudo netstat -tulpn 2>/dev/null | grep ":${PORT} " | awk '{print $7}' | cut -d'/' -f1 | grep -v '-' || echo "")
    if [ ! -z "$REMAINING" ]; then
        REMAINING_PIDS="$REMAINING_PIDS $REMAINING"
    fi
fi

# Clean up
REMAINING_PIDS=$(echo $REMAINING_PIDS | tr ' ' '\n' | sort -u | tr '\n' ' ' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

if [ -z "$REMAINING_PIDS" ] || [ "$REMAINING_PIDS" = "" ]; then
    echo "✓ Port ${PORT} is now free"
    exit 0
else
    echo "✗ Warning: Some processes may still be running"
    echo "Remaining PIDs: $REMAINING_PIDS"
    echo ""
    echo "Try killing them manually:"
    for PID in $REMAINING_PIDS; do
        echo "  sudo kill -9 $PID"
    done
    exit 1
fi

