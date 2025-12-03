#!/usr/bin/env bash
set -euo pipefail

# Cloudflare Tunnel bootstrap (non-interactive)
# Usage:
#   CF_TUNNEL_TOKEN="<your_token>" ./scripts/setup-cloudflare-tunnel.sh
#
# Notes:
# - Expects token via env; does NOT write secrets to repo.
# - Installs cloudflared if missing (Debian/Ubuntu via apt). Adjust for other OS.
# - Configures translate.ease-joy.com -> https://localhost:3000 and systemd service.

if [[ -z "${CF_TUNNEL_TOKEN:-}" ]]; then
  echo "CF_TUNNEL_TOKEN is required (export it before running)." >&2
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Installing cloudflared (Debian/Ubuntu)..."
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/ cloudflare main" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y cloudflared
fi

sudo mkdir -p /etc/cloudflared
cat <<'EOF' | sudo tee /etc/cloudflared/config.yml >/dev/null
tunnel: lightsler-ai-tunnel
credentials-file: /etc/cloudflared/lightsler-ai-tunnel.json
ingress:
  - hostname: translate.ease-joy.com
    service: https://localhost:3000
  - service: http_status:404
EOF

# Write credentials securely (not kept in repo)
echo "${CF_TUNNEL_TOKEN}" | sudo tee /etc/cloudflared/lightsler-ai-tunnel.json >/dev/null
sudo chmod 600 /etc/cloudflared/lightsler-ai-tunnel.json

sudo cloudflared service install ${CF_TUNNEL_TOKEN}
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared

echo "Cloudflare Tunnel configured for translate.ease-joy.com → https://localhost:3000."
echo "Add DNS: translate.ease-joy.com CNAME <tunnel-hostname>.cfargotunnel.com in Cloudflare DNS."
