#!/usr/bin/env bash
# Legacy name retained to avoid broad process killing from old runbooks.
set -euo pipefail
echo "Automatic port killing has been retired."
echo "Stop this app with ./stop.sh or sudo systemctl stop decision-tree-api."
echo "For manual foreground startup, press Ctrl+C in its terminal."
echo "Inspect listeners with sudo ss -ltnp; identify the owning app before stopping it."
exit 1
