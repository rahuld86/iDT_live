"""Authentication utilities for user verification from .env file"""
import os
from werkzeug.security import check_password_hash

def load_users():
    """Load users from AUTH_USERS environment variable
    
    Format: username:hashed_password (one per line or space-separated)
    Example: admin:$2b$12$hash1\nuser2:$2b$12$hash2
    """
    auth_users = os.getenv('AUTH_USERS', '')
    if not auth_users:
        return {}
    
    users = {}
    # Handle both newline and space separators
    lines = auth_users.replace('\\n', '\n').split('\n')
    
    for line in lines:
        if not line.strip():
            continue
        
        # Handle space-separated entries
        for entry in line.split(' '):
            if ':' in entry:
                parts = entry.split(':', 1)
                if len(parts) == 2:
                    username, password_hash = parts
                    users[username.strip()] = password_hash.strip()
    
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
    return check_password_hash(stored_hash, password)

def generate_password_hash(password):
    """Generate password hash for setup purposes
    
    This is a helper function for creating password hashes.
    Use this when setting up new users.
    """
    from werkzeug.security import generate_password_hash
    return generate_password_hash(password)

