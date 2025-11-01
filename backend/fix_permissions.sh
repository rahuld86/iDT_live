#!/bin/bash

# Quick fix for nginx permission denied errors

echo "=== Fixing Nginx Permissions ==="
echo ""

FRONTEND_DIST="$HOME/project_iDT_2/frontend/tree-forge-ui/dist"

if [ ! -d "$FRONTEND_DIST" ]; then
    echo "✗ Frontend dist directory not found: $FRONTEND_DIST"
    echo "  Fix: cd ~/project_iDT_2/frontend/tree-forge-ui && VITE_API_BASE_URL=/api npm run build"
    exit 1
fi

echo "Fixing permissions for: $FRONTEND_DIST"
echo ""

# Fix permissions - make readable by all (including nginx www-data user)
echo "1. Setting permissions to 755 (readable by all)..."
sudo chmod -R 755 "$FRONTEND_DIST"
echo "✓ Permissions set"

# Verify nginx can read
echo ""
echo "2. Verifying nginx user can read..."
if sudo -u www-data test -r "$FRONTEND_DIST" && sudo -u www-data test -r "$FRONTEND_DIST/index.html"; then
    echo "✓ Nginx user (www-data) can now read files"
else
    echo "⚠ Nginx user still cannot read - trying ownership change..."
    sudo chown -R www-data:www-data "$FRONTEND_DIST"
    echo "✓ Changed ownership to www-data"
fi

# Check parent directories - nginx needs execute permission on parent dirs
echo ""
echo "3. Checking parent directory permissions..."
PARENT_DIRS=(
    "$HOME"
    "$HOME/project_iDT_2"
    "$HOME/project_iDT_2/frontend"
    "$HOME/project_iDT_2/frontend/tree-forge-ui"
)

for DIR in "${PARENT_DIRS[@]}"; do
    if [ -d "$DIR" ]; then
        # Ensure execute permission for directory traversal
        sudo chmod +x "$DIR"
        if sudo -u www-data test -x "$DIR"; then
            echo "✓ $DIR is accessible"
        else
            echo "✗ $DIR is NOT accessible to nginx"
            sudo chmod 755 "$DIR"
        fi
    fi
done

echo ""
echo "4. Verifying final permissions..."
ls -ld "$FRONTEND_DIST"
ls -l "$FRONTEND_DIST/index.html" 2>/dev/null | head -1

echo ""
echo "=== Summary ==="
echo ""
echo "✓ Permissions fixed"
echo ""
echo "Next steps:"
echo "1. Reload nginx: sudo systemctl reload nginx"
echo "2. Test: curl http://localhost"
echo ""

