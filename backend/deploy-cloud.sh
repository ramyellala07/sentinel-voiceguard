#!/usr/bin/env bash
# Sentinel backend — fresh Ubuntu 22.04/24.04 cloud VM to running API.
# Tested target: 4GB RAM droplet (DigitalOcean $200 student credit).
# Fill the 4 secrets, then run each block in order over SSH.
set -euo pipefail

# ---------- 0. variables (FILL THESE) ----------
SUPABASE_URL="https://xyzcompany.supabase.co"
SUPABASE_KEY="sb_secret_..."          # service_role, NEVER commit this file with real values
GROQ_API_KEY="gsk_..."
FRONTEND_URL="https://sentinel-voiceguard.vercel.app"
DOMAIN="api.example.com"              # your droplet IP works too, but a domain
                                      # gives free auto-HTTPS below (use DuckDNS)

# ---------- 1. system + docker ----------
sudo apt-get update -qq
sudo apt-get install -y -qq docker.io caddy git
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

# ---------- 2. code ----------
git clone https://github.com/ramyellala07/sentinel-voiceguard.git
cd sentinel-voiceguard/voiceguard-ai/backend

# ---------- 3. env file (lives ONLY on this server) ----------
cat > .env <<EOF
PORT=5000
FRONTEND_URL=${FRONTEND_URL}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_KEY=${SUPABASE_KEY}
GROQ_API_KEY=${GROQ_API_KEY}
HIGH_RISK_AT=70
MEDIUM_RISK_AT=45
SIMILARITY_THRESHOLD=75
EOF
chmod 600 .env

# ---------- 4. build + run (detached, auto-restart) ----------
docker build -t sentinel-backend .
docker run -d --name sentinel --restart unless-stopped \
  -e PORT=5000 --env-file .env -p 127.0.0.1:5000:5000 sentinel-backend
sleep 5 && docker logs --tail 5 sentinel

# ---------- 5. HTTPS via Caddy (auto Let's Encrypt cert) ----------
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
${DOMAIN} {
	reverse_proxy 127.0.0.1:5000
}
EOF
sudo systemctl reload caddy

# ---------- 6. verify ----------
echo "Waiting for model warmup (~3-5 min first boot)…"
sleep 60
curl -s "https://${DOMAIN}/api/health"
echo
echo "If healthy: set Vercel VITE_BACKEND_URL=https://${DOMAIN}, redeploy."
