#!/bin/bash

# Helper script to check what's using a port

PORT=${1:-5000}

echo "Checking what's using port ${PORT}..."
echo ""

# Try lsof
if command -v lsof &> /dev/null; then
    echo "Using lsof:"
    sudo lsof -i :${PORT} || lsof -i :${PORT} || echo "No process found with lsof"
    echo ""
fi

# Try netstat
if command -v netstat &> /dev/null; then
    echo "Using netstat:"
    sudo netstat -tulpn | grep :${PORT} || echo "No process found with netstat"
    echo ""
fi

# Try ss
if command -v ss &> /dev/null; then
    echo "Using ss:"
    sudo ss -tulpn | grep :${PORT} || echo "No process found with ss"
    echo ""
fi

# Check systemd service
if systemctl list-units --type=service | grep -q decision-tree-api; then
    echo "Systemd service status:"
    systemctl status decision-tree-api --no-pager | head -10
    echo ""
fi

