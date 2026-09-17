#!/usr/bin/env bash
# One-time server preparation, run on the VPS as root (deploy.sh setup does it):
#
#   - installs Docker, opens only SSH/HTTP/HTTPS, adds swap for the builds
#   - creates the "deploy" user that every later deploy logs in as, with the
#     same SSH keys root has
#   - writes /opt/chat/.env with random secrets
#   - optionally turns off password SSH logins (keys only)
#
# Safe to run again: it keeps an existing user and .env.
set -euo pipefail

APP_DIR=/opt/chat
ENV_FILE="$APP_DIR/.env"
DEPLOY_USER=deploy

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

echo "==> System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl openssl ufw

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
docker compose version

echo "==> Firewall: SSH, HTTP, HTTPS only"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# Building the Next.js dashboard needs more memory than a small VPS has.
if ! swapon --show | grep -q .; then
  echo "==> Adding 4G swap"
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ------------------------------------------------------------------ deploy user
echo "==> Deploy user: $DEPLOY_USER"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
# Docker group: it can run the stack without sudo. Note this is effectively
# root on the host, so guard this account's SSH key like root's.
usermod -aG docker "$DEPLOY_USER"

home_dir=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home_dir/.ssh"
keys="$home_dir/.ssh/authorized_keys"
if [ -s /root/.ssh/authorized_keys ]; then
  touch "$keys"
  # Append root's keys that the deploy user doesn't have yet.
  while IFS= read -r key; do
    if [ -n "$key" ] && ! grep -qxF "$key" "$keys"; then
      echo "$key" >> "$keys"
    fi
  done < /root/.ssh/authorized_keys
  chown "$DEPLOY_USER:$DEPLOY_USER" "$keys"
  chmod 600 "$keys"
  echo "Copied root's SSH keys to $DEPLOY_USER."
fi
if [ ! -s "$keys" ]; then
  echo "No SSH key found for root, so $DEPLOY_USER needs a password to log in."
  passwd "$DEPLOY_USER"
fi

mkdir -p "$APP_DIR" "$APP_DIR/backups"

# ------------------------------------------------------------------ settings
if [ -f "$ENV_FILE" ]; then
  echo "==> Keeping existing $ENV_FILE"
else
  echo "==> Writing $ENV_FILE"
  ip=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
  dashed=${ip//./-}
  echo
  echo "Domains must already point at this server ($ip)."
  echo "No domain yet? Press Enter to use free test names on sslip.io."
  read -r -p "API domain   [api.$dashed.sslip.io]: " api_domain
  read -r -p "App domain   [app.$dashed.sslip.io]: " app_domain
  read -r -p "Media domain [media.$dashed.sslip.io]: " media_domain
  read -r -p "Client websites for the widget, comma separated (can edit later): " extra_origins

  umask 077
  cat > "$ENV_FILE" <<EOF
API_DOMAIN=${api_domain:-api.$dashed.sslip.io}
APP_DOMAIN=${app_domain:-app.$dashed.sslip.io}
MEDIA_DOMAIN=${media_domain:-media.$dashed.sslip.io}
PUBLIC_SCHEME=https
EXTRA_CORS_ORIGINS=${extra_origins}

POSTGRES_USER=chat
POSTGRES_DB=chat
POSTGRES_PASSWORD=$(openssl rand -hex 24)

JWT_SECRET=$(openssl rand -hex 32)

MINIO_ACCESS_KEY=chat$(openssl rand -hex 6)
MINIO_SECRET_KEY=$(openssl rand -hex 32)
MINIO_BUCKET=chat-media
EOF
  echo "Saved with generated secrets."
fi

# The deploy user owns the app directory and is the only one who can read .env.
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"
chmod 600 "$ENV_FILE"

# ------------------------------------------------------------------ SSH hardening
if [ -s "$keys" ] && [ -d /etc/ssh/sshd_config.d ]; then
  echo
  echo "Optional: turn off password logins over SSH, so only SSH keys work."
  echo "Root keeps working with its key (needed to rerun this setup)."
  echo "Only say yes after checking in a second terminal that this works:"
  echo "  ssh $DEPLOY_USER@$(hostname -I | awk '{print $1}')"
  read -r -p "Disable SSH password logins now? [y/N]: " harden
  if [[ "$harden" =~ ^[Yy]$ ]]; then
    cat > /etc/ssh/sshd_config.d/10-chat-hardening.conf <<'EOF'
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
    if sshd -t; then
      systemctl reload ssh 2>/dev/null || systemctl reload sshd
      echo "Done. SSH passwords are off; keys only."
    else
      rm -f /etc/ssh/sshd_config.d/10-chat-hardening.conf
      echo "sshd config check failed; left SSH unchanged."
    fi
  fi
fi

echo
echo "Server ready. Next, from your computer: deploy/deploy.sh deploy"
