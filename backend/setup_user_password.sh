#!/bin/bash

# Script to generate password hash and update .env file
# Usage: ./setup_user_password.sh username password

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <username> <password>"
    echo "Example: $0 idfcuser mypassword123"
    exit 1
fi

USERNAME=$1
PASSWORD=$2

# Navigate to backend directory
cd "$(dirname "$0")" || exit

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "Error: Virtual environment not found. Please run ./deploy.sh first."
    exit 1
fi

# Generate password hash
echo "Generating password hash..."
HASH=$(python3 -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('$PASSWORD'))")

if [ -z "$HASH" ]; then
    echo "Error: Failed to generate password hash"
    exit 1
fi

echo "Generated hash: $HASH"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    if [ -f "env.example" ]; then
        echo "Creating .env from env.example..."
        cp env.example .env
    else
        echo "Error: .env file not found and env.example not available"
        exit 1
    fi
fi

# Update or add AUTH_USERS to .env
if grep -q "^AUTH_USERS=" .env; then
    # Update existing AUTH_USERS
    echo "Updating AUTH_USERS in .env..."
    
    # Remove old entry for this username if it exists
    CURRENT_AUTH=$(grep "^AUTH_USERS=" .env | cut -d'=' -f2-)
    NEW_AUTH="$USERNAME:$HASH"
    
    # If there are other users, keep them
    if [ -n "$CURRENT_AUTH" ]; then
        # Check if username already exists
        if echo "$CURRENT_AUTH" | grep -q "$USERNAME:"; then
            # Replace existing entry
            UPDATED_AUTH=$(echo "$CURRENT_AUTH" | sed "s/$USERNAME:[^[:space:]]*[^[:space:]]*/$NEW_AUTH/")
        else
            # Append new entry
            UPDATED_AUTH="$CURRENT_AUTH $NEW_AUTH"
        fi
    else
        UPDATED_AUTH="$NEW_AUTH"
    fi
    
    sed -i "s|^AUTH_USERS=.*|AUTH_USERS=$UPDATED_AUTH|" .env
else
    # Add new AUTH_USERS
    echo "Adding AUTH_USERS to .env..."
    echo "AUTH_USERS=$USERNAME:$HASH" >> .env
fi

echo ""
echo "✅ Password hash generated and saved to .env"
echo ""
echo "User: $USERNAME"
echo "Hash: $HASH"
echo ""
echo "⚠️  IMPORTANT: Restart the backend service for changes to take effect:"
echo "   sudo systemctl restart decision-tree-api"
echo ""
echo "Or if running manually:"
echo "   ./stop.sh"
echo "   ./start.sh"

