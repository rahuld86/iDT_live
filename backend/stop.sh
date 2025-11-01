#!/bin/bash

# Stop script for EC2 deployment

# Find and kill processes on port 5000
PORT=${PORT:-5000}

echo "Checking for processes on port ${PORT}..."

# Find PIDs using the port
PIDS=$(lsof -ti:${PORT} 2>/dev/null || sudo lsof -ti:${PORT} 2>/dev/null || fuser ${PORT}/tcp 2>/dev/null || echo "")

if [ -z "$PIDS" ]; then
    echo "No process found on port ${PORT}"
    exit 0
fi

echo "Found processes on port ${PORT}: $PIDS"

# Try to stop systemd service first
if systemctl is-active --quiet decision-tree-api 2>/dev/null; then
    echo "Stopping systemd service: decision-tree-api"
    sudo systemctl stop decision-tree-api
    sleep 2
fi

# Check again
PIDS=$(lsof -ti:${PORT} 2>/dev/null || sudo lsof -ti:${PORT} 2>/dev/null || fuser ${PORT}/tcp 2>/dev/null || echo "")

if [ -z "$PIDS" ]; then
    echo "Port ${PORT} is now free"
    exit 0
fi

# Kill remaining processes
echo "Killing processes: $PIDS"
for PID in $PIDS; do
    echo "Killing PID: $PID"
    sudo kill -9 $PID 2>/dev/null || kill -9 $PID 2>/dev/null
done

sleep 1

# Verify port is free
PIDS=$(lsof -ti:${PORT} 2>/dev/null || sudo lsof -ti:${PORT} 2>/dev/null || fuser ${PORT}/tcp 2>/dev/null || echo "")
if [ -z "$PIDS" ]; then
    echo "Port ${PORT} is now free"
else
    echo "Warning: Some processes may still be running"
    echo "Remaining PIDs: $PIDS"
    echo "You may need to kill them manually:"
    echo "  sudo kill -9 $PIDS"
fi

