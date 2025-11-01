"""Authentication utilities for user verification from .env file"""
import os
from werkzeug.security import check_password_hash

def load_users():
    """Load users from AUTH_USERS environment variable
    
    Format: username:hashed_password
    For multiple users, separate with space: username1:hash1 username2:hash2
    Example: idfcuser:$2b$12$abcdefghijklmnopqrstuvwxyz1234567890
    """
    auth_users = os.getenv('AUTH_USERS', '')
    if not auth_users:
        print("Warning: AUTH_USERS environment variable not set")
        return {}
    
    users = {}
    
    # Split by newlines first (if any)
    lines = auth_users.replace('\\n', '\n').split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Split by space to handle multiple users on one line
        # But be careful - hashes don't contain spaces, so we can safely split
        entries = line.split(' ')
        
        for entry in entries:
            entry = entry.strip()
            if not entry:
                continue
            
            # Split on first ':' only - hashes contain '$' but not ':'
            if ':' in entry:
                parts = entry.split(':', 1)  # Split on first ':' only
                if len(parts) == 2:
                    username = parts[0].strip()
                    password_hash = parts[1].strip()
                    
                    # Validate hash format
                    # Werkzeug supports multiple formats:
                    # - bcrypt: $2b$12$salt_hash or $2a$12$salt_hash
                    # - scrypt: scrypt:32768:8:1$salt$hash
                    # - pbkdf2: pbkdf2:sha256:260000$salt$hash
                    
                    is_valid_hash = False
                    
                    # Check for bcrypt format ($2b$ or $2a$)
                    if password_hash.startswith('$2b$') or password_hash.startswith('$2a$'):
                        if password_hash.count('$') >= 3:
                            is_valid_hash = True
                    
                    # Check for scrypt format (scrypt:...)
                    elif password_hash.startswith('scrypt:'):
                        if ':' in password_hash[7:] and '$' in password_hash:
                            is_valid_hash = True
                    
                    # Check for pbkdf2 format (pbkdf2:...)
                    elif password_hash.startswith('pbkdf2:'):
                        if ':' in password_hash[7:] and '$' in password_hash:
                            is_valid_hash = True
                    
                    if is_valid_hash:
                        users[username] = password_hash
                        print(f"Loaded user: {username}")
                    else:
                        print(f"Warning: Invalid hash format for user '{username}'.")
                        print(f"  Expected formats: $2b$12$..., scrypt:..., or pbkdf2:...")
                        print(f"  Got: {password_hash[:60]}...")
                else:
                    print(f"Warning: Invalid entry format: {entry}")
            else:
                print(f"Warning: Entry missing ':' separator: {entry}")
    
    if not users:
        print("Warning: No valid users loaded from AUTH_USERS")
        print(f"AUTH_USERS value: {auth_users[:50]}...")
    
    return users

def verify_user(username, password):
    """Verify username and password against stored hashes
    
    Args:
        username: Username to verify
        password: Plain text password to verify
        
    Returns:
        True if credentials are valid, False otherwise
    """
    users = load_users()
    
    if username not in users:
        return False
    
    stored_hash = users[username]
    
    # Validate hash format before checking
    if not stored_hash or not stored_hash.startswith('$'):
        print(f"Warning: Invalid hash format for user {username}")
        return False
    
    try:
        return check_password_hash(stored_hash, password)
    except (ValueError, TypeError) as e:
        print(f"Error verifying password hash for {username}: {str(e)}")
        print(f"Hash value: {stored_hash[:20]}...")  # Show first 20 chars for debugging
        return False

def generate_password_hash(password):
    """Generate password hash for setup purposes
    
    This is a helper function for creating password hashes.
    Use this when setting up new users.
    """
    from werkzeug.security import generate_password_hash
    return generate_password_hash(password)

