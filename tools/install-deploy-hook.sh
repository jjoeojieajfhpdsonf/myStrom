#!/bin/sh
# One-time setup of the deploy hook on the server (Ubuntu with systemd, docker compose and optionally Tailscale).
# Run from the repository: sh tools/install-deploy-hook.sh   (asks for sudo to install the systemd service)
# Re-running is safe: token and service list are kept. More projects: add them to services.json, no restart needed.
set -e
REPO=$(cd "$(dirname "$0")/.." && pwd)
USER_NAME=$(id -un)
TOKEN_DIR="$HOME/.config/mystrom-deploy"
TOKEN_FILE="$TOKEN_DIR/token"
SERVICES_FILE="$TOKEN_DIR/services.json"
PORT=${DEPLOY_PORT:-8099}
HTTPS_PORT=${DEPLOY_HTTPS_PORT:-8444}

# secret token (created once, readable only by you)
mkdir -p "$TOKEN_DIR" && chmod 700 "$TOKEN_DIR"
if [ ! -s "$TOKEN_FILE" ]; then
  python3 -c 'import secrets; print(secrets.token_urlsafe(32))' > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
fi

# services that may be deployed; starts with this repository
if [ ! -s "$SERVICES_FILE" ]; then
  cat > "$SERVICES_FILE" <<EOF
{
  "mystrom-app": { "path": "$REPO", "branch": "main", "health": "http://127.0.0.1:${MYSTROM_PORT:-8091}/api/state" }
}
EOF
fi

# systemd service: runs as you (needs to be in the docker group), restarts on failure
sudo tee /etc/systemd/system/mystrom-deploy.service > /dev/null <<EOF
[Unit]
Description=mystrom-app deploy hook
After=network-online.target docker.service

[Service]
User=$USER_NAME
WorkingDirectory=$REPO
Environment=DEPLOY_PORT=$PORT
Environment=DEPLOY_TOKEN_FILE=$TOKEN_FILE
Environment=DEPLOY_SERVICES=$SERVICES_FILE
ExecStart=/usr/bin/python3 $REPO/tools/deploy-hook.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now mystrom-deploy.service
sudo systemctl restart mystrom-deploy.service

# reachable in the tailnet only (HTTPS via Tailscale), not from the internet
if command -v tailscale > /dev/null; then
  sudo tailscale serve --bg --https="$HTTPS_PORT" "http://127.0.0.1:$PORT"
  HOST=$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')
  URL="https://$HOST:$HTTPS_PORT/deploy"
else
  URL="http://127.0.0.1:$PORT/deploy (no Tailscale: only reachable on this machine)"
fi

echo
echo "Deploy hook is running."
echo "URL:   $URL"
echo "Token: $(cat "$TOKEN_FILE")"
echo
echo "Services: $SERVICES_FILE"
echo
echo "Deploy:   curl -N -X POST -H \"Authorization: Bearer <token>\" $URL/mystrom-app"
echo "Overview: curl -H \"Authorization: Bearer <token>\" $URL"
