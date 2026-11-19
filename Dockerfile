# syntax=docker/dockerfile:1
#
# Musike server + web app in one image. The music library lives in /data, the HD video cache in /cache.
#   docker run -d -p 4180:4180 -v musike-data:/data -v musike-cache:/cache ghcr.io/ernani1234/musike
#
# Multi-arch (amd64, arm64): the JavaScript is built once on the build machine, only the tools differ.

ARG NODE_VERSION=22

# ---- Build: the web app and the server, bundled into plain JavaScript ----
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /src
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
COPY web/package.json web/
# Install the supported server and web/PWA workspace packages.
RUN pnpm install --frozen-lockfile --filter @musike/server --filter @musike/web
COPY server server
COPY web web
RUN pnpm --filter @musike/web build && pnpm --filter @musike/server bundle

# ---- Runtime: Node, FFmpeg, yt-dlp and Deno ----
FROM node:${NODE_VERSION}-bookworm-slim
ARG TARGETARCH

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*

# Official standalone builds of yt-dlp and Deno (Deno solves YouTube's player challenges for yt-dlp).
# They live in a folder the app user owns, so "Update" in Musike's Settings can replace yt-dlp.
RUN set -eux; \
  case "$TARGETARCH" in \
    arm64) ytdlp="yt-dlp_linux_aarch64"; deno="deno-aarch64-unknown-linux-gnu.zip" ;; \
    *) ytdlp="yt-dlp_linux"; deno="deno-x86_64-unknown-linux-gnu.zip" ;; \
  esac; \
  mkdir -p /opt/musike/bin; \
  curl -fsSL -o /opt/musike/bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$ytdlp"; \
  chmod +x /opt/musike/bin/yt-dlp; \
  curl -fsSL -o /tmp/deno.zip "https://github.com/denoland/deno/releases/latest/download/$deno"; \
  unzip -q /tmp/deno.zip -d /opt/musike/bin; \
  rm /tmp/deno.zip; \
  mkdir -p /data /cache; \
  chown -R node:node /opt/musike /data /cache

WORKDIR /app
COPY --from=build --chown=node:node /src/server/dist/server.mjs ./server.mjs
COPY --from=build --chown=node:node /src/web/dist ./web

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4180 \
    MUSIKE_DATA_DIR=/data \
    MUSIKE_CACHE_DIR=/cache \
    MUSIKE_WEB_DIST=/app/web \
    PATH=/opt/musike/bin:$PATH

USER node
VOLUME ["/data", "/cache"]
EXPOSE 4180
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4180) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server.mjs"]
