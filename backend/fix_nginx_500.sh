#!/bin/bash

# Fix nginx 500 error script

echo "=== Fixing Nginx 500 Error ==="
echo ""

# Check nginx error logs first
echo "1. Checking nginx error logs (last 20 lines)..."
echo "---"
sudo tail -20 /var/log/nginx/error.log
echo "---"
echo ""

# Check if frontend is built
echo "2. Checking frontend build..."
FRONTEND_DIST="$HOME/project_iDT_2/frontend/tree-forge-ui/dist"
if [ -d "$FRONTEND_DIST" ]; then
    echo "✓ Frontend dist exists: $FRONTEND_DIST"
    if [ -f "$FRONTEND_DIST/index.html" ]; then
        echo "✓ index.html exists"
    else
        echo "✗ index.html NOT found - frontend not built properly"
        echo "  Fix: cd ~/project_iDT_2/frontend/tree-forge-ui && VITE_API_BASE_URL=/api npm run build"
    fi
else
    echo "✗ Frontend dist NOT found at: $FRONTEND_DIST"
    echo "  Fix: cd ~/project_iDT_2/frontend/tree-forge-ui && VITE_API_BASE_URL=/api npm run build"
fi

echo ""

# Check nginx configuration
echo "3. Checking nginx configuration..."
if [ -f "/etc/nginx/sites-available/decision-tree" ]; then
    echo "✓ Config file exists"
    
    # Check root path
    ROOT_PATH=$(grep -E "^\s*root" /etc/nginx/sites-available/decision-tree 2>/dev/null | head -1 | awk '{print $2}' | tr -d ';' | tr -d ' ')
    
    if [ -z "$ROOT_PATH" ]; then
        echo "✗ No root path found in config"
    else
        echo "  Root path in config: $ROOT_PATH"
        
        # Check if path exists
        if [ -d "$ROOT_PATH" ]; then
            echo "✓ Root path exists"
            
            # Check permissions
            if [ -r "$ROOT_PATH" ]; then
                echo "✓ Root path is readable"
            else
                echo "✗ Root path is NOT readable"
                echo "  Fix: sudo chmod -R 755 $ROOT_PATH"
            fi
            
            if [ -f "$ROOT_PATH/index.html" ]; then
                echo "✓ index.html exists in root path"
            else
                echo "✗ index.html NOT found in root path"
                echo "  Expected: $ROOT_PATH/index.html"
                echo "  Actual dist is at: $FRONTEND_DIST"
                echo "  Fix: Update nginx config root path"
            fi
        else
            echo "✗ Root path does NOT exist: $ROOT_PATH"
            echo "  Frontend is at: $FRONTEND_DIST"
            echo "  Fix: Update nginx config to use correct path"
        fi
    fi
else
    echo "✗ Config file NOT found"
    echo "  Fix: cd ~/project_iDT_2/backend && sudo ./setup_nginx.sh"
fi

echo ""

# Check file permissions
echo "4. Checking file permissions..."
if [ -d "$FRONTEND_DIST" ]; then
    echo "Frontend dist permissions:"
    ls -ld "$FRONTEND_DIST"
    
    # Check if nginx user can access
    if sudo -u www-data test -r "$FRONTEND_DIST" 2>/dev/null; then
        echo "✓ Nginx user (www-data) can read dist directory"
    else
        echo "✗ Nginx user (www-data) CANNOT read dist directory"
        echo "  Fix: sudo chmod -R 755 $FRONTEND_DIST"
        echo "  Or: sudo chown -R www-data:www-data $FRONTEND_DIST"
    fi
fi

echo ""

# Test nginx configuration
echo "5. Testing nginx configuration..."
if sudo nginx -t 2>&1 | grep -q "successful"; then
    echo "✓ Nginx configuration is valid"
else
    echo "✗ Nginx configuration has errors:"
    sudo nginx -t
fi

echo ""

# Show current nginx config
echo "6. Current nginx root configuration:"
echo "---"
grep -E "^\s*root|^\s*server_name" /etc/nginx/sites-available/decision-tree 2>/dev/null | head -3
echo "---"

echo ""
echo "=== Common Fixes ==="
echo ""
echo "1. Fix permissions:"
echo "   sudo chmod -R 755 $FRONTEND_DIST"
echo ""
echo "2. Update nginx root path if wrong:"
echo "   sudo nano /etc/nginx/sites-available/decision-tree"
echo "   Change root to: root $FRONTEND_DIST;"
echo ""
echo "3. After fixing, reload nginx:"
echo "   sudo nginx -t"
echo "   sudo systemctl reload nginx"
echo ""

