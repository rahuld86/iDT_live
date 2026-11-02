# Gunicorn configuration file for production
import os
import multiprocessing

# Server socket
bind = f"127.0.0.1:{os.getenv('PORT', '5000')}"
backlog = 2048

# Worker processes
# NOTE: Session state is now externalized to Redis (metadata) and the DataFrame
# store (heavy frames), so no request-spanning state lives in worker memory.
# Multiple workers are therefore safe and recommended for concurrency.
# Defaults to 4 workers; override via WEB_CONCURRENCY.
workers = int(os.getenv('WEB_CONCURRENCY', 4))
worker_class = 'sync'
worker_connections = 1000
timeout = int(os.getenv('GUNICORN_TIMEOUT', '300'))
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

