# Fix: npm install ENOTEMPTY Error

If you get an error like:
```
npm error ENOTEMPTY: directory not empty, rename '/path/to/node_modules/chokidar'
```

This usually means the `node_modules` directory is corrupted or has permission issues.

## Quick Fix

```bash
cd ~/project_iDT_2/frontend/tree-forge-ui

# Method 1: Use the clean install script
chmod +x clean_install.sh
./clean_install.sh

# Method 2: Manual cleanup
# Remove node_modules
rm -rf node_modules

# Clear npm cache
npm cache clean --force

# Remove package-lock.json (optional, will be regenerated)
rm -f package-lock.json

# Reinstall
npm install
```

## If That Doesn't Work

```bash
# Remove all node-related files
rm -rf node_modules package-lock.json .npm

# Clear npm cache
npm cache clean --force

# Try with verbose output to see what's failing
npm install --verbose

# Or try with legacy peer deps
npm install --legacy-peer-deps
```

## Permission Issues

If you get permission errors:

```bash
# Check ownership
ls -la node_modules | head -5

# Fix ownership (if needed)
sudo chown -R $USER:$USER node_modules
# or
sudo chown -R ubuntu:ubuntu node_modules

# Then retry
npm install
```

