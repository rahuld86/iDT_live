#!/bin/bash

# Production startup script for EC2 deployment

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Load environment variables
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Set default values
export PORT=${PORT:-5000}
export WEB_CONCURRENCY=${WEB_CONCURRENCY:-4}
export LOG_LEVEL=${LOG_LEVEL:-info}

# Start gunicorn
exec gunicorn \
    --config gunicorn_config.py \
    --bind 0.0.0.0:${PORT} \
    wsgi:app

