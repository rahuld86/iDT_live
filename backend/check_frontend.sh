#!/bin/bash

# Quick check script for frontend serving

echo "=== Frontend Serving Check ==="
echo ""

# Check if frontend is built
echo "1. Checking frontend build..."
FRONTEND_DIST="$HOME/project_iDT_2/frontend/tree-forge-ui/dist"
if [ -d "$FRONTEND_DIST" ]; then
    echo "✓ Frontend dist/ directory exists"
    if [ -f "$FRONTEND_DIST/index.html" ]; then
        echo "✓ index.html found"
        echo "  Location: $FRONTEND_DIST/index.html"
    else
        echo "✗ index.html NOT found"
    fi
else
    echo "✗ Frontend dist/ directory NOT found at: $FRONTEND_DIST"
fi

echo ""

# Check nginx configuration
echo "2. Checking nginx configuration..."
if [ -f "/etc/nginx/sites-available/decision-tree" ]; then
    echo "✓ Nginx config exists"
    
    # Check root path
    ROOT_PATH=$(grep -E "^\s*root" /etc/nginx/sites-available/decision-tree | head -1 | awk '{print $2}' | tr -d ';')
    echo "  Root path in config: $ROOT_PATH"
    
    if [ -d "$ROOT_PATH" ]; then
        echo "✓ Root path exists"
        if [ -f "$ROOT_PATH/index.html" ]; then
            echo "✓ index.html found in root path"
        else
            echo "✗ index.html NOT found in root path"
            echo "  Expected at: $ROOT_PATH/index.html"
        fi
    else
        echo "✗ Root path does NOT exist: $ROOT_PATH"
        echo "  Frontend dist is at: $FRONTEND_DIST"
        echo "  Fix: Update nginx config root path to match your installation"
    fi
else
    echo "✗ Nginx config NOT found"
fi

echo ""

# Check what nginx is serving
echo "3. Checking nginx active configuration..."
if [ -L "/etc/nginx/sites-enabled/decision-tree" ]; then
    echo "✓ Decision-tree site is enabled"
    
    # Check which config is active
    ACTIVE_CONFIG=$(readlink /etc/nginx/sites-enabled/decision-tree)
    echo "  Active config: $ACTIVE_CONFIG"
else
    echo "✗ Decision-tree site is NOT enabled"
    echo "  Default nginx site might be active instead"
    echo "  Check: ls -la /etc/nginx/sites-enabled/"
fi

echo ""

# Check for default nginx site
echo "4. Checking for default nginx site..."
if [ -L "/etc/nginx/sites-enabled/default" ]; then
    echo "⚠ Default nginx site is enabled"
    echo "  This might be serving instead of your app"
    echo "  Disable with: sudo rm /etc/nginx/sites-enabled/default"
fi

echo ""

# Test local access
echo "5. Testing local access..."
echo "  Testing http://localhost:"
LOCAL_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost 2>/dev/null || echo "000")
if [ "$LOCAL_RESPONSE" = "200" ]; then
    echo "  ✓ Local access returns 200 OK"
    # Check if it's serving the React app or default page
    if curl -s http://localhost 2>/dev/null | grep -q "<!DOCTYPE html>"; then
        echo "  ✓ Serving HTML content"
        if curl -s http://localhost 2>/dev/null | grep -qi "react\|vite"; then
            echo "  ✓ Looks like React app"
        else
            echo "  ⚠ Might be serving default nginx page instead of React app"
        fi
    fi
elif [ "$LOCAL_RESPONSE" = "000" ]; then
    echo "  ✗ Cannot connect (nginx might not be running)"
else
    echo "  ✗ Local access returns: $LOCAL_RESPONSE"
fi

echo ""

echo "=== Summary ==="
echo ""
echo "If frontend is not loading:"
echo "1. Verify frontend is built: ls -la $FRONTEND_DIST"
echo "2. Check nginx root path matches your installation"
echo "3. Disable default nginx site: sudo rm /etc/nginx/sites-enabled/default"
echo "4. Reload nginx: sudo systemctl reload nginx"
echo "5. Check nginx error logs: sudo tail -f /var/log/nginx/error.log"

