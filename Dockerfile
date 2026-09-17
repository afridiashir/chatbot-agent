# syntax=docker/dockerfile:1.7
#
# One Dockerfile, three production images, built by docker-compose.prod.yml:
#
#   --target api        Express + Socket.IO API (also runs migrations/bootstrap)
#   --target dashboard  Next.js agent inbox and admin
#   --target caddy      HTTPS reverse proxy that also serves widget.js
#
# All three share the dependency layer, so a rebuild after a code change only
# repeats the build steps, not `pnpm install`.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
# openssl: Prisma's migration engine links against it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable
WORKDIR /app

# ---------------------------------------------------------------- dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/web/package.json apps/web/
COPY apps/widget/package.json apps/widget/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/validation/package.json packages/validation/
# Patient network settings, as flags because pnpm 11 ignores npm_config_* env
# vars: on a slow link registry requests can take close to a minute, which is
# pnpm's default timeout.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --store-dir=/pnpm/store \
      --fetch-timeout=600000 \
      --fetch-retries=6 \
      --fetch-retry-mintimeout=10000 \
      --fetch-retry-maxtimeout=120000

# ------------------------------------------------------------------------ api
FROM deps AS api-build
COPY . .
# prisma.config.ts reads DATABASE_URL even for `generate`; nothing connects.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @repo/db generate \
 && pnpm --filter @repo/server build

FROM api-build AS api
ENV NODE_ENV=production
WORKDIR /app/apps/server
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]

# ------------------------------------------------------------------ dashboard
FROM deps AS dashboard
COPY . .
# Baked into the browser bundle at build time, so it is a build argument.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WIDGET_BASE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL     NEXT_PUBLIC_WIDGET_BASE_URL=$NEXT_PUBLIC_WIDGET_BASE_URL
RUN pnpm --filter @repo/dashboard build
ENV NODE_ENV=production
WORKDIR /app/apps/dashboard
USER node
EXPOSE 3003
CMD ["node_modules/.bin/next", "start", "--port", "3003", "--hostname", "0.0.0.0"]

# --------------------------------------------------------------------- widget
FROM deps AS widget-build
COPY . .
# The default API address when a site's script tag leaves out data-api-url.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @repo/widget build

# ---------------------------------------------------------------------- caddy
FROM caddy:2-alpine AS caddy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=widget-build /app/apps/widget/dist/widget.js /srv/widget/widget.js
COPY deploy/chat.html /srv/widget/chat.html
