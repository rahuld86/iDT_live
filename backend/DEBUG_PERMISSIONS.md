# Debugging Nginx Permission Denied Errors

If you've fixed permissions (755) but still get permission denied errors, check these:

## Fundamental Issues to Check

### 1. Home Directory Permissions

The `/home/ubuntu` directory is often 700 by default (only owner can access).

**Check:**
```bash
ls -ld /home/ubuntu
# Should show: drwxr-xr-x (755)
# If shows: drwx------ (700), that's the problem!
```

**Fix:**
```bash
# Fix home directory permissions
sudo chmod 755 /home/ubuntu

# Verify nginx can access
sudo -u www-data test -x /home/ubuntu
```

### 2. /home Directory Permissions

Check if `/home` itself is accessible:

```bash
ls -ld /home
sudo -u www-data test -x /home
```

**Fix:**
```bash
sudo chmod 755 /home
```

### 3. Full Path Traversal Test

Test if nginx can traverse the ENTIRE path:

```bash
# Test each directory in the path
sudo -u www-data test -x /home && echo "✓ /home" || echo "✗ /home"
sudo -u www-data test -x /home/ubuntu && echo "✓ /home/ubuntu" || echo "✗ /home/ubuntu"
sudo -u www-data test -x /home/ubuntu/project_iDT_2 && echo "✓ project_iDT_2" || echo "✗ project_iDT_2"
sudo -u www-data test -x /home/ubuntu/project_iDT_2/frontend && echo "✓ frontend" || echo "✗ frontend"
sudo -u www-data test -x /home/ubuntu/project_iDT_2/frontend/tree-forge-ui && echo "✓ tree-forge-ui" || echo "✗ tree-forge-ui"
sudo -u www-data test -r /home/ubuntu/project_iDT_2/frontend/tree-forge-ui/dist/index.html && echo "✓ index.html" || echo "✗ index.html"
```

### 4. Check Nginx User

Verify what user nginx is running as:

```bash
ps aux | grep nginx
# Or
cat /etc/nginx/nginx.conf | grep user
```

### 5. Alternative: Move to Standard Location

If home directory permissions are problematic, move files to standard location:

```bash
# Move to standard web directory
sudo mkdir -p /var/www/decision-tree
sudo cp -r ~/project_iDT_2/frontend/tree-forge-ui/dist/* /var/www/decision-tree/
sudo chown -R www-data:www-data /var/www/decision-tree

# Update nginx config
sudo nano /etc/nginx/sites-available/decision-tree
# Change: root /var/www/decision-tree;

# Reload nginx
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Check SELinux/AppArmor

If using SELinux or AppArmor:

```bash
# Check SELinux
getenforce 2>/dev/null || echo "SELinux not installed"

# Check AppArmor
aa-status 2>/dev/null | grep nginx || echo "AppArmor not blocking nginx"
```

### 7. Comprehensive Fix Script

Run the updated fix_permissions.sh script:

```bash
cd ~/project_iDT_2/backend
chmod +x fix_permissions.sh
sudo ./fix_permissions.sh
```

This will check and fix ALL parent directories.

## Most Likely Fix

If `/home/ubuntu` is 700:

```bash
# Fix home directory
sudo chmod 755 /home/ubuntu

# Verify
sudo -u www-data test -x /home/ubuntu && echo "SUCCESS" || echo "STILL FAILING"

# Reload nginx
sudo systemctl reload nginx

# Test
curl http://localhost
```

