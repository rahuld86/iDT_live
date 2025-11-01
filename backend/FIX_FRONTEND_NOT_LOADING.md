# Fix: Frontend Not Loading on EC2

If you can't access the React app via EC2 public IP, check the following:

## Quick Diagnostic

Run the verification scripts:

```bash
cd ~/project_iDT_2/backend

# Fix nginx 500 error (most comprehensive)
chmod +x fix_nginx_500.sh
./fix_nginx_500.sh

# Full verification
chmod +x verify_deployment.sh
./verify_deployment.sh

# Quick frontend check
chmod +x check_frontend.sh
./check_frontend.sh
```

## Nginx 500 Error

If you're getting a 500 error:

**Step 1: Check error logs**
```bash
sudo tail -20 /var/log/nginx/error.log
```

**Common causes and fixes:**

### 1. Wrong Root Path in Nginx Config

**Check:**
```bash
# Check what root path is in config
sudo cat /etc/nginx/sites-available/decision-tree | grep root

# Check if that path exists
ls -la /path/from/nginx/config
```

**Fix:**
```bash
# Edit nginx config
sudo nano /etc/nginx/sites-available/decision-tree

# Update root line to match your installation:
root /home/ubuntu/project_iDT_2/frontend/tree-forge-ui/dist;

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 2. Permission Issues (Most Common - "Permission denied")

**Error:** `stat() "/home/ubuntu/project_iDT_2/frontend/tree-forge-ui/dist/index.html" failed (13: Permission denied)`

**Quick Fix Script:**
```bash
cd ~/project_iDT_2/backend
chmod +x fix_permissions.sh
sudo ./fix_permissions.sh
```

**Manual Fix:**
```bash
# Fix permissions on dist directory
sudo chmod -R 755 ~/project_iDT_2/frontend/tree-forge-ui/dist

# Fix permissions on parent directories (nginx needs execute to traverse)
sudo chmod +x ~/project_iDT_2
sudo chmod +x ~/project_iDT_2/frontend
sudo chmod +x ~/project_iDT_2/frontend/tree-forge-ui

# Verify nginx can read
sudo -u www-data test -r ~/project_iDT_2/frontend/tree-forge-ui/dist

# If still fails, change ownership:
sudo chown -R www-data:www-data ~/project_iDT_2/frontend/tree-forge-ui/dist
```

**Important:** Nginx user (www-data) needs:
- Read permission (`r`) on all files
- Execute permission (`x`) on all directories (to traverse the path)

### 3. Frontend Not Built

**Check:**
```bash
ls -la ~/project_iDT_2/frontend/tree-forge-ui/dist/index.html
```

**Fix:**
```bash
cd ~/project_iDT_2/frontend/tree-forge-ui
VITE_API_BASE_URL=/api npm run build
```

### 4. Quick Fix Script

Run the automated fix script:
```bash
cd ~/project_iDT_2/backend
chmod +x fix_nginx_500.sh
./fix_nginx_500.sh
```

## Common Issues and Fixes

### 1. Frontend Not Built

**Check:**
```bash
ls -la ~/project_iDT_2/frontend/tree-forge-ui/dist
```

**Fix if missing:**
```bash
cd ~/project_iDT_2/frontend/tree-forge-ui
VITE_API_BASE_URL=/api npm run build
```

### 2. Nginx Not Configured

**Check:**
```bash
# Check if nginx is running
sudo systemctl status nginx

# Check if configuration exists
ls -la /etc/nginx/sites-available/decision-tree
ls -la /etc/nginx/sites-enabled/decision-tree
```

**Fix if missing:**
```bash
cd ~/project_iDT_2/backend
chmod +x setup_nginx.sh
sudo ./setup_nginx.sh

# Then edit the configuration with your paths:
sudo nano /etc/nginx/sites-available/decision-tree
```

**Important:** Update the `root` path in nginx config:
```nginx
root /home/ubuntu/project_iDT_2/frontend/tree-forge-ui/dist;
```

### 3. Nginx Configuration Has Wrong Paths

**Check nginx config:**
```bash
sudo cat /etc/nginx/sites-available/decision-tree | grep root
```

**Should show:**
```nginx
root /home/ubuntu/project_iDT_2/frontend/tree-forge-ui/dist;
```

**If different, edit it:**
```bash
sudo nano /etc/nginx/sites-available/decision-tree
# Update the root path to: /home/ubuntu/project_iDT_2/frontend/tree-forge-ui/dist
```

**Test and reload:**
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Nginx Not Running

**Check:**
```bash
sudo systemctl status nginx
```

**Fix:**
```bash
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 5. Port 80 Not Open (EC2 Security Group)

**Check EC2 Security Group:**
- Go to AWS Console → EC2 → Security Groups
- Select your instance's security group
- Check Inbound Rules
- Must allow HTTP (port 80) from 0.0.0.0/0 or your IP

**Or check firewall locally:**
```bash
sudo ufw status
# If port 80 is not open:
sudo ufw allow 80/tcp
```

### 6. Backend Not Running

**Check:**
```bash
sudo systemctl status decision-tree-api
curl http://localhost:5000/api/health
```

**Fix:**
```bash
cd ~/project_iDT_2/backend
./start.sh
# Or with systemd:
sudo systemctl start decision-tree-api
```

### 7. Nginx Configuration Test Fails

**Check:**
```bash
sudo nginx -t
```

**Common errors:**
- Wrong paths → Update `root` path in config
- Syntax errors → Check nginx config file
- Permission errors → Check file permissions

### 8. Complete Setup Checklist

```bash
# 1. Build frontend
cd ~/project_iDT_2/frontend/tree-forge-ui
VITE_API_BASE_URL=/api npm run build

# 2. Verify build
ls -la dist/index.html

# 3. Setup nginx
cd ~/project_iDT_2/backend
chmod +x setup_nginx.sh verify_deployment.sh
sudo ./setup_nginx.sh

# 4. Edit nginx config with correct paths
sudo nano /etc/nginx/sites-available/decision-tree
# Update: root /home/ubuntu/project_iDT_2/frontend/tree-forge-ui/dist;

# 5. Test nginx config
sudo nginx -t

# 6. Enable and start nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# 7. Verify
./verify_deployment.sh
```

## Test Access

```bash
# Test locally
curl http://localhost

# Test API
curl http://localhost/api/health

# Test from outside (replace with your EC2 public IP)
curl http://YOUR_EC2_PUBLIC_IP
```

## Debugging

```bash
# Check nginx error logs
sudo tail -f /var/log/nginx/error.log

# Check nginx access logs
sudo tail -f /var/log/nginx/access.log

# Check what nginx is serving
sudo cat /etc/nginx/sites-enabled/decision-tree

# Check if port 80 is listening
sudo netstat -tuln | grep :80
sudo ss -tuln | grep :80
```

