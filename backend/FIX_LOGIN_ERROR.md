# Fix Login 500 Error - Invalid Hash Method

## Error Analysis
The error `ValueError: Invalid hash method '1'` means:
- The password hash in your `.env` file is invalid or incomplete
- The hash doesn't start with `$2b$` (which is the bcrypt method)
- Werkzeug is trying to parse an invalid hash format

## Solution

### Step 1: Generate a Valid Password Hash

On your Ubuntu server, run:

```bash
cd ~/project_iDT_2/backend
source venv/bin/activate

# Generate password hash (replace 'yourpassword' with actual password)
python -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('yourpassword'))"
```

This will output something like:
```
$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYxYwWqKHOi
```

### Step 2: Update .env File

Edit your `.env` file:

```bash
cd ~/project_iDT_2/backend
nano .env
```

Make sure you have:
```
AUTH_USERS=idfcuser:$2b$12$YOUR_COMPLETE_HASH_HERE
```

**IMPORTANT:** 
- The hash MUST start with `$2b$12$`
- The hash MUST be complete (typically 60 characters)
- NO spaces in the hash
- The format is: `username:COMPLETE_HASH`

### Step 3: Example .env Entry

```
AUTH_USERS=idfcuser:$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYxYwWqKHOi
```

### Step 4: Restart Backend

```bash
sudo systemctl restart decision-tree-api
```

### Step 5: Verify Setup

Check the logs to see if user was loaded:
```bash
sudo journalctl -u decision-tree-api -n 20 --no-pager | grep -i "loaded user"
```

## Common Mistakes

❌ **WRONG:** `AUTH_USERS=idfcuser:placeholder_hash_here`
❌ **WRONG:** `AUTH_USERS=idfcuser:$12$incomplete_hash`
❌ **WRONG:** `AUTH_USERS=idfcuser:$2b$12$hash_with_spaces`

✅ **CORRECT:** `AUTH_USERS=idfcuser:$2b$12$complete_60_char_hash`

## Quick Fix Script

Run this to set up the password correctly:

```bash
cd ~/project_iDT_2/backend
source venv/bin/activate

# Generate hash
HASH=$(python -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('yourpassword'))")
echo "Generated hash: $HASH"

# Update .env
sed -i "s|^AUTH_USERS=.*|AUTH_USERS=idfcuser:$HASH|" .env

# Restart service
sudo systemctl restart decision-tree-api

# Check it worked
sudo journalctl -u decision-tree-api -n 10 --no-pager | grep "Loaded user"
```

