# Gunicorn Workers Configuration

## Issue: Multi-Worker State Loss

The application uses in-memory state (`tree_state`) to store uploaded data, tree configurations, and intermediate calculations. When running with multiple Gunicorn workers, each worker process has its own memory space, so state is not shared between workers.

### Problem

1. User uploads data → Worker 1 loads data into `tree_state.df`
2. User sets target → Request routed to Worker 2 → Worker 2 has empty `tree_state.df`
3. Error: "No data loaded. Please upload a file first."

### Current Solution: Single Worker

The `gunicorn_config.py` is configured to use **1 worker** by default to ensure state consistency.

```python
# Default to 1 worker to ensure state consistency
workers = int(os.getenv('WEB_CONCURRENCY', 1))
```

### Configuration Options

#### Option 1: Single Worker (Current - Recommended for Development)

Set in `.env`:
```bash
WEB_CONCURRENCY=1
```

**Pros:**
- Simple, no changes needed
- State consistency guaranteed
- Works immediately

**Cons:**
- Limited to single request at a time
- Lower throughput under load

#### Option 2: Sticky Sessions (Production)

Use nginx sticky sessions to route a user's requests to the same worker:

```nginx
upstream backend {
    ip_hash;  # Route by client IP (sticky session)
    server 127.0.0.1:5000;
    server 127.0.0.1:5001;
    # ... more workers
}

server {
    location /api {
        proxy_pass http://backend;
        # ... other proxy settings
    }
}
```

Then run multiple Gunicorn instances on different ports, or use `--preload` with multiple workers.

**Pros:**
- Better throughput
- User's requests always hit same worker

**Cons:**
- Load balancing not optimal
- Still fails if worker restarts

#### Option 3: Shared State (Best for Production)

Move state to external storage:

1. **Redis** (recommended for session/state):
   ```python
   import redis
   r = redis.Redis(host='localhost', port=6379, db=0)
   # Store tree_state in Redis
   ```

2. **Database** (SQLite/PostgreSQL):
   ```python
   # Store state in database with session ID
   # Each request loads state from DB
   ```

3. **File-based state**:
   ```python
   # Save state to files on disk
   # Load state from files on each request
   ```

**Pros:**
- True multi-worker support
- State persists across restarts
- Better scalability

**Cons:**
- Requires additional infrastructure
- More complex implementation

### Quick Fix for Current Issue

If you're experiencing the "No data loaded" error:

1. **Check current workers:**
   ```bash
   ps aux | grep gunicorn
   ```

2. **Set single worker in `.env`:**
   ```bash
   echo "WEB_CONCURRENCY=1" >> ~/project_iDT_2/backend/.env
   ```

3. **Restart backend:**
   ```bash
   cd ~/project_iDT_2/backend
   ./stop.sh
   ./start.sh
   ```

   Or if using systemd:
   ```bash
   sudo systemctl restart decision-tree-api
   ```

### Verification

Check worker count:
```bash
# Check running workers
ps aux | grep gunicorn | grep -v grep | wc -l

# Should show 1 worker (main process + 1 worker = 2 total gunicorn processes)
```

### Performance Considerations

With a single worker:
- **Throughput**: ~10-50 requests/second (depending on request complexity)
- **Concurrent Users**: Limited, but sufficient for most use cases
- **Memory**: Lower memory usage

For production with high load, implement Option 3 (Shared State) with Redis or a database.

### Temporary Workaround

If you need multiple workers temporarily, you can:
1. Upload data
2. Immediately make all related requests (they may hit the same worker)
3. Use sticky sessions (Option 2) for better consistency

But this is not reliable and may still fail.

### Recommended Approach

For a production deployment:
1. **Short term**: Use 1 worker (current configuration)
2. **Long term**: Implement Redis-based state storage for true multi-worker support

