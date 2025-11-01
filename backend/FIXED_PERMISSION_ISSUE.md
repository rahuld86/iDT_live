# Fixed: Nginx Permission Denied - Home Directory Issue

## Issue
Nginx 500 error with "Permission denied (13)" even after setting permissions to 755 on the dist directory.

## Root Cause
The `/home/ubuntu` directory was set to **700** (drwx------) by default, which means:
- Only the owner (ubuntu) can access it
- Nginx user (www-data) **cannot traverse** into the home directory
- Even if all subdirectories are 755, nginx can't reach them

## Solution

```bash
# Fix home directory permissions
sudo chmod 755 /home/ubuntu

# Verify nginx can traverse
sudo -u www-data test -x /home/ubuntu && echo "SUCCESS" || echo "FAILED"

# Reload nginx
sudo systemctl reload nginx
```

## Important Notes

### Why This Happens
- Ubuntu creates home directories with 700 permissions by default (security best practice)
- Nginx runs as `www-data` user, which is different from `ubuntu` user
- Nginx needs **execute permission (x)** on all parent directories to traverse the path

### Required Permissions for Path Traversal
For nginx to access `/home/ubuntu/project_iDT_2/frontend/tree-forge-ui/dist`, all directories in the path need execute permission:

```
/                    (should be readable by all)
/home                (should be 755)
/home/ubuntu         (MUST be 755, not 700!)
/home/ubuntu/project_iDT_2    (should be 755)
/home/ubuntu/project_iDT_2/frontend  (should be 755)
/home/ubuntu/project_iDT_2/frontend/tree-forge-ui  (should be 755)
/home/ubuntu/project_iDT_2/frontend/tree-forge-ui/dist  (should be 755)
```

### Alternative Solution (Production)
If you don't want to change home directory permissions, move files to a standard web directory:

```bash
# Move to standard location
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

## Prevention
When deploying to EC2:
1. Check `/home/ubuntu` permissions: `ls -ld /home/ubuntu`
2. If 700, change to 755: `sudo chmod 755 /home/ubuntu`
3. Or use standard web directory: `/var/www` or `/opt`

The `fix_permissions.sh` script now checks and fixes this automatically.

