ZMonitor Installation Guide

Server Requirements

* Ubuntu 24.04 LTS
* 2 vCPU minimum
* 4 GB RAM minimum
* 20 GB SSD minimum
* Public IP or Elastic IP
* Domain Name

Install Dependencies

chmod +x deploy/install-zmonitor.sh
./deploy/install-zmonitor.sh

Clone Repository

git clone <repository-url>
cd zmonitor

Build Docker Image

docker build \
--target release \
-f docker/dockerfile \
-t zmonitor:latest .

Start Container

docker run -d \
--name uptime-kuma \
--restart unless-stopped \
-p 3001:3001 \
-v /opt/zmonitor/data:/app/data \
zmonitor:latest

Configure Nginx

Proxy requests from port 80/443 to port 3001.

Configure SSL

sudo certbot --nginx

Verify

* HTTPS works
* Dashboard loads
* Container is healthy

docker ps

Backup

tar -czvf zmonitor-data-backup-$(date +%F).tar.gz data

Restore

Extract backup and restart container.
