#!/usr/bin/env bash
# Deploys this repository to the VPS. Run from the repo root on your computer
# (Git Bash on Windows works):
#
#   deploy/deploy.sh setup       once, as root: Docker, firewall, swap, the
#                                "deploy" user and /opt/chat/.env
#   deploy/deploy.sh deploy      ship the last commit, build and (re)start
#   deploy/deploy.sh bootstrap   once: create the company and first admin
#   deploy/deploy.sh reset-password [email]
#                                set a new admin password (lists admins first)
#   deploy/deploy.sh push-keys   generate the Web Push (VAPID) key pair
#   deploy/deploy.sh status      containers and health
#   deploy/deploy.sh logs [svc]  follow logs (api, dashboard, caddy, ...)
#   deploy/deploy.sh backup      dump the database to /opt/chat/backups
#
# It ships the last *commit* (git archive HEAD), never uncommitted files, so
# what runs on the server is always something you can find in git.
#
# Only `setup` logs in as root. It creates the "deploy" user, and every other
# command logs in as that user. Add your SSH key to root before `setup` and the
# deploy user gets the same key.
#
# Other hosts: SETUP_SERVER=root@1.2.3.4 DEPLOY_SERVER=deploy@1.2.3.4
set -euo pipefail

HOST="${DEPLOY_HOST:-169.58.95.150}"
SETUP_SERVER="${SETUP_SERVER:-root@$HOST}"
SERVER="${DEPLOY_SERVER:-deploy@$HOST}"
APP_DIR=/opt/chat
SRC_DIR="$APP_DIR/src"
COMPOSE="docker compose --project-directory $SRC_DIR --env-file $APP_DIR/.env -f $SRC_DIR/docker-compose.prod.yml"

cd "$(git rev-parse --show-toplevel)"

upload_release() {
  local target="$1"
  if [ -n "$(git status --porcelain)" ]; then
    echo "Note: you have uncommitted changes; they will NOT be deployed."
  fi
  local archive
  archive="$(mktemp -t chat-release-XXXXXX).tar.gz"
  git archive --format=tar.gz -o "$archive" HEAD
  echo "==> Uploading $(git rev-parse --short HEAD) to $target"
  scp -q "$archive" "$target:/tmp/chat-release.tar.gz"
  rm -f "$archive"
  ssh "$target" "set -e
    mkdir -p $APP_DIR
    rm -rf $SRC_DIR.new && mkdir -p $SRC_DIR.new
    tar -xzf /tmp/chat-release.tar.gz -C $SRC_DIR.new
    rm -f /tmp/chat-release.tar.gz
    rm -rf $SRC_DIR && mv $SRC_DIR.new $SRC_DIR
    echo $(git rev-parse HEAD) > $SRC_DIR/REVISION"
}

case "${1:-}" in
  setup)
    upload_release "$SETUP_SERVER"
    ssh -t "$SETUP_SERVER" "bash $SRC_DIR/deploy/setup-server.sh"
    echo
    echo "Check the deploy user can log in: ssh $SERVER"
    ;;

  deploy)
    upload_release "$SERVER"
    echo "==> Building and starting (the first build takes several minutes)"
    ssh "$SERVER" "set -e
      test -f $APP_DIR/.env || { echo 'Missing $APP_DIR/.env: run deploy/deploy.sh setup first'; exit 1; }
      $COMPOSE up -d --build --remove-orphans
      docker image prune -f >/dev/null
      $COMPOSE ps"
    ssh "$SERVER" "set -a; . $APP_DIR/.env; set +a
      echo
      echo \"Dashboard:  https://\$APP_DOMAIN\"
      echo \"API health: https://\$API_DOMAIN/health\"
      echo \"Widget:     https://\$API_DOMAIN/widget.js\""
    ;;

  bootstrap)
    read -r -p "Company name: " company
    read -r -p "Company admin email: " email
    read -r -p "Company admin name: " name
    ssh -t "$SERVER" "$COMPOSE run --rm --no-deps -w /app/packages/db \
      -e COMPANY_NAME=$(printf %q "$company") \
      -e ADMIN_EMAIL=$(printf %q "$email") \
      -e ADMIN_NAME=$(printf %q "$name") \
      migrate node_modules/.bin/tsx prisma/bootstrap.ts"
    ;;

  reset-password)
    email="${2:-}"
    if [ -z "$email" ]; then
      ssh "$SERVER" "$COMPOSE run --rm --no-deps -w /app/packages/db         migrate node_modules/.bin/tsx prisma/reset-admin-password.ts"
      read -r -p "Email of the admin to reset: " email
    fi
    [ -n "$email" ] || { echo "No email given."; exit 1; }
    ssh -t "$SERVER" "$COMPOSE run --rm --no-deps -w /app/packages/db       -e ADMIN_EMAIL=$(printf %q "$email")       migrate node_modules/.bin/tsx prisma/reset-admin-password.ts"
    ;;

  push-keys)
    echo "Generating a VAPID key pair..."
    ssh "$SERVER" "$COMPOSE run --rm --no-deps -T -w /app/apps/server api       node -e \"const k=require('web-push').generateVAPIDKeys();console.log('VAPID_PUBLIC_KEY='+k.publicKey);console.log('VAPID_PRIVATE_KEY='+k.privateKey)\""
    echo
    echo "Put those two lines in /opt/chat/.env, along with:"
    echo "  VAPID_SUBJECT=mailto:you@yourdomain.com"
    echo "Then run: deploy/deploy.sh deploy"
    ;;

  status)
    ssh "$SERVER" "$COMPOSE ps; echo; cat $SRC_DIR/REVISION 2>/dev/null"
    ;;

  logs)
    ssh -t "$SERVER" "$COMPOSE logs -f --tail 200 ${2:-}"
    ;;

  backup)
    ssh "$SERVER" "set -e; set -a; . $APP_DIR/.env; set +a
      file=$APP_DIR/backups/chat-\$(date +%Y%m%d-%H%M%S).sql.gz
      $COMPOSE exec -T postgres pg_dump -U \$POSTGRES_USER \$POSTGRES_DB | gzip > \$file
      ls -lh \$file"
    ;;

  *)
    sed -n '2,23p' "$0"
    exit 1
    ;;
esac
