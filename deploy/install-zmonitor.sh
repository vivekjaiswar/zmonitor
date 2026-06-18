#!/bin/bash

echo “=================================”
echo “Installing ZMonitor Dependencies”
echo “=================================”

sudo apt update -y
sudo apt upgrade -y

sudo apt install -y 
docker.io 
docker-compose-v2 
nginx 
curl 
git 
certbot 
python3-certbot-nginx

sudo systemctl enable docker
sudo systemctl start docker

echo “”
echo “Docker Version:”
docker –version

echo “”
echo “Nginx Version:”
nginx -v

echo “”
echo “Base dependencies installed successfully.”
echo “Next steps:”
echo “1. Clone ZMonitor repository”
echo “2. Build Docker image”
echo “3. Configure Nginx”
echo “4. Configure SSL”
echo “5. Start ZMonitor container”
