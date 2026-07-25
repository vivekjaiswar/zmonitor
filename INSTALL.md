# ZMonitor Installation Guide

No source code, no build step, no manual Docker commands — the installer pulls a
prebuilt public image (`ghcr.io/vivekjaiswar/zmonitor`) and starts it for you.

## Server Requirements

* Ubuntu 22.04/24.04 LTS or Debian 11/12/13
* 2 vCPU minimum
* 4 GB RAM minimum
* 20 GB SSD minimum
* Public IP (a domain name is optional, see below)

## Install

Download and run the installer — it installs Docker if needed, pulls the ZMonitor
image, and starts it:

```bash
apt-get update && apt-get install -y curl   # skip if curl is already installed
curl -fsSL https://raw.githubusercontent.com/vivekjaiswar/zmonitor/main/install-zmonitor.sh -o install-zmonitor.sh
chmod +x install-zmonitor.sh
./install-zmonitor.sh
```

Some minimal/fresh server images (common on Debian LXC templates, some VPS
providers) don't ship `curl` at all, so the first line makes sure it's there
before trying to fetch the script.

When it finishes it prints the URL to open, e.g. `http://<server-ip>:3001`.

### With a domain + automatic HTTPS

If you have a domain already pointed at the server's IP (an `A` record), pass it
in and the installer also configures Nginx as a reverse proxy and issues a free
Let's Encrypt certificate:

```bash
DOMAIN=monitor.example.com ./install-zmonitor.sh
```

### Other options

Environment variables you can set before running the script:

| Variable            | Default         | Purpose                                  |
|---------------------|------------------|-------------------------------------------|
| `ZMONITOR_VERSION`  | `latest`         | Image tag to pull (e.g. a pinned release) |
| `ZMONITOR_PORT`      | `3001`           | Host port to expose                       |
| `ZMONITOR_DIR`       | `/opt/zmonitor`  | Where the compose file + data are stored  |
| `DOMAIN`             | unset            | Enables Nginx + Let's Encrypt SSL          |

The script is safe to re-run — running it again pulls the latest image and
recreates the container in place, so it also doubles as the upgrade command.

## Verify

```bash
docker ps                 # container should show "healthy"
docker logs zmonitor      # tail startup logs
```

## Backup

All monitor data lives in the data directory (default `/opt/zmonitor/data`):

```bash
tar -czvf zmonitor-data-backup-$(date +%F).tar.gz -C /opt/zmonitor data
```

## Restore

```bash
tar -xzvf zmonitor-data-backup-<date>.tar.gz -C /opt/zmonitor
cd /opt/zmonitor && docker compose up -d
```
