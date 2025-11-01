#!/bin/bash

# Deployment verification script
# Checks if frontend, backend, and nginx are properly configured

echo "=== Deployment Verification ==="
echo ""

# Check frontend build
echo "1. Checking frontend build..."
FRONTEND_DIR="$HOME/project_iDT_2/frontend/tree-forge-ui"
if [ -d "$FRONTEND_DIR/dist" ]; then
    echo "✓ Frontend dist/ directory exists"
    echo "  Location: $FRONTEND_DIR/dist"
    FILE_COUNT=$(find "$FRONTEND_DIR/dist" -type f | wc -l)
    echo "  Files: $FILE_COUNT"
    
    if [ -f "$FRONTEND_DIR/dist/index.html" ]; then
        echo "✓ index.html found"
    else
        echo "✗ index.html NOT found"
    fi
else
    echo "✗ Frontend dist/ directory NOT found"
    echo "  Expected at: $FRONTEND_DIR/dist"
fi

echo ""

# Check backend
echo "2. Checking backend..."
BACKEND_DIR="$HOME/project_iDT_2/backend"
if [ -d "$BACKEND_DIR" ]; then
    echo "✓ Backend directory exists"
    
    if [ -f "$BACKEND_DIR/.env" ]; then
        echo "✓ .env file exists"
    else
        echo "✗ .env file NOT found"
    fi
    
    if systemctl is-active --quiet decision-tree-api 2>/dev/null; then
        echo "✓ Backend service is running"
    else
        echo "✗ Backend service is NOT running"
        echo "  Check with: sudo systemctl status decision-tree-api"
    fi
    
    # Check if port 5000 is listening
    if netstat -tuln 2>/dev/null | grep -q ":5000 " || ss -tuln 2>/dev/null | grep -q ":5000 "; then
        echo "✓ Port 5000 is listening"
    else
        echo "✗ Port 5000 is NOT listening"
    fi
else
    echo "✗ Backend directory NOT found"
fi

echo ""

# Check nginx
echo "3. Checking nginx..."
if command -v nginx &> /dev/null; then
    echo "✓ Nginx is installed"
    
    if systemctl is-active --quiet nginx 2>/dev/null; then
        echo "✓ Nginx service is running"
    else
        echo "✗ Nginx service is NOT running"
        echo "  Start with: sudo systemctl start nginx"
    fi
    
    # Check nginx configuration
    if [ -f "/etc/nginx/sites-available/decision-tree" ]; then
        echo "✓ Nginx configuration file exists"
    else
        echo "✗ Nginx configuration file NOT found"
        echo "  Expected at: /etc/nginx/sites-available/decision-tree"
    fi
    
    if [ -L "/etc/nginx/sites-enabled/decision-tree" ]; then
        echo "✓ Nginx site is enabled (symlink exists)"
    else
        echo "✗ Nginx site is NOT enabled"
        echo "  Enable with: sudo ln -s /etc/nginx/sites-available/decision-tree /etc/nginx/sites-enabled/"
    fi
    
    # Check nginx configuration syntax
    if sudo nginx -t 2>/dev/null; then
        echo "✓ Nginx configuration is valid"
    else
        echo "✗ Nginx configuration has errors"
        echo "  Check with: sudo nginx -t"
    fi
else
    echo "✗ Nginx is NOT installed"
    echo "  Install with: sudo apt install nginx"
fi

echo ""

# Check firewall
echo "4. Checking firewall..."
if command -v ufw &> /dev/null; then
    if sudo ufw status 2>/dev/null | grep -q "80/tcp"; then
        echo "✓ Port 80 is open"
    else
        echo "✗ Port 80 might be blocked"
        echo "  Open with: sudo ufw allow 80/tcp"
    fi
else
    echo "? UFW not found (check EC2 security groups)"
fi

echo ""

# Check ports
echo "5. Checking listening ports..."
echo "Port 80 (HTTP):"
if sudo netstat -tuln 2>/dev/null | grep ":80 " || sudo ss -tuln 2>/dev/null | grep ":80 "; then
    echo "  ✓ Port 80 is listening"
else
    echo "  ✗ Port 80 is NOT listening"
fi

echo "Port 5000 (Backend):"
if sudo netstat -tuln 2>/dev/null | grep ":5000 " || sudo ss -tuln 2>/dev/null | grep ":5000 "; then
    echo "  ✓ Port 5000 is listening"
else
    echo "  ✗ Port 5000 is NOT listening"
fi

echo ""
echo "=== Verification Complete ==="
echo ""
echo "Next steps if issues found:"
echo "1. Ensure frontend is built: cd $FRONTEND_DIR && VITE_API_BASE_URL=/api npm run build"
echo "2. Ensure nginx is configured: sudo nano /etc/nginx/sites-available/decision-tree"
echo "3. Update nginx config paths to match your installation"
echo "4. Test nginx: sudo nginx -t"
echo "5. Reload nginx: sudo systemctl reload nginx"
echo "6. Check EC2 security group allows inbound traffic on port 80"

