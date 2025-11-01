#!/bin/bash

# Clean install script for frontend
# Fixes npm install issues by cleaning node_modules and cache

echo "Cleaning frontend installation..."

cd "$(dirname "$0")"

# Remove node_modules if it exists
if [ -d "node_modules" ]; then
    echo "Removing node_modules directory..."
    rm -rf node_modules
fi

# Remove package-lock.json if it exists (optional, will be regenerated)
if [ -f "package-lock.json" ]; then
    echo "Removing package-lock.json..."
    rm -f package-lock.json
fi

# Clear npm cache
echo "Clearing npm cache..."
npm cache clean --force

# Remove .npm directory if it exists
if [ -d ".npm" ]; then
    echo "Removing .npm directory..."
    rm -rf .npm
fi

echo "Cleanup complete. Installing dependencies..."

# Install dependencies
npm install

echo "Installation complete!"

