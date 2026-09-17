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

Add every client website to `EXTRA_CORS_ORIGINS` in `/opt/chat/.env`, for
example `https://client.com,https://www.client.com`, then run
`deploy/deploy.sh deploy` again. Without it the widget loads but cannot reach
the API. Edit the file with `ssh -t deploy@169.58.95.150 nano /opt/chat/.env`.

## Day to day

| Command                          | Does                                   |
| -------------------------------- | -------------------------------------- |
| `deploy/deploy.sh deploy`        | Ship the latest commit                 |
| `deploy/deploy.sh status`        | Containers, health, deployed commit    |
| `deploy/deploy.sh logs api`      | Follow one service's logs              |
| `deploy/deploy.sh backup`        | Database dump to `/opt/chat/backups`   |

Use another server with `DEPLOY_HOST=1.2.3.4 deploy/deploy.sh deploy`.

### Reaching Postgres or the MinIO console

Neither is open to the internet. Tunnel over SSH:

```bash
ssh -L 5432:127.0.0.1:5432 -L 9001:127.0.0.1:9001 deploy@169.58.95.150
```

Then connect to `localhost:5432` (user/password in `/opt/chat/.env`) or open
`http://localhost:9001` (MINIO_ACCESS_KEY / MINIO_SECRET_KEY).
