#!/bin/bash

# Nginx setup script for EC2 deployment

echo "Setting up nginx configuration..."

NGINX_SITE="decision-tree"
NGINX_AVAILABLE="/etc/nginx/sites-available/${NGINX_SITE}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${NGINX_SITE}"
BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "Error: nginx is not installed"
    echo "Install it with: sudo apt install nginx"
    exit 1
fi

# Check if the configuration file exists
if [ ! -f "${BACKEND_DIR}/nginx.conf.example" ]; then
    echo "Error: nginx.conf.example not found in ${BACKEND_DIR}"
    exit 1
fi

# Create configuration in sites-available
echo "Creating nginx configuration..."
sudo cp "${BACKEND_DIR}/nginx.conf.example" "${NGINX_AVAILABLE}" || {
    echo "Error: Failed to copy nginx configuration"
    exit 1
}

# Update paths in configuration (if needed)
# This assumes the backend directory path needs to be updated
# User should manually edit the file with correct paths

# Remove existing link or file if it exists
if [ -L "${NGINX_ENABLED}" ]; then
    echo "Removing existing symbolic link..."
    sudo rm "${NGINX_ENABLED}"
elif [ -f "${NGINX_ENABLED}" ]; then
    echo "Removing existing file..."
    sudo rm "${NGINX_ENABLED}"
fi

# Create symbolic link
echo "Creating symbolic link..."
sudo ln -s "${NGINX_AVAILABLE}" "${NGINX_ENABLED}" || {
    echo "Error: Failed to create symbolic link"
    exit 1
}

# Test nginx configuration
echo "Testing nginx configuration..."
sudo nginx -t || {
    echo "Error: Nginx configuration test failed"
    echo "Please check the configuration file: ${NGINX_AVAILABLE}"
    exit 1
}

echo "✓ Nginx configuration created successfully!"
echo ""
echo "Next steps:"
echo "1. Edit the configuration file: sudo nano ${NGINX_AVAILABLE}"
echo "   - Update paths to match your installation"
echo "   - Update server_name with your domain or IP"
echo ""
echo "2. Test configuration: sudo nginx -t"
echo ""
echo "3. Reload nginx: sudo systemctl reload nginx"
echo "   or restart: sudo systemctl restart nginx"

