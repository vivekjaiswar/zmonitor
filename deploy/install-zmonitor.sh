#!/bin/bash
#
# ZMonitor installer for Ubuntu servers.
#
# Usage:
#   ./install-zmonitor.sh
#
# Optional environment variables:
#   ZMONITOR_VERSION=latest   # image tag to pull (default: latest)
#   ZMONITOR_PORT=3001        # host port to expose (default: 3001)
#   ZMONITOR_DIR=/opt/zmonitor  # install/data directory (default: /opt/zmonitor)
#   DOMAIN=monitor.example.com  # if set, also configures Nginx + Let's Encrypt SSL
#
# Safe to re-run: pulls the latest image and recreates the container if needed.

set -euo pipefail

ZMONITOR_IMAGE="ghcr.io/vivekjaiswar/zmonitor:${ZMONITOR_VERSION:-latest}"
INSTALL_DIR="${ZMONITOR_DIR:-/opt/zmonitor}"
DATA_DIR="$INSTALL_DIR/data"
COMPOSE_FILE="$INSTALL_DIR/compose.yaml"
PORT="${ZMONITOR_PORT:-3001}"

log() { echo -e "\n==> $1"; }

if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
else
    SUDO="sudo"
fi

log "Installing base tools (curl, ca-certificates)..."
$SUDO apt-get update -y
$SUDO apt-get install -y ca-certificates curl

log "Checking for Docker..."
if ! command -v docker >/dev/null 2>&1; then
    echo "Docker not found, installing Docker Engine from Docker's official repo..."

    $SUDO install -m 0755 -d /etc/apt/keyrings
    $SUDO curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    $SUDO chmod a+r /etc/apt/keyrings/docker.asc

    ARCH="$(dpkg --print-architecture)"
    CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
    echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $CODENAME stable" \
        | $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null

    $SUDO apt-get update -y
    $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    $SUDO systemctl enable docker
    $SUDO systemctl start docker
else
    echo "Docker already installed: $(docker --version)"
fi

# Let the invoking user run docker without sudo on future logins (takes effect after re-login).
if [ -n "${SUDO_USER:-${USER:-}}" ] && ! id -nG "${SUDO_USER:-$USER}" 2>/dev/null | grep -qw docker; then
    $SUDO usermod -aG docker "${SUDO_USER:-$USER}" || true
fi

log "Setting up $INSTALL_DIR ..."
$SUDO mkdir -p "$DATA_DIR"

log "Writing compose file to $COMPOSE_FILE ..."
$SUDO tee "$COMPOSE_FILE" > /dev/null <<EOF
services:
  zmonitor:
    image: $ZMONITOR_IMAGE
    container_name: zmonitor
    restart: unless-stopped
    ports:
      - "$PORT:3001"
    volumes:
      - $DATA_DIR:/app/data
EOF

log "Pulling ZMonitor image ($ZMONITOR_IMAGE)..."
$SUDO docker compose -f "$COMPOSE_FILE" pull

log "Starting ZMonitor..."
$SUDO docker compose -f "$COMPOSE_FILE" up -d

log "Waiting for ZMonitor to become healthy..."
for _ in $(seq 1 30); do
    status="$($SUDO docker inspect --format='{{.State.Health.Status}}' zmonitor 2>/dev/null || echo starting)"
    if [ "$status" = "healthy" ]; then
        break
    fi
    sleep 2
done

if [ -n "${DOMAIN:-}" ]; then
    log "DOMAIN set to '$DOMAIN' — configuring Nginx reverse proxy + SSL..."
    $SUDO apt-get install -y nginx certbot python3-certbot-nginx

    $SUDO tee "/etc/nginx/sites-available/$DOMAIN" > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    $SUDO ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
    $SUDO nginx -t
    $SUDO systemctl reload nginx

    $SUDO certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect -m "admin@$DOMAIN" || \
        echo "WARNING: certbot failed — check that $DOMAIN's DNS points at this server, then re-run: sudo certbot --nginx -d $DOMAIN"

    ACCESS_URL="https://$DOMAIN"
else
    IP="$(curl -fs -4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
    ACCESS_URL="http://$IP:$PORT"
fi

echo ""
echo "================================================="
echo " ZMonitor is live!"
echo " URL:  $ACCESS_URL"
echo " Data: $DATA_DIR"
echo "================================================="
