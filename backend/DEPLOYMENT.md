# Backend deployment

Use [the root deployment guide](../DEPLOYMENT.md) as the canonical, sequential
runbook. It includes Ubuntu 26.04 / Python 3.14 recovery, Python 3.12 setup, Redis,
authentication, CORS, IAM-role S3 access, systemd, nginx, health checks and updates.

From backend/:

```bash
./deploy.sh
./setup_user_password.sh idfcuser
nano .env
./start.sh
```

start.sh stays in the foreground; check health from a second SSH session and stop
the manual run with Ctrl+C before installing the systemd service template.

```bash
sudo cp systemd.service.example /etc/systemd/system/decision-tree-api.service
sudo systemd-analyze verify /etc/systemd/system/decision-tree-api.service
sudo systemctl daemon-reload
sudo systemctl enable decision-tree-api
sudo systemctl restart decision-tree-api
sudo systemctl status decision-tree-api --no-pager -l
```

Do not use the old service with stop.sh pre-start hooks, port-killing commands,
EnvironmentFile=.env, or Bash defaults in ExecStart. The template starts start.sh,
which loads .env and runs the project interpreter.

For credentials: [TROUBLESHOOT_LOGIN.md](TROUBLESHOOT_LOGIN.md).
For S3: [S3_SETUP.md](S3_SETUP.md).
