#!/bin/bash
# Amalfi Backend Deploy Script â€” runs on Proxmox host (pve1)
set -e

echo "=== Starting CT 101 ==="
pct start 101 2>/dev/null || true
sleep 5

echo "=== CT 101 IP ==="
pct exec 101 -- ip addr show eth0 | grep "inet "

echo "=== Installing Node.js on CT 101 ==="
pct exec 101 -- bash -c "
  if ! command -v node &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq curl
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
  fi
  node --version
  npm --version
"

echo "=== Installing PM2 on CT 101 ==="
pct exec 101 -- bash -c "
  if ! command -v pm2 &>/dev/null; then
    npm install -g pm2 --quiet
  fi
  pm2 --version
"

echo "=== Creating app directory ==="
pct exec 101 -- bash -c "mkdir -p /opt/amalfi-hub/uploads"

echo "=== DONE: CT 101 is ready for file transfer ==="
pct exec 101 -- ip addr show eth0 | grep "inet "
