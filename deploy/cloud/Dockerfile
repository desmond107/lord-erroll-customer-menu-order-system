# syntax=docker/dockerfile:1
#
# The hosted build of the platform. Three stages so the image that actually runs
# in production carries no compilers and no build tooling: only the server, its
# runtime dependencies, and the built guest app.

# ---------------------------------------------------------------- runtime deps
# better-sqlite3 is native. It is compiled here, against the same base image the
# final stage uses, so the binary it produces is the one that will be loaded.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
# All three manifests, or npm rejects the lockfile as out of step with the
# workspaces it describes.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev --workspace server --include-workspace-root

# ------------------------------------------------------------------ web build
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY . .
RUN npm run build

# --------------------------------------------------------------------- runtime
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    EXPOSURE=public \
    TRUST_PROXY=1 \
    DATABASE_PATH=/data/lord-erroll.db \
    BACKUP_DIR=/backups
WORKDIR /app

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/web/dist ./web/dist
COPY package.json ./
COPY server ./server

# The database and the nightly snapshots outlive any one container, so they are
# volumes. Owned by the unprivileged user the process runs as: Docker copies this
# ownership into a named volume the first time it creates one.
RUN mkdir -p /data /backups && chown -R node:node /data /backups /app
USER node

EXPOSE 4000

# Liveness only. `/api/health` answers plainly on an internet-facing server, so
# this says nothing a passer-by could not already read.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
