# Quick Fix: Port Already in Use

If you see the error: `Connection in use: ('0.0.0.0', 5000)`

## Solution 1: Use the stop script (Easiest)

```bash
cd backend
chmod +x stop.sh check_port.sh
./stop.sh
./start.sh
```

## Solution 2: Manual stop

### Step 1: Find what's using the port

```bash
# Option A: Using lsof
sudo lsof -i :5000

# Option B: Using netstat
sudo netstat -tulpn | grep :5000

# Option C: Using ss
sudo ss -tulpn | grep :5000
```

### Step 2: Stop the process

If it's a systemd service:
```bash
sudo systemctl stop decision-tree-api
```

If it's a manual process:
```bash
# Find the PID from step 1, then:
sudo kill -9 <PID>
```

### Step 3: Start again

```bash
./start.sh
```

## Solution 3: Use a different port

If you want to keep the existing process running, change the port:

```bash
# Edit .env file
nano .env

# Change PORT to a different value:
PORT=5001

# Save and start
./start.sh
```

