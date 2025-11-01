# Production Deployment Guide for EC2

This guide explains how to deploy the Decision Tree application on an EC2 instance.

## Prerequisites

- Ubuntu 20.04+ or Amazon Linux 2 EC2 instance
- Python 3.8+
- Node.js 18+ (for frontend build)
- nginx (recommended as reverse proxy)

## Backend Deployment

### 1. Initial Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Python and required packages
sudo apt install -y python3-pip python3-venv git

# Install nginx (optional, for reverse proxy)
sudo apt install -y nginx
```

### 2. Clone and Setup Application

```bash
# Clone repository or copy files to EC2
cd /opt  # or your preferred directory
sudo mkdir -p decision-tree-app
sudo chown $USER:$USER decision-tree-app
cd decision-tree-app

# Copy backend files to backend/
# Copy frontend files to frontend/

# Make scripts executable
chmod +x backend/deploy.sh
chmod +x backend/start.sh
```

### 3. Deploy Backend

```bash
cd backend
./deploy.sh

# Edit environment variables
nano .env

# Stop any existing processes (if running)
./stop.sh

# Test the deployment
./start.sh
```

### 4. Configure Systemd Service (Recommended)

Create a systemd service file for auto-restart and process management:

```bash
sudo nano /etc/systemd/system/decision-tree-api.service
```

Add the following content:

```ini
[Unit]
Description=Decision Tree API
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/decision-tree-app/backend
Environment="PATH=/opt/decision-tree-app/backend/venv/bin"
ExecStart=/opt/decision-tree-app/backend/venv/bin/gunicorn --config gunicorn_config.py --bind 0.0.0.0:5000 wsgi:app
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable decision-tree-api
sudo systemctl start decision-tree-api
sudo systemctl status decision-tree-api
```

### 5. Configure Nginx Reverse Proxy (Recommended)

Create nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/decision-tree
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Change to your domain or EC2 IP

    # Frontend static files
    location / {
        root /opt/decision-tree-app/frontend/tree-forge-ui/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeouts for large file uploads
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Increase client body size for file uploads
    client_max_body_size 100M;
}
```

Enable the site:

```bash
# Method 1: Use the setup script (recommended)
cd backend
chmod +x setup_nginx.sh
sudo ./setup_nginx.sh

# Then edit the configuration file with your paths:
sudo nano /etc/nginx/sites-available/decision-tree

# Test and reload:
sudo nginx -t
sudo systemctl reload nginx

# Method 2: Manual setup
# If you get "File exists" error, remove it first:
sudo rm /etc/nginx/sites-enabled/decision-tree

# Then create the link:
sudo ln -s /etc/nginx/sites-available/decision-tree /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Frontend Deployment

### 1. Build Frontend

```bash
cd frontend/tree-forge-ui

# Install dependencies
# If you get ENOTEMPTY errors, use the clean install script:
chmod +x clean_install.sh
./clean_install.sh

# Or manually:
# npm install

# If you encounter npm errors:
# rm -rf node_modules package-lock.json
# npm cache clean --force
# npm install

# Build for production
# Set API URL if different from /api
VITE_API_BASE_URL=/api npm run build

# Or if API is on a different domain:
# VITE_API_BASE_URL=http://your-api-domain.com/api npm run build

# If you get "terser not found" error:
# Option 1: Install terser (better compression)
# npm install --save-dev terser

# Option 2: Use esbuild (already configured, faster)
# The vite.config.ts is configured to use esbuild by default
# Just run build without terser:
# VITE_API_BASE_URL=/api npm run build

# Build output will be in dist/
```

### 2. Copy Build to Server

```bash
# If building on EC2, the files are already there
# If building locally, copy dist/ to EC2:
# scp -r dist/ user@ec2-ip:/opt/decision-tree-app/frontend/tree-forge-ui/
```

## Environment Variables

Create `.env` file in the `backend/` directory:

```bash
cd backend
cp env.example .env
nano .env
```

Required variables:

```env
# Flask Configuration
FLASK_ENV=production
FLASK_DEBUG=False
FLASK_PORT=5000

# CORS Configuration
# Set to your frontend domain(s), comma-separated
CORS_ORIGINS=http://your-ec2-ip,https://yourdomain.com

# AWS S3 (optional, for S3 import/export)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1

# Gunicorn Configuration
PORT=5000
WEB_CONCURRENCY=4
LOG_LEVEL=info
```

## Security Considerations

1. **Firewall Configuration:**
   ```bash
   # Allow HTTP/HTTPS
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   
   # Only allow SSH from trusted IPs
   sudo ufw allow from your.trusted.ip to any port 22
   
   sudo ufw enable
   ```

2. **SSL/TLS Certificate (Recommended):**
   - Use Let's Encrypt with certbot for free SSL certificates
   - Update nginx configuration to use HTTPS

3. **AWS Credentials:**
   - Use IAM roles for EC2 instances (preferred)
   - Or store credentials securely using AWS Secrets Manager

4. **File Permissions:**
   ```bash
   # Restrict uploads directory
   chmod 700 backend/uploads
   ```

## Monitoring and Logs

### View Application Logs

```bash
# Systemd service logs
sudo journalctl -u decision-tree-api -f

# Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Health Check

Test the API health endpoint:

```bash
curl http://localhost:5000/api/health
```

## Troubleshooting

### Port Already in Use

If you get an error that port 5000 (or your configured port) is already in use:

```bash
# Method 1: Use the stop script (recommended)
./stop.sh

# Method 2: If stop.sh doesn't work, use aggressive cleanup
chmod +x kill_port.sh
./kill_port.sh 5000

# Method 3: Manual cleanup
# First, stop systemd service
sudo systemctl stop decision-tree-api
sudo systemctl disable decision-tree-api

# Check what's using the port
sudo lsof -i :5000
# or
sudo netstat -tulpn | grep :5000
# or
sudo ss -tulpn | grep :5000

# Kill all processes (replace PID with actual PID from above)
sudo kill -9 <PID>

# Kill all gunicorn processes
ps aux | grep gunicorn | grep -v grep | awk '{print $2}' | xargs sudo kill -9

# Verify port is free
./check_port.sh 5000

# Then start again
./start.sh

# Or restart systemd service
sudo systemctl enable decision-tree-api
sudo systemctl start decision-tree-api
```

**Note:** The systemd service now includes a pre-start check that will automatically clean up the port before starting. If you're using systemd, make sure to update your service file with the latest configuration from `systemd.service.example`.

### Backend won't start
- Check logs: `sudo journalctl -u decision-tree-api -n 50`
- Verify Python environment: `source venv/bin/activate && python --version`
- Verify dependencies: `pip list`
- Check port availability: `sudo netstat -tulpn | grep 5000`
- Make sure virtual environment is activated: `source venv/bin/activate`

### Frontend build errors

#### Terser not found error

If you get `terser not found` during build:

```bash
cd frontend/tree-forge-ui

# Option 1: Install terser (better compression)
npm install --save-dev terser
npm run build

# Option 2: Use esbuild (already configured, faster, no install needed)
# The vite.config.ts is configured to use esbuild by default
VITE_API_BASE_URL=/api npm run build
```

#### Frontend npm install errors

If you get `ENOTEMPTY` or other npm errors:

```bash
cd frontend/tree-forge-ui

# Use the clean install script (recommended)
chmod +x clean_install.sh
./clean_install.sh

# Or manually clean and reinstall
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# If you get permission errors:
sudo chown -R $USER:$USER node_modules
npm install
```

### Frontend not loading
- Check nginx configuration: `sudo nginx -t`
- Verify dist/ directory exists and has correct permissions
- Check browser console for errors
- Verify API_BASE_URL is correct in built files
- Make sure frontend was built: `cd frontend/tree-forge-ui && npm run build`

### Nginx symbolic link errors

If you get "File exists" when creating nginx symbolic link:

```bash
# Remove existing link or file
sudo rm /etc/nginx/sites-enabled/decision-tree

# Create the symbolic link
sudo ln -s /etc/nginx/sites-available/decision-tree /etc/nginx/sites-enabled/

# Or use the setup script
cd backend
chmod +x setup_nginx.sh
sudo ./setup_nginx.sh
```

### CORS errors
- Update CORS_ORIGINS in .env file
- Restart backend service after changing .env

## Performance Tuning

1. **Gunicorn Workers:**
   - Adjust `WEB_CONCURRENCY` based on CPU cores: `(2 * CPU cores) + 1`

2. **Nginx Caching:**
   - Add caching for static files in nginx config

3. **Database (if added):**
   - Use connection pooling
   - Configure appropriate connection limits

## Backup Strategy

1. **Application Files:**
   - Back up uploaded CSV files from `backend/uploads/`
   - Export trees regularly using `/api/exportTree` endpoint

2. **Configuration:**
   - Backup `.env` file (keep secrets secure!)
   - Backup nginx configuration

3. **Automated Backups:**
   - Use AWS S3 lifecycle policies
   - Set up cron jobs for regular exports

