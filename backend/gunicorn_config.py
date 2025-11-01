# Gunicorn configuration file for production
import os
import multiprocessing

# Server socket
bind = f"0.0.0.0:{os.getenv('PORT', '5000')}"
backlog = 2048

# Worker processes
# NOTE: This app uses in-memory state (tree_state) which is not shared across workers.
# Using multiple workers causes state to be lost between requests.
# For production, use sticky sessions or implement shared state (Redis/database).
# Setting to 1 worker to ensure state consistency.
workers = int(os.getenv('WEB_CONCURRENCY', 1))
worker_class = 'sync'
worker_connections = 1000
timeout = 30
keepalive = 2

# Logging
accesslog = os.getenv('ACCESS_LOG', '-')  # '-' means stdout
errorlog = os.getenv('ERROR_LOG', '-')  # '-' means stderr
loglevel = os.getenv('LOG_LEVEL', 'info').lower()
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = 'decision-tree-api'

# Server mechanics
daemon = False
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None

# SSL (if needed, uncomment and configure)
# keyfile = '/path/to/keyfile'
# certfile = '/path/to/certfile'

