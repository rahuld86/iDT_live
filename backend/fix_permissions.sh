#!/bin/bash

# Comprehensive fix for nginx permission denied errors
# This script checks and fixes ALL parent directory permissions

echo "=== Fixing Nginx Permissions (Comprehensive) ==="
echo ""

FRONTEND_DIST="$HOME/project_iDT_2/frontend/tree-forge-ui/dist"

if [ ! -d "$FRONTEND_DIST" ]; then
    echo "✗ Frontend dist directory not found: $FRONTEND_DIST"
    echo "  Fix: cd ~/project_iDT_2/frontend/tree-forge-ui && VITE_API_BASE_URL=/api npm run build"
    exit 1
fi

echo "Checking full path: $FRONTEND_DIST"
echo ""

# Check ALL parent directories from root
echo "1. Checking ALL parent directory permissions (root to dist)..."
echo "---"

FULL_PATH="$FRONTEND_DIST"
PARENT_DIRS=()

# Build list of all parent directories
while [ "$FULL_PATH" != "/" ]; do
    PARENT_DIRS+=("$FULL_PATH")
    FULL_PATH=$(dirname "$FULL_PATH")
done

# Reverse the array to go from root to dist
for (( idx=${#PARENT_DIRS[@]}-1 ; idx>=0 ; idx-- )); do
    DIR="${PARENT_DIRS[idx]}"
    if [ -d "$DIR" ]; then
        PERMS=$(stat -c "%a" "$DIR" 2>/dev/null)
        OWNER=$(stat -c "%U:%G" "$DIR" 2>/dev/null)
        echo "  $DIR"
        echo "    Permissions: $PERMS, Owner: $OWNER"
        
        # Check if nginx can traverse
        if sudo -u www-data test -x "$DIR" 2>/dev/null; then
            echo "    ✓ Nginx can traverse"
        else
            echo "    ✗ Nginx CANNOT traverse - FIXING..."
            sudo chmod +x "$DIR"
            if sudo -u www-data test -x "$DIR" 2>/dev/null; then
                echo "    ✓ Fixed"
            else
                echo "    ✗ Still not accessible - trying 755..."
                sudo chmod 755 "$DIR"
            fi
        fi
    fi
done

echo "---"
echo ""

# Special check for /home directory
echo "2. Checking /home directory (often problematic)..."
if [ -d "/home" ]; then
    HOME_PERMS=$(stat -c "%a" "/home" 2>/dev/null)
    echo "  /home permissions: $HOME_PERMS"
    if [ "$HOME_PERMS" != "755" ] && [ "$HOME_PERMS" != "755" ]; then
        echo "  ⚠ /home might need execute permission"
        sudo chmod +x /home
    fi
    if sudo -u www-data test -x /home 2>/dev/null; then
        echo "  ✓ /home is accessible to nginx"
    else
        echo "  ✗ /home is NOT accessible - FIXING..."
        sudo chmod 755 /home
    fi
fi

echo ""

# Special check for /home/ubuntu directory
echo "3. Checking /home/ubuntu directory (often 700 by default)..."
if [ -d "$HOME" ]; then
    HOME_PERMS=$(stat -c "%a" "$HOME" 2>/dev/null)
    OWNER=$(stat -c "%U:%G" "$HOME" 2>/dev/null)
    echo "  $HOME permissions: $HOME_PERMS, Owner: $OWNER"
    
    if [ "$HOME_PERMS" = "700" ]; then
        echo "  ⚠ /home/ubuntu is 700 (only owner can access)"
        echo "  Fixing to 755..."
        sudo chmod 755 "$HOME"
        echo "  ✓ Changed to 755"
    fi
    
    if sudo -u www-data test -x "$HOME" 2>/dev/null; then
        echo "  ✓ /home/ubuntu is accessible to nginx"
    else
        echo "  ✗ /home/ubuntu is NOT accessible - trying ownership..."
        # Don't change ownership of home directory, just permissions
        sudo chmod 755 "$HOME"
    fi
fi

echo ""

# Fix dist directory permissions
echo "4. Fixing dist directory permissions..."
sudo chmod -R 755 "$FRONTEND_DIST"
echo "✓ Dist directory permissions set"

# Fix all parent directories explicitly
echo ""
echo "5. Ensuring all parent directories are traversable..."
sudo chmod +x "$HOME/project_iDT_2"
sudo chmod +x "$HOME/project_iDT_2/frontend"
sudo chmod +x "$HOME/project_iDT_2/frontend/tree-forge-ui"
echo "✓ Parent directories updated"

echo ""

# Final verification - test full path access
echo "6. Final verification - testing full path access..."
FULL_TEST=true

# Test each directory in path
TEST_PATH="/"
for DIR in home ubuntu project_iDT_2 frontend tree-forge-ui dist; do
    TEST_PATH="${TEST_PATH%/}/${DIR}"
    if sudo -u www-data test -x "$TEST_PATH" 2>/dev/null; then
        echo "  ✓ $TEST_PATH accessible"
    else
        echo "  ✗ $TEST_PATH NOT accessible"
        FULL_TEST=false
    fi
done

if [ "$FULL_TEST" = true ]; then
    # Test reading the actual file
    if sudo -u www-data test -r "$FRONTEND_DIST/index.html" 2>/dev/null; then
        echo ""
        echo "✓✓✓ All checks passed! Nginx should be able to read files now."
    else
        echo ""
        echo "⚠ Path is accessible but can't read index.html - checking file permissions..."
        ls -l "$FRONTEND_DIST/index.html"
        sudo chmod 644 "$FRONTEND_DIST/index.html"
        sudo chmod 644 "$FRONTEND_DIST"/* 2>/dev/null || true
    fi
else
    echo ""
    echo "✗ Path is still not fully accessible"
    echo "  Trying alternative: change ownership..."
    sudo chown -R www-data:www-data "$FRONTEND_DIST"
fi

echo ""
echo "=== Summary ==="
echo ""
echo "If issues persist, consider:"
echo "1. Moving files to /var/www/html (standard location)"
echo "2. Checking SELinux/AppArmor if enabled"
echo "3. Verifying nginx user: ps aux | grep nginx"
echo ""

