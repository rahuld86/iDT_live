# Fix: Port 5000 Still in Use After Stop Script

If `./stop.sh` doesn't work and you still see "Connection in use", try these steps:

## Quick Fix (Most Common)

```bash
cd ~/project_iDT_2/backend

# Method 1: Aggressive cleanup
chmod +x kill_port.sh
./kill_port.sh 5000

# Method 2: Stop systemd service first
sudo systemctl stop decision-tree-api
sudo systemctl disable decision-tree-api
./kill_port.sh 5000

# Method 3: Manual kill
# Find the PID
sudo lsof -i :5000
# Kill it (replace <PID> with actual number)
sudo kill -9 <PID>

# Kill all gunicorn processes
ps aux | grep gunicorn | grep -v grep | awk '{print $2}' | xargs sudo kill -9
```

## If Using Systemd Service

The systemd service might be automatically restarting the process. Update your service file:

```bash
# Stop and disable the service
sudo systemctl stop decision-tree-api
sudo systemctl disable decision-tree-api

# Clean up port
./kill_port.sh 5000

# Update the service file with new configuration
sudo cp systemd.service.example /etc/systemd/system/decision-tree-api.service

# Edit the file to set correct paths
sudo nano /etc/systemd/system/decision-tree-api.service
# Update paths: /opt/decision-tree-app/backend -> ~/project_iDT_2/backend

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl enable decision-tree-api
sudo systemctl start decision-tree-api
```

## Verify Port is Free

```bash
# Check if port is free
./check_port.sh 5000

# Or manually
sudo lsof -i :5000
sudo netstat -tulpn | grep :5000
```

## Use a Different Port (Alternative)

If nothing works, use a different port:

```bash
# Edit .env
nano .env
# Change: PORT=5001

# Update systemd service if using it
sudo nano /etc/systemd/system/decision-tree-api.service
# Change port in ExecStart line

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart decision-tree-api
```

