# Deployment quick diagnosis

See [the deployment guide](../DEPLOYMENT.md) for the current fixes.

```bash
sudo systemctl status decision-tree-api --no-pager -l
curl -i http://127.0.0.1:5000/api/health
curl -i http://127.0.0.1/api/health
redis-cli ping
```

- Foreground Listening / Booting worker messages are normal.
- activating (auto-restart) means failure; inspect journalctl locally.
- Port conflicts: [FIX_PORT_ISSUE.md](FIX_PORT_ISSUE.md).
- Login failures: [TROUBLESHOOT_LOGIN.md](TROUBLESHOOT_LOGIN.md).
- S3 permissions: [S3_SETUP.md](S3_SETUP.md).

Do not disable the service or broadly kill Gunicorn processes as a routine fix.
