# Fix: Nginx Symbolic Link "File exists" Error

If you get an error when creating nginx symbolic link:
```
ln: failed to create symbolic link '/etc/nginx/sites-enabled/decision-tree': File exists
```

## Quick Fix

```bash
# Method 1: Use the setup script (recommended)
cd ~/project_iDT_2/backend
chmod +x setup_nginx.sh
sudo ./setup_nginx.sh

# Method 2: Manual fix
# Remove existing link or file
sudo rm /etc/nginx/sites-enabled/decision-tree

# Then create the symbolic link
sudo ln -s /etc/nginx/sites-available/decision-tree /etc/nginx/sites-enabled/

# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

## Check What Exists

Before removing, check what's there:

```bash
# Check if it's a symbolic link
ls -la /etc/nginx/sites-enabled/decision-tree

# If it's a link, check where it points:
readlink /etc/nginx/sites-enabled/decision-tree

# If it's a regular file, view it:
cat /etc/nginx/sites-enabled/decision-tree
```

## If Link Already Points to Correct Location

If the link already exists and points to the correct location, you can skip creating it:

```bash
# Check if link is correct
readlink /etc/nginx/sites-enabled/decision-tree

# If it points to /etc/nginx/sites-available/decision-tree, you're good!
# Just test and reload:
sudo nginx -t
sudo systemctl reload nginx
```

## Complete Setup

```bash
cd ~/project_iDT_2/backend

# 1. Copy configuration to sites-available
sudo cp nginx.conf.example /etc/nginx/sites-available/decision-tree

# 2. Edit configuration with your paths
sudo nano /etc/nginx/sites-available/decision-tree
# Update:
#   - root path: /opt/decision-tree-app/frontend/tree-forge-ui/dist
#   - server_name: your-domain.com or EC2 IP

# 3. Remove existing link if it exists
sudo rm -f /etc/nginx/sites-enabled/decision-tree

# 4. Create symbolic link
sudo ln -s /etc/nginx/sites-available/decision-tree /etc/nginx/sites-enabled/

# 5. Remove default nginx site (optional)
sudo rm -f /etc/nginx/sites-enabled/default

# 6. Test configuration
sudo nginx -t

# 7. Reload nginx
sudo systemctl reload nginx
# or restart: sudo systemctl restart nginx
```

