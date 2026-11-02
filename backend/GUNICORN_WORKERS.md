# Gunicorn workers and memory

Session metadata is stored in Redis and datasets are persisted as Parquet on disk.
WEB_CONCURRENCY defaults to 4; user state is no longer held solely in one worker.
Each username addresses one workspace.

DF_CACHE_MAX_BYTES is a per-worker DataFrame cache budget. Four workers with a
2 GiB budget can use up to 8 GiB in caches, plus training data, Python, Redis and
OS overhead. Choose workers/cache budgets from measured RAM use and latency.
External storage does not eliminate all concurrent-update or cache-coherence
concerns; exercise repeated uploads and simultaneous requests in workload testing.

GUNICORN_TIMEOUT defaults to 300 seconds in start.sh and gunicorn_config.py.
Synchronous requests exceeding it may lose their worker. Match nginx proxy
timeouts to the chosen request timeout.

Use the systemd service to keep the application running after SSH closes.
A manual start.sh occupies the terminal normally. Do not run manual and systemd
instances on the same port. See [DEPLOYMENT.md](../DEPLOYMENT.md).
