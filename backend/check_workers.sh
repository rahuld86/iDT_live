#!/bin/bash

# Script to check Gunicorn worker count

echo "Checking Gunicorn processes..."

# Count master + worker processes
TOTAL=$(ps aux | grep '[g]unicorn.*wsgi:app' | wc -l)

# Count worker processes only (masters don't have --config in the worker process line)
WORKERS=$(ps aux | grep '[g]unicorn.*wsgi:app' | grep -v '--config.*--bind' | wc -l)

# Or more accurately, count processes that are not the master
# Master typically has different command pattern
MASTER_COUNT=$(ps aux | grep '[g]unicorn.*wsgi:app' | grep -c '--config.*--bind' || echo 0)
WORKER_COUNT=$(ps aux | grep '[g]unicorn.*wsgi:app' | grep -v '--config.*--bind' | wc -l)

echo "Total Gunicorn processes: $TOTAL"
echo "Master processes: $MASTER_COUNT"
echo "Worker processes: $WORKER_COUNT"

if [ "$WORKER_COUNT" -eq 1 ]; then
    echo "✓ Correct: Running with 1 worker (2 total processes = 1 master + 1 worker)"
elif [ "$WORKER_COUNT" -gt 1 ]; then
    echo "⚠ Warning: Running with $WORKER_COUNT workers (may cause state issues)"
    echo "  Consider setting WEB_CONCURRENCY=1 in .env"
else
    echo "✗ Error: No workers found"
fi

