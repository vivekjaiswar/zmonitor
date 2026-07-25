<div align="center" width="100%">
    <img src="./public/icon.svg" width="128" alt="ZMonitor Logo" />
</div>

# ZMonitor

ZMonitor is a self-hosted uptime and infrastructure monitoring tool. It watches
your websites, servers, and APIs around the clock, and can alert you the
instant something goes down — over WhatsApp, Slack, Telegram, email, SMS, and
80+ other notification channels.

Every instance is fully white-labeled: set your own name, logo, and favicon
from Settings, no rebuild required.

## Features

- Monitors HTTP(s), TCP, ping, DNS, Docker containers, and more
- Checks as often as every 20 seconds, with full response-time history
- 80+ notification channels out of the box, including WhatsApp, Slack,
  Discord, Telegram, Teams, PagerDuty, and email
- Per-instance white-labeling: custom app name, logo, and favicon
- Public status pages, with their own independent branding
- Certificate and domain expiry alerts
- Multi-language UI

## Install

The fastest path is the installer, which sets up Docker if needed, pulls the
published image, and starts the container:

```bash
curl -fsSL https://raw.githubusercontent.com/vivekjaiswar/zmonitor/main/deploy/install-zmonitor.sh -o install-zmonitor.sh
chmod +x install-zmonitor.sh
./install-zmonitor.sh
```

See [`deploy/INSTALL.md`](deploy/INSTALL.md) for server requirements, the
domain/HTTPS option, environment variables, backup/restore, and upgrades.

### Docker Compose

```yaml
services:
  zmonitor:
    image: ghcr.io/vivekjaiswar/zmonitor:latest
    container_name: zmonitor
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
```

## Development

```bash
git clone https://github.com/vivekjaiswar/zmonitor.git
cd zmonitor
npm ci
npm run dev
```

Useful scripts: `npm run lint`, `npm test`, `npm run build`. See
[`package.json`](package.json) for the full list.

## License

MIT — see [`LICENSE`](LICENSE).
