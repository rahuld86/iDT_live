# Port conflicts

Use the current [deployment guide](../DEPLOYMENT.md). A port conflict is not a
reason to disable the service or kill every Gunicorn process on the machine.

1. If a manual start.sh is running, press Ctrl+C in its terminal before starting
   the systemd service.
2. For the managed application, use sudo systemctl stop decision-tree-api or
   ./stop.sh. This preserves startup enablement.
3. Inspect the listener with sudo ss -ltnp or sudo lsof -iTCP:5000 -sTCP:LISTEN.
   Identify its owner before stopping it; do not terminate unrelated services.
4. Install systemd.service.example from this repository, daemon-reload and restart.
   The unit must not call stop.sh or port-killing tools during startup.

The updated manual startup records run/gunicorn.pid. stop.sh checks that PID
against the checkout before sending TERM. Legacy manual instances without this
PID file should be stopped in their original terminal.

If systemd says activating (auto-restart), inspect:
```bash
sudo systemctl status decision-tree-api --no-pager -l
sudo journalctl -u decision-tree-api -n 60 --no-pager
```
