# Quick Fix: Nginx 500 Internal Server Error

## Step 1: Check Error Logs (MOST IMPORTANT)

```bash
sudo tail -20 /var/log/nginx/error.log
```

This will show the **exact error**. Common errors:

### Error: "No such file or directory" or "Failed to open"
**Cause:** Wrong root path in nginx config
**Fix:**
```bash
# Check your nginx config root path
sudo cat /etc/nginx/sites-available/decision-tree | grep root

# Should show:
# root /home/ubuntu/project_iDT_2/frontend/tree-forge-ui/dist;

# If different, edit:
sudo nano /etc/nginx/sites-available/decision-tree
# Update root to: root /home/ubuntu/project_iDT_2/frontend/tree-forge-ui/dist;

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### Error: "Permission denied" (13)
**Cause:** Nginx user (www-data) can't read the files or traverse directories
**Quick Fix:**
```bash
cd ~/project_iDT_2/backend
chmod +x fix_permissions.sh
sudo ./fix_permissions.sh
```

**Manual Fix:**
```bash
# Fix permissions on dist directory
sudo chmod -R 755 ~/project_iDT_2/frontend/tree-forge-ui/dist

# Fix permissions on parent directories (CRITICAL - nginx needs execute to traverse)
sudo chmod +x ~/project_iDT_2
sudo chmod +x ~/project_iDT_2/frontend
sudo chmod +x ~/project_iDT_2/frontend/tree-forge-ui

# Verify nginx can read
sudo -u www-data test -r ~/project_iDT_2/frontend/tree-forge-ui/dist/index.html

# If still fails, change ownership:
sudo chown -R www-data:www-data ~/project_iDT_2/frontend/tree-forge-ui/dist

# Reload nginx
sudo systemctl reload nginx
```

### Error: "index.html not found"
**Cause:** Frontend not built
**Fix:**
```bash
cd ~/project_iDT_2/frontend/tree-forge-ui
VITE_API_BASE_URL=/api npm run build

# Verify it exists
ls -la dist/index.html
```

## Step 2: Run Diagnostic Script

```bash
cd ~/project_iDT_2/backend
chmod +x fix_nginx_500.sh
./fix_nginx_500.sh
```

## Step 3: Quick Fix Checklist

```bash
# 1. Check error logs (shows exact issue)
sudo tail -20 /var/log/nginx/error.log

# 2. Verify frontend is built
ls -la ~/project_iDT_2/frontend/tree-forge-ui/dist/index.html

# 3. Check nginx root path
sudo cat /etc/nginx/sites-available/decision-tree | grep root

# 4. Fix permissions (most common fix)
sudo chmod -R 755 ~/project_iDT_2/frontend/tree-forge-ui/dist

# 5. Test nginx config
sudo nginx -t

# 6. Reload nginx
sudo systemctl reload nginx

# 7. Test again
curl http://localhost
```

