#!/bin/sh
# One-time setup of the shutdown agent on the computer behind a myStrom plug (e.g. a Raspberry Pi with systemd).
# Copy this folder (or just shutdown-agent.py and this script) to the computer and run:  sh install-shutdown-agent.sh
# Re-running is safe: the token is kept.
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
PORT=${SHUTDOWN_PORT:-8098}

sudo mkdir -p /etc/mystrom-shutdown /opt/mystrom-shutdown
sudo cp "$DIR/shutdown-agent.py" /opt/mystrom-shutdown/shutdown-agent.py
if ! sudo test -s /etc/mystrom-shutdown/token; then
  python3 -c 'import secrets; print(secrets.token_urlsafe(32))' | sudo tee /etc/mystrom-shutdown/token > /dev/null
fi
sudo chmod 600 /etc/mystrom-shutdown/token

sudo tee /etc/systemd/system/mystrom-shutdown.service > /dev/null <<EOF
[Unit]
Description=Shutdown agent for mystrom-app
After=network-online.target

[Service]
Environment=SHUTDOWN_PORT=$PORT
ExecStart=/usr/bin/python3 /opt/mystrom-shutdown/shutdown-agent.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now mystrom-shutdown.service
sudo systemctl restart mystrom-shutdown.service

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "Shutdown agent is running."
echo "URL:   http://${IP:-<this-ip>}:$PORT"
echo "Token: $(sudo cat /etc/mystrom-shutdown/token)"
echo
echo "Enter both in mystrom-app: plug › Settings › Shut down before switching off."
