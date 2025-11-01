#!/bin/bash

# Deployment script for EC2
# This script sets up the backend for production

set -e

echo "Starting deployment..."

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Create uploads directory if it doesn't exist
if [ ! -d "uploads" ]; then
    echo "Creating uploads directory..."
    mkdir -p uploads
fi

# Set permissions
chmod +x start.sh

# Copy .env file if it doesn't exist
if [ ! -f ".env" ] && [ -f "env.example" ]; then
    echo "Copying env.example to .env..."
    cp env.example .env
    echo "Please edit .env file with your configuration"
fi

echo "Deployment complete!"
echo ""
echo "To start the application, run:"
echo "  ./start.sh"
echo ""
echo "Or use systemd service (see DEPLOYMENT.md for details)"

