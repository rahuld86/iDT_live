#!/bin/bash

# Fix nginx conflicting server name warning

echo "=== Fixing Nginx Server Name Conflict ==="
echo ""

# Check what's enabled
echo "1. Checking enabled nginx sites..."
echo "---"
ls -la /etc/nginx/sites-enabled/
echo "---"
echo ""

# Check for default site
if [ -L "/etc/nginx/sites-enabled/default" ]; then
    echo "⚠ Default nginx site is enabled"
    echo "  This is causing the conflict"
    echo ""
    echo "Disabling default site..."
    sudo rm /etc/nginx/sites-enabled/default
    echo "✓ Default site disabled"
else
    echo "✓ Default site is not enabled"
fi

echo ""

# Check decision-tree site
if [ -L "/etc/nginx/sites-enabled/decision-tree" ]; then
    echo "✓ Decision-tree site is enabled"
else
    echo "✗ Decision-tree site is NOT enabled"
    echo "  Enabling it..."
    sudo ln -s /etc/nginx/sites-available/decision-tree /etc/nginx/sites-enabled/decision-tree
    echo "✓ Decision-tree site enabled"
fi

echo ""

# Update decision-tree config to use default_server
echo "2. Checking decision-tree configuration..."
if [ -f "/etc/nginx/sites-available/decision-tree" ]; then
    # Check if it already has default_server
    if grep -q "listen 80 default_server" /etc/nginx/sites-available/decision-tree; then
        echo "✓ Already has default_server directive"
    else
        echo "⚠ Adding default_server directive to avoid conflicts"
        echo ""
        echo "Current listen line:"
        grep "listen 80" /etc/nginx/sites-available/decision-tree
        echo ""
        echo "Updating to use default_server..."
        
        # Backup original
        sudo cp /etc/nginx/sites-available/decision-tree /etc/nginx/sites-available/decision-tree.backup
        
        # Update listen directive to include default_server
        sudo sed -i 's/listen 80;/listen 80 default_server;/' /etc/nginx/sites-available/decision-tree
        
        echo "✓ Updated to use default_server"
        echo ""
        echo "Updated listen line:"
        grep "listen 80" /etc/nginx/sites-available/decision-tree
    fi
else
    echo "✗ Decision-tree config not found"
fi

echo ""

# Test nginx configuration
echo "3. Testing nginx configuration..."
if sudo nginx -t 2>&1 | grep -q "successful"; then
    echo "✓ Nginx configuration is valid"
    
    # Check if warning still exists
    if sudo nginx -t 2>&1 | grep -q "conflicting server name"; then
        echo ""
        echo "⚠ Warning still exists (but nginx will work)"
        echo "  This is usually harmless if only one server block is active"
    else
        echo "✓ No warnings - configuration is clean"
    fi
else
    echo "✗ Nginx configuration has errors:"
    sudo nginx -t
    exit 1
fi

echo ""
echo "=== Summary ==="
echo ""
echo "Changes made:"
echo "1. Disabled default nginx site (if it existed)"
echo "2. Ensured decision-tree site is enabled"
echo "3. Added default_server directive to decision-tree config"
echo ""
echo "Next steps:"
echo "  sudo systemctl reload nginx"
echo ""
echo "To verify:"
echo "  sudo nginx -t"
echo "  curl http://localhost"

