# Deploying to a VPS

Everything runs in Docker on one server:

| Container   | What it does                                              | Reachable from    |
| ----------- | --------------------------------------------------------- | ----------------- |
| `caddy`     | HTTPS for all domains, serves `widget.js`                 | Internet, 80/443  |
| `api`       | Express + Socket.IO API                                   | Caddy only        |
| `dashboard` | Agent inbox and admin (Next.js)                           | Caddy only        |
| `postgres`  | Database, data in the `chat_postgres-data` volume         | Server localhost  |
| `minio`     | Chat media, data in the `chat_minio-data` volume          | Caddy (S3 API); console on server localhost |
| `migrate`   | Applies database migrations on every deploy, then exits   | —                 |

Postgres and MinIO are not installed on the server directly: Docker runs them,
and their data lives in named volumes that survive rebuilds and redeploys.

## 1. Domains

Create three DNS **A records** pointing at the server's IP:

```
api.yourdomain.com    → 169.58.95.150
app.yourdomain.com    → 169.58.95.150
media.yourdomain.com  → 169.58.95.150
```

No domain yet? Setup offers free test names such as
`api.169-58-95-150.sslip.io`, which already resolve to the server. Use a real
domain before giving the script to clients.

## 2. SSH key (once, from your computer)

Add your key to **root**. Setup copies it to the `deploy` user it creates.

```bash
ssh-keygen -t ed25519            # skip if ~/.ssh/id_ed25519 exists
cat ~/.ssh/id_ed25519.pub | ssh root@169.58.95.150 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys"
ssh root@169.58.95.150 passwd    # then change the root password
```

## 3. Prepare the server (once)

The script deploys the **last commit**, so commit first. Then:

```bash
deploy/deploy.sh setup
```

This is the only step that logs in as **root**. It installs Docker, enables the
firewall (SSH, 80, 443 only), adds swap, and creates the **`deploy` user** with
your SSH key and access to Docker. It asks for the three domains and writes
`/opt/chat/.env` (owned by `deploy`, readable only by it) with random secrets.

At the end it offers to turn off SSH password logins. First check in a second
terminal that `ssh deploy@169.58.95.150` works, then answer `y`. Root still
works with its key.

Every command after this logs in as `deploy`, never root.

## 4. Deploy

```bash
deploy/deploy.sh deploy
```

The first build takes several minutes. Caddy then fetches the HTTPS
certificates. Check `https://api.yourdomain.com/health`.

## 5. Create the company and first admin (once)

```bash
deploy/deploy.sh bootstrap
```

It asks for the company name and admin email, and prints a generated password
once. Sign in at `https://app.yourdomain.com/admin`, change the password, then
add branches and agents.

## 6. Give clients the script

```html
<script
  src="https://api.yourdomain.com/widget.js"
  data-acme-chat
  data-api-url="https://api.yourdomain.com"
  defer
></script>
```

Add `?agent=AGENT_ID` or `?branch=BRANCH_ID` to the `src` to tie the widget to
one agent or branch. The dashboard copies both out of its chat link dialogs.

A website may only call the API once it is allowed. Edit `/opt/chat/.env` with
`ssh -t deploy@169.58.95.150 nano /opt/chat/.env` and set either:

- `EXTRA_CORS_ORIGINS=https://client.com,https://www.client.com` — one entry per
  website, with the scheme and no trailing slash, or
- `EXTRA_CORS_ORIGINS=*` — any website may embed the widget, with no entry per
  client. Only the widget's own endpoints open up; the dashboard, sign-in and
  admin endpoints stay limited to `APP_DOMAIN`.

Then restart the API to pick it up:

```bash
ssh deploy@169.58.95.150 "docker compose --project-directory /opt/chat/src   --env-file /opt/chat/.env -f /opt/chat/src/docker-compose.prod.yml up -d api"
```

Shareable chat links (`https://api.yourdomain.com/chat?agent=…`) are served from
the API's own domain and need no entry at all.

## 7. Notifications for visitors (optional)

A visitor who closes the hosted chat page can still be told when an agent
answers, through Web Push. Generate the key pair once:

```bash
deploy/deploy.sh push-keys
```

Put the two printed lines into `/opt/chat/.env`, add
`VAPID_SUBJECT=mailto:you@yourdomain.com`, then `deploy/deploy.sh deploy`.
Without keys the feature stays off and nothing else changes.

The chat page then offers "Get a notification when we reply?" once the visitor
has sent something. This works on `https://API_DOMAIN/chat` links, not on the
widget embedded in a client's website: a browser only accepts a service worker
served by the site's own domain, and that domain is the client's, not yours.
On iPhone the visitor must add the page to their Home Screen first; Android and
desktop Chrome work as they are.

## Day to day

| Command                          | Does                                   |
| -------------------------------- | -------------------------------------- |
| `deploy/deploy.sh deploy`        | Ship the latest commit                 |
| `deploy/deploy.sh status`        | Containers, health, deployed commit    |
| `deploy/deploy.sh logs api`      | Follow one service's logs              |
| `deploy/deploy.sh backup`        | Database dump to `/opt/chat/backups`   |
| `deploy/deploy.sh reset-password` | New password for an admin (lists them first) |
| `deploy/deploy.sh push-keys`     | Generate the Web Push (VAPID) key pair |

Use another server with `DEPLOY_HOST=1.2.3.4 deploy/deploy.sh deploy`.

### Reaching Postgres or the MinIO console

Neither is open to the internet. Tunnel over SSH:

```bash
ssh -L 5432:127.0.0.1:5432 -L 9001:127.0.0.1:9001 deploy@169.58.95.150
```

Then connect to `localhost:5432` (user/password in `/opt/chat/.env`) or open
`http://localhost:9001` (MINIO_ACCESS_KEY / MINIO_SECRET_KEY).
