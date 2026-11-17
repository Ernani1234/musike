# Musike self-hosted deployment

Production and demo run the prebuilt `ghcr.io/ernani1234/musike:latest` image
behind a reverse proxy on a single host. Hostnames below are placeholders —
substitute your own.

## Layout

| Instance | URL (placeholder)      | Container port | Host port |
|----------|------------------------|----------------|-----------|
| Prod     | music.example.com      | 4180           | 4180      |
| Demo     | music-demo.example.com | 4180           | 4181      |

Both instances bind 127.0.0.1 only. The reverse proxy routes `music.example.com`
to host port 4180 and `music-demo.example.com` to 4181. The old demo hostname is
a permanent (301) redirect to the prod host with path and query preserved
(kept for old bookmarks).

## yt-dlp workaround (issue #28)

yt-dlp stream URLs issued to Musike go invalid ~3-4s after issuance, so proxied
streams fail with 403. `ytdlp-wrap.sh` wraps yt-dlp and sleeps `YTDLP_DELAY`
seconds (default 4) after yt-dlp finishes, so Musike proxies a fresh URL.
It is bind-mounted read-only into `/data`; `YTDLP_PATH=/data/ytdlp-wrap.sh`
activates it. Remove the wrapper once upstream fixes Ernani1234/musike#28.

## Deploy an instance

1. Copy `docker-compose.prod.yml` (or `docker-compose.demo.yml`) into the
   instance folder as `docker-compose.yml`, together with `ytdlp-wrap.sh`.
2. `docker compose up -d` (as root, or a user with docker permissions).
3. Verify: `curl -fsS http://127.0.0.1:4180/` (demo: port 4181).

Volumes are project-prefixed named volumes (`<project>_musike-data`,
`<project>_musike-cache`) and persist across recreations; moving the folder or
renaming the service creates fresh volumes, so copy the old volume's data
across if the library should survive the move. See the compose file headers
for the exact deltas from the upstream `docker-compose.yml`.
