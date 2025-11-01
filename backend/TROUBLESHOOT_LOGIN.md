# Troubleshooting Login 500 Error

## Common Causes and Fixes

### 1. Check Backend Logs
```bash
# If using systemd
sudo journalctl -u decision-tree-api -n 50 --no-pager

# Or check gunicorn logs directly
tail -50 /var/log/gunicorn/error.log

# Or if running manually, check terminal output
```

### 2. Missing JWT_SECRET_KEY in .env
**Error:** "JWT_SECRET_KEY not configured" or similar

**Fix:**
```bash
cd ~/project_iDT_2/backend
source venv/bin/activate

# Generate a secure key
JWT_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
echo "JWT_SECRET_KEY=$JWT_KEY" >> .env

# Or manually add to .env:
nano .env
# Add: JWT_SECRET_KEY=your-generated-secret-key-here
```

### 3. Missing Flask-JWT-Extended Package
**Error:** "No module named 'flask_jwt_extended'" or ImportError

**Fix:**
```bash
cd ~/project_iDT_2/backend
source venv/bin/activate
pip install Flask-JWT-Extended==4.6.0
pip install werkzeug==3.0.3
```

### 4. AUTH_USERS Not Set or Invalid Format
**Error:** User verification fails or empty users dict

**Fix:**
```bash
cd ~/project_iDT_2/backend
source venv/bin/activate

# Generate password hash for idfcuser
python -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('yourpassword'))"

# Update .env file
nano .env
# Add or update:
# AUTH_USERS=idfcuser:$2b$12$generated_hash_here
```

### 5. .env File Not Loaded
**Error:** Environment variables not found

**Fix:**
```bash
cd ~/project_iDT_2/backend

# Check if .env exists
ls -la .env

# If not, create from example
cp env.example .env

# Then edit it:
nano .env
```

### 6. Check Backend Service Status
```bash
# Check if backend is running
sudo systemctl status decision-tree-api

# Restart if needed
sudo systemctl restart decision-tree-api

# Check logs
sudo journalctl -u decision-tree-api -f
```

### 7. Verify Dependencies Installed
```bash
cd ~/project_iDT_2/backend
source venv/bin/activate
pip list | grep -i jwt
pip list | grep -i werkzeug

# Should show:
# Flask-JWT-Extended 4.6.0
# werkzeug 3.0.3
```

### 8. Test Login Endpoint Manually
```bash
# Test if backend is responding
curl http://localhost:5000/api/test

# Test login endpoint
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"idfcuser","password":"yourpassword"}'
```

### 9. Check Python Import Errors
```bash
cd ~/project_iDT_2/backend
source venv/bin/activate
python -c "from flask_jwt_extended import create_access_token; print('JWT import OK')"
python -c "from auth import verify_user; print('Auth import OK')"
```

## Quick Fix Checklist

1. ✅ JWT_SECRET_KEY set in .env
2. ✅ AUTH_USERS set in .env with valid hash
3. ✅ Flask-JWT-Extended installed
4. ✅ werkzeug installed
5. ✅ Backend service restarted after .env changes
6. ✅ Backend logs show specific error

## Most Common Issue

**Missing JWT_SECRET_KEY in .env file**

Solution:
```bash
cd ~/project_iDT_2/backend
source venv/bin/activate
python -c "import secrets; print('JWT_SECRET_KEY=' + secrets.token_urlsafe(32))"
```

Copy the output and add it to your `.env` file, then restart the backend.

