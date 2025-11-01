# Troubleshooting Login Issues

## Common Issues

### 1. "Invalid username or password" (401 Error)

#### Check if user is loaded
```bash
sudo journalctl -u decision-tree-api -n 50 --no-pager | grep -i "loaded user"
```

You should see: `Loaded user: idfcuser`

If not, check:
- `.env` file format
- Hash format is valid
- No extra spaces or newlines

#### Verify .env file format
```bash
cd ~/project_iDT_2/backend
cat .env | grep AUTH_USERS
```

Should be exactly:
```
AUTH_USERS=idfcuser:scrypt:32768:8:1$salt$hash...
```

**No spaces, no quotes, on one line.**

#### Test password verification directly
```bash
cd ~/project_iDT_2/backend
source venv/bin/activate

python3 << EOF
import os
from dotenv import load_dotenv
load_dotenv()
from auth import verify_user

# Test with your actual password
result = verify_user('idfcuser', 'analytics@1234')
print(f"Verification result: {result}")
EOF
```

This should print: `Verification result: True`

### 2. "Invalid hash method" (500 Error)

This means the hash format is invalid. 

**Solution:** Generate a new hash:
```bash
cd ~/project_iDT_2/backend
source venv/bin/activate

python -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('analytics@1234'))"
```

Copy the complete hash and update `.env`:
```bash
nano .env
# Update AUTH_USERS line with the new hash
```

Then restart:
```bash
sudo systemctl restart decision-tree-api
```

### 3. Environment Variables Not Loading

If changes to `.env` aren't being picked up:

1. **Restart the service:**
```bash
sudo systemctl restart decision-tree-api
```

2. **Check service status:**
```bash
sudo systemctl status decision-tree-api
```

3. **Verify .env is in the right location:**
```bash
ls -la ~/project_iDT_2/backend/.env
```

Should show the file exists.

### 4. Check Backend Logs for Errors

```bash
sudo journalctl -u decision-tree-api -n 100 --no-pager
```

Look for:
- `Loaded user: idfcuser` (success)
- `Warning: Invalid hash format` (hash problem)
- `Warning: No valid users loaded` (.env problem)
- `Error verifying password hash` (verification problem)

### 5. Test Login via curl

```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"idfcuser","password":"analytics@1234"}'
```

Should return:
```json
{
  "access_token": "...",
  "username": "idfcuser",
  "message": "Login successful"
}
```

If you get an error, check the response body for details.

## Debugging Steps

1. **Verify hash was generated correctly:**
```bash
cd ~/project_iDT_2/backend
source venv/bin/activate
python -c "from werkzeug.security import generate_password_hash, check_password_hash; h=generate_password_hash('analytics@1234'); print(f'Hash: {h}'); print(f'Test: {check_password_hash(h, \"analytics@1234\")}')"
```

Should print `Test: True`

2. **Verify .env is being loaded:**
```bash
cd ~/project_iDT_2/backend
source venv/bin/activate
python3 << EOF
import os
from dotenv import load_dotenv
load_dotenv()
auth_users = os.getenv('AUTH_USERS', '')
print(f"AUTH_USERS length: {len(auth_users)}")
print(f"AUTH_USERS preview: {auth_users[:80]}...")
EOF
```

3. **Check if user is in the loaded users dict:**
```bash
cd ~/project_iDT_2/backend
source venv/bin/activate
python3 << EOF
from auth import load_users
users = load_users()
print(f"Users loaded: {list(users.keys())}")
if 'idfcuser' in users:
    hash_val = users['idfcuser']
    print(f"Hash starts with: {hash_val[:20]}...")
    print(f"Hash length: {len(hash_val)}")
else:
    print("ERROR: idfcuser not found in loaded users!")
EOF
```

## Valid Hash Formats

Werkzeug supports multiple hash formats:

1. **bcrypt:** `$2b$12$salt_hash...` (60 chars)
2. **scrypt:** `scrypt:32768:8:1$salt$hash...` (longer)
3. **pbkdf2:** `pbkdf2:sha256:260000$salt$hash...` (longer)

All are valid. The code now supports all three formats.
