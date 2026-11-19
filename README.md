<div align="center">

<img src="web/public/icon-192.png" width="96" alt="Musike logo: three equalizer bars forming an M" />

# Musike

> Fork WIP package (18 November 2026): configurable audio lookahead; optional invite-only WhatsApp accounts with per-user SQLite libraries; admin/ops; optional Google import and per-user daily top-ups. Auth is **off by default**. Read [deployment notes](DEPLOYMENT-NOTES.md), [database decision](DATABASE-DECISION.md), [architecture](ARCHITECTURE.md), [acceptance checks](ACCEPTANCE-CHECKLIST.md) and [test results](TEST-RESULTS.md). Apply source changes to fork main `85843fd`; preserve operator deployment files. Google albums/history are provider-dependent and must pass demo checks before acceptance.


**Your music, uninterrupted.**

A personal music player for YouTube's catalog: any song or music video, as **audio** or **video**, with no ads, no account and no subscription.
Runs as a **Windows**, **macOS** and **Linux** app, as an **Android**, **Android TV** and **iPhone** app that needs no computer, in any **browser** (installable PWA) and in **Docker**.

![MIT license](https://img.shields.io/badge/license-MIT-c3ec52?style=flat-square&labelColor=121318)
![Web and PWA](https://img.shields.io/badge/web-PWA-c3ec52?style=flat-square&labelColor=121318)
![Docker](https://img.shields.io/badge/docker-amd64%20%7C%20arm64-c3ec52?style=flat-square&labelColor=121318)
![TypeScript](https://img.shields.io/badge/TypeScript-100%25-c3ec52?style=flat-square&labelColor=121318)

<img src="docs/screenshots/home.jpg" alt="Musike playing Radiohead, with playlists, recently played and the Now Playing panel" width="900" />

**[Download for Windows, macOS, Linux, Android and iPhone](https://github.com/Ernani1234/musike/releases/latest)** · [Run with Docker](#option-6-docker) · [Run from source](#option-7-node-server--browser)

</div>

---

## Contents

- [What it is](#what-it-is)
- [Features](#features)
- [Screenshots](#screenshots)
- [How it works](#how-it-works)
- [Installation](#installation)
- [Moving your library (backup)](#moving-your-library-backup)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Configuration](#configuration)
- [API](#api)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Legal notice](#legal-notice)
- [License](#license)

## What it is

Musike started from the idea behind the old Discord music bots: a server that fetches audio straight from YouTube and hands it over ready to play. Instead of a chat, the interface is a full music player: fast, simple, and built to feel like a modern app.

- **Server-mediated playback:** the server gets the original stream with [yt-dlp](https://github.com/yt-dlp/yt-dlp) and passes the bytes to the player.
- **Song or music video:** switch between Audio and Video at any time, from the same point in the track. For songs, Musike finds the artist's official music video.
- **Any screen:** designed for phones of every size, tablets, laptops and big monitors.
- **Yours:** it runs on your own computer. Private account libraries live in SQLite; auth-off libraries use JSON. Both support portable library backups.

## Features

**Listen**
- Search YouTube Music with **Songs**, **Videos** and **Albums** tabs, with suggestions as you type
- Paste a **YouTube link** to play it right away
- **Browse by genre:** the **Genres** button opens YouTube Music's genres (Rock, Pop, Hip-hop, Indie, Metal, Jazz…). See each genre's bands and artists (with "Load more") or all its songs in one list
- **Artists:** greatest hits, plus every album and single
- **Albums:** open any album and play it in its original order, shuffle it, or save it as a playlist in one click
- **Search a list:** type several songs separated by commas ("Bohemian Rhapsody, Hotel California, …"). Musike finds each one, picks the best match (you can swap it) and lets you play, favorite or send them all to a playlist
- Queue with play next, shuffle and repeat (queue or track)
- **Autoplay radio:** when the queue ends, it keeps going with similar songs
- Instant seeking (HTTP Range streaming) and the next track preloaded

**Video**
- Video mode in the side panel, full screen on phones, or in a floating mini player
- **Official music video** found automatically for songs (only from the artist's own channel)
- **Cinema mode:** maximize the video (button, double-click or `F`), with controls that fade while you watch, and true full screen
- SD quality (starts fast) or HD 720p (cached locally)

**Library**
- Playlists, Favorites and recently played history
- Select many tracks at once to play, favorite or add to a playlist
- **Backup to a file** to move everything to another Musike: merge or replace, with a preview before importing

**Make it yours**
- **English** and **Brazilian Portuguese**, switchable in Settings (per device). Server messages and the genre names and bios that come from YouTube Music follow the same language
- Dark and light themes, and **any accent color**: 8 presets or a custom one. Musike adjusts text shades so they stay readable in both themes
- Show or hide panels: the Now Playing panel, playlists in the sidebar, a compact icons-only sidebar, the album column, the background texture, and each section of the Home page
- Responsive from 320 px phones to ultrawide monitors; lock screen, headphone and media key controls (Media Session); picks up the queue where you left off

**Web and PWA**
- Browser and installable PWA on phones, tablets, computers and browser TVs.
- Authenticated accounts synchronize playback across devices with one output per account.
- Friends, owner-controlled groups, live shared playlists and opt-in listening presence.
- Jam rooms share a queue and timeline across accounts; host loss pauses playback until a member claims hosting.
- Public YouTube playlist links import with item progress, resumable checkpoints and duplicate prevention.

**Self-hosting**
- **Docker image** for amd64 and arm64 (Raspberry Pi), with everything inside
- Open it from any device on your network, or from anywhere with Tailscale

**Maintenance**
- **Settings** shows the yt-dlp version, tells you when there's an update and updates it in one click (Stable or Nightly channel)
- Playback errors offer the "Update" button right in the notice

## Screenshots

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/album.jpg" width="440" alt="Nevermind album page with its tracks in order" /><br /><sub>Albums, in their original order</sub></td>
    <td align="center"><img src="docs/screenshots/genre.jpg" width="440" alt="Indie and alternative genre with its artists" /><br /><sub>Browse by genre</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/cinema.jpg" width="440" alt="Cinema mode playing a music video" /><br /><sub>Cinema mode</sub></td>
    <td align="center"><img src="docs/screenshots/search-a-list.jpg" width="440" alt="Search a list: six songs found at once" /><br /><sub>Search a list</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/customize.jpg" width="440" alt="Violet accent color with a compact sidebar" /><br /><sub>Your colors and layout</sub></td>
    <td align="center"><img src="docs/screenshots/mobile.jpg" width="440" alt="Musike on three phone screens" /><br /><sub>On your phone</sub></td>
  </tr>
</table>

## How it works

1. The Fastify server queries YouTube Music through youtubei.js for discovery. yt-dlp and the existing direct fallback resolve media on the server.
2. Audio/video stays behind the same-origin stream proxy. Complete cached audio and HD video support HTTP Range seeking; queue warming prepares upcoming audio.
3. Authenticated users keep private libraries, sessions, imports, shares and jam metadata in SQLite through a dedicated worker. Auth-off installations retain the shared JSON library.
4. React/Zustand drives the browser media elements. The service worker caches artwork, never protected API responses or media streams. A bounded next-track Blob preload can carry one complete audio body through a temporary network interruption.
5. Per-account playback ownership and cross-account jam membership are separate. Device transfers normally require a pause acknowledgement; stale output requires explicit takeover. Host loss pauses a jam rather than choosing a host silently.

## Installation

### Docker

For a home server, NAS or Raspberry Pi. The image (amd64 and arm64) includes yt-dlp, Deno and FFmpeg.

```yaml
# docker-compose.yml
services:
  musike:
    image: musike:local
    ports:
      - "4180:4180"
    volumes:
      - musike-data:/data   # library: playlists, favorites, history
      - musike-cache:/cache # HD videos already downloaded
    restart: unless-stopped
volumes:
  musike-data:
  musike-cache:
```

```bash
docker build -t musike:local .
docker compose up -d   # then open http://<that machine>:4180
```

Or with plain Docker: `docker run -d -p 4180:4180 -v musike-data:/data -v musike-cache:/cache musike:local`. To build the image from source instead: `docker build -t musike .`

- Build this fork through your existing image pipeline. Recreating the container retains the `/data` and `/cache` volumes. Back up data and the instance secret before migrations.
- yt-dlp can also be updated from **Settings** without a new image (until the container is recreated).
- All the [environment variables](#configuration) work, e.g. `YTDLP_EXTRA_ARGS="--cookies /data/cookies.txt"` for YouTube's bot checks.

> **Run it at home, not on a VPS:** YouTube blocks datacenter IPs ("Sign in to confirm you're not a bot"). A home server uses your residential IP.

### Node server + browser

Requirements:

| Tool | Version | Windows |
|---|---|---|
| Node.js | 22.19+ | `winget install OpenJS.NodeJS.LTS` |
| pnpm | 10+ | `corepack enable` |
| yt-dlp | recent | `winget install yt-dlp.yt-dlp` (installs Deno and FFmpeg too) |

```bash
pnpm install
pnpm build   # builds the web app
pnpm start   # http://localhost:4180
```

The server prints its network addresses on start. Open the `Network:` address on a phone on the same Wi-Fi (allow Node through the firewall on private networks). On Windows the server finds yt-dlp even in terminals opened before it was installed, by reading the PATH from the registry.

**Away from home:** install [Tailscale](https://tailscale.com) on the computer and the phone. To install Musike as an app (PWA) on the phone the browser requires HTTPS: run `tailscale serve --bg 4180` and use the `https://...ts.net` address.

### Development

```bash
pnpm dev        # server (4180) + Vite with hot reload (5173)
pnpm typecheck  # checks every package
```

## Moving your library (backup)

Authenticated users now share their playback queue/state across web/PWA devices with one active output. Library export remains the portable backup/transfer mechanism between instances: another browser, PWA or server instance. Native installers have been retired; see `docs/PLATFORM-REMOVAL.md`.

1. On the source, open **Settings > Your data > Export** (or the database icon in the Library). A `musike-backup-YYYY-MM-DD.musike.json` file is saved.
2. On the destination, **Settings > Your data > Import** and pick the file.
3. Check the preview (how many playlists, tracks, favorites) and choose:
   - **Merge with my library** (default): adds what's missing and never deletes. Playlists with the same name get the new tracks; importing twice duplicates nothing.
   - **Replace everything:** makes the library exactly like the backup (asks for confirmation).
4. Optionally, also apply the appearance, language and player preferences.

The file is readable, versioned JSON:

```json
{
  "format": "musike-backup",
  "version": 1,
  "exportedAt": "2026-10-16T22:33:00.000Z",
  "app": "Musike 1.4.0",
  "library": {
    "favorites": [{ "id": "hTWKbfoikeg", "title": "Smells Like Teen Spirit", "artist": "Nirvana", "duration": 302, "thumb": "https://...", "art": "https://...", "kind": "song" }],
    "playlists": [{ "id": "…", "name": "Focus", "createdAt": 1791842422955, "updatedAt": 1791842422955, "tracks": [] }],
    "history": []
  },
  "settings": { "theme": "dark", "lang": "en", "preferVideo": false, "quality": "sd", "autoRadio": true, "volume": 0.9 }
}
```

On import the server validates every track (YouTube ID, sizes, `https://` images only), skips invalid entries instead of rejecting the whole file, and refuses backups from newer versions with a clear message.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` `→` | Back / forward 5 s |
| `Shift` + `←` `→` | Previous / next track |
| `↑` `↓` | Volume |
| `M` | Mute |
| `L` | Favorite the current track |
| `S` | Shuffle |
| `R` | Repeat (off, queue, track) |
| `V` | Switch Audio / Video |
| `F` | Cinema mode |
| `Q` | Queue |
| `/` | Search |
| `?` | Shortcut list |

## Configuration

Server environment variables (all optional):

| Variable | Default | Use |
|---|---|---|
| `PORT` | `4180` | HTTP port |
| `HOST` | `0.0.0.0` | Use `127.0.0.1` to accept only this computer |
| `YTDLP_PATH` | automatic | Forces a specific yt-dlp executable |
| `YTDLP_EXTRA_ARGS` | | Extra flags, e.g. `--cookies-from-browser firefox` |
| `MUSIKE_DATA_DIR` | `server/data` (`/data` in Docker) | Shared JSON when auth off; account DB/secret when on |
| `MUSIKE_CACHE_DIR` | `server/cache` (`/cache` in Docker) | Shared audio/HD cache and working files |
| `MUSIKE_CACHE_MAX_MB` | `2048` | Video cache limit (least recently played go first) |
| `MUSIKE_BIN_DIR` | | Private tools folder for server-managed media tools |
| `MUSIKE_LANG` | `en` | YouTube Music language when a request doesn't say (the app always sends the chosen language) |
| `MUSIKE_LOCATION` | `BR` | Region for YouTube Music results |

## API

Every route answers JSON. Errors look like `{ "error": "message", "code"?: "tool_missing" | "maybe_outdated" | "bot_check" }`, with the message in the language of the `x-musike-lang` request header (`en` or `pt-BR`).

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/search?q=&type=song\|video` | Search YouTube Music |
| `GET` | `/api/search/albums?q=` | Search albums |
| `GET` | `/api/suggest?q=` | Search suggestions |
| `GET` | `/api/radio/:id` | Related tracks (radio) |
| `GET` | `/api/genres` | YouTube Music genres |
| `GET` | `/api/genres/:gid` | A genre's artists and songs |
| `GET` | `/api/genres/:gid/artists?offset=` | More of a genre's artists ("Load more") |
| `GET` | `/api/artists/:aid` | An artist's greatest hits, albums and singles |
| `GET` | `/api/albums/:alid` | An album's tracks in order |
| `GET` | `/api/video-for/:id?title=&artist=&duration=` | A song's official music video |
| `POST` | `/api/prepare/:id` | Resolves a stream before playing |
| `GET` | `/api/stream/:id/audio` | Audio with HTTP Range |
| `GET` | `/api/stream/:id/video?q=sd\|hd` | Video with HTTP Range |
| `GET` | `/api/library` | The whole library |
| `PUT` / `DELETE` | `/api/favorites/:id` | Favorite / unfavorite |
| `POST` | `/api/favorites` | Favorite many at once (`{ tracks }`) |
| `POST` | `/api/history` | Records a played track |
| `POST` | `/api/playlists` | Creates a playlist |
| `PATCH` / `DELETE` | `/api/playlists/:pid` | Renames / deletes |
| `POST` / `DELETE` | `/api/playlists/:pid/tracks[/:id]` | Adds (one track or `{ tracks }`) / removes a track |
| `POST` | `/api/library/import` | Imports a backup (`{ backup, mode: "merge" \| "replace" }`) |
| `GET` | `/api/system` | yt-dlp, Deno and FFmpeg versions and downloads |
| `POST` | `/api/system/ytdlp` | Updates or installs yt-dlp (`{ channel: "stable" \| "nightly" }`) |

## Project structure

| Path | Responsibility |
| --- | --- |
| `server/src/` | Fastify APIs, authentication, worker database, media, imports, sharing and jams |
| `server/test/` | Regression and integration fixtures |
| `web/src/` | React views, reusable components, Zustand player, browser coordination and typed translations |
| `web/public/` | PWA manifest assets and icons |
| `services/discord-presence/` | Optional authenticated server-side Social SDK adapter |
| `deploy/` | Existing operator deployment helpers, including the retained yt-dlp wrapper |
| `docs/` | Design, operational verification and retirement notes |
| `Dockerfile` | Server and web/PWA image |

**Stack:** TypeScript, Fastify, SQLite worker RPC, youtubei.js, yt-dlp, React, Vite, Tailwind, Zustand and React Router. The supported product is web/PWA only.

**Design:** the identity (the equalizer M mark, the Volt color, Geist) and the layout rules are in [docs/design-system.md](docs/design-system.md). The UX study behind the layout is in [docs/ux-benchmark.md](docs/ux-benchmark.md).

**Adding a language:** copy `web/src/i18n/pt.ts`, translate it (TypeScript fails the build if a key is missing), list it in `web/src/i18n/index.ts`, and add the server messages in `server/src/i18n.ts`.

## Troubleshooting

**Songs stopped playing, or "YouTube refused the stream"**
YouTube changes often and yt-dlp keeps up. Open **Settings** and click **Update**. If the fix hasn't reached the Stable channel yet, pick **Nightly**.

**"YouTube is asking this connection to prove it's not a bot"**
YouTube asks this of some connections, mostly VPNs and shared networks (offices, universities, some providers). Musike first tries to get the audio another way, so you only see this message when that fails too.

- If you use a VPN, turn it off and try again.
- Running the server yourself, you can pass cookies from a signed-in browser (Firefox works best on Windows). YouTube may flag an account used this way, so prefer one you don't mind losing:

```bash
YTDLP_EXTRA_ARGS="--cookies-from-browser firefox" pnpm start
```

In Docker, export a `cookies.txt` into the data volume and set `YTDLP_EXTRA_ARGS="--cookies /data/cookies.txt"`.

**"yt-dlp wasn't found"**
Use **Install** in Settings when available, or install it on the server with `winget install yt-dlp.yt-dlp` or set `YTDLP_PATH`.

**Video takes a while to start**
Many videos have no combined SD version; the server downloads and merges video and audio before playing (a few seconds the first time, instant after that thanks to the cache).

**"This song has no music video on YouTube"**
Musike only accepts music videos from the artist's own channel, so it never plays covers or wrong versions. The song keeps playing as audio.

**iPhone**
iOS limits background playback for PWAs; Audio mode works better than Video.

## Supported account features

Enable authentication through the existing deployment settings; see [deployment notes](DEPLOYMENT-NOTES.md). Accounts use Malaysian WhatsApp OTP login, private libraries and guarded admin operations. Administrators may edit Malaysian phone numbers directly without OTP; this revokes the user's existing sessions. Permanent deletion requires typed confirmation and preserves sanitized audit evidence.

In **Library**, choose **Import YouTube playlist**. Re-import appends missing playable tracks while retaining Musike edits. In **Social**, exchange friend codes, accept requests, create groups, grant viewer/editor playlist access, or join a jam. Saving a personal copy is explicit and survives later share revocation. Friend presence is off by default; administrator playback visibility is independent.

Jam invitations last 30 minutes. Each account chooses one output device; members may add tracks, while transport controls belong to the host unless guest controls are enabled. An absent host causes a pause and explicit host claim. Foreground alignment targets approximately one second on a stable connection; browser suspension and autoplay restrictions require device acceptance.

## Legal notice

Musike is a project for **personal and educational use**. Playing YouTube content without ads by extracting its streams goes against [YouTube's Terms of Service](https://www.youtube.com/t/terms); public services that did this, such as the Groovy and Rythm bots, were shut down after notices from Google. Don't offer Musike as a public service, don't monetize it, and respect the artists' rights. The project doesn't host, distribute or store YouTube content beyond the temporary local cache of whoever runs it.

## License

[MIT](LICENSE) © 2026 Ernani Neto


## 19 November production revision

Authenticated web/PWA accounts now have synchronized playback state, remote controls and explicit pause-confirmed device transfer. Malaysian OTP entry normalizes to +60 and rejects foreign numbers; existing identity migration stops safely on conflicts. Structured container diagnostics support the post-handoff stall investigation. The optional authenticated Discord service requires operator-provided SDK binaries; Hermes previously deployed the CA fix and the user confirmed working presence. This package removes temporary SDK file logging and requires a deployment regression check.

See [Hermes verification](docs/HERMES-VERIFICATION.md), [Discord service](services/discord-presence/README.md), [platform retirement](docs/PLATFORM-REMOVAL.md) and [Cloudflare audit prompt](docs/CF-TUNNEL-AUDIT-PROMPT.md). This is source delivery, not a production deployment or a claim of physical-device/vendor acceptance.
