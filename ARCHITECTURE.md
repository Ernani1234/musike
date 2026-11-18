# Musike Architecture

## 1. System Overview & Stack Rules

This reference describes the audited source delivered on 18 November 2026, based on the uploaded Musike 1.5.1 archive plus the initial and follow-up implementation fixes. It does not describe the current upstream GitHub branch.

Musike is a personal music player using YouTube/YouTube Music discovery and playback. The workspace contains a Fastify server, a React web application/PWA, an Electron desktop wrapper, and Capacitor Android/iOS applications. There is no FastAPI service or SQLite database in this repository.

| Layer | Declared technology |
| --- | --- |
| Workspace | TypeScript, ESM, pnpm workspaces; packageManager is pnpm@10.14.0 |
| Server | Fastify 5.12.5, @fastify/static 10.1.6, youtubei.js 18.1.0 |
| Web | React/React DOM 19.3.0, React Router 8.4.0, Zustand 5.0.15 |
| Styling/build | Tailwind CSS 4.3.3, Vite 8.3.4, Motion 14.1.0, Phosphor icons, Geist fonts |
| Desktop | Electron 44.7.0, electron-builder 26.15.3, esbuild bundles |
| Mobile | Capacitor 8.5.3; Android Java and iOS Swift bridges |
| Media tools | yt-dlp resolves/downloads; Deno supports its JS challenges; FFmpeg merges HD video |
| Persistence | Whole-library JSON file plus device-local preferences and playback state |

Interaction boundaries:

- Web/desktop views call the `api` facade in `web/src/lib/api.ts`; it implements `MusikeApi` from `apiTypes.ts`.
- `server/src/app.ts` validates HTTP inputs and wires routes to library, discovery, streaming, and system modules.
- Platform-independent `library.ts`, `browse.ts`, `search.ts`, `cache.ts`, `directAudio.ts`, `i18n.ts`, and `types.ts` are also reachable from the native build. Keep Node-only storage/process work outside those shared modules.
- Vite native mode replaces the HTTP facade, server configuration, and yt-dlp module with native implementations/shims. Standalone mobile does not run a Fastify server.
- An optional `MUSIKE_SERVER_URL` makes the mobile WebView load a hosted instance instead of bundled standalone assets.
- The HTTP service has one shared library and no application authentication or user ownership model. The file store and module-level state assume one owning process; multiple workers do not coordinate writes.
- Keep the existing full-library API for backups. The new paginated track endpoint is additive; the current UI still loads the full library.

Commands: `pnpm dev`, `pnpm build` (web only), `pnpm start`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @musike/server bundle`, `pnpm --filter @musike/web build:native`, and `pnpm --filter musike-desktop bundle`.

Runtime defaults are port 4180, host `0.0.0.0`, server-relative `data/` and `cache/`, and `web/dist`. Environment overrides are `PORT`, `HOST`, `LOG_LEVEL`, `YTDLP_PATH`, `YTDLP_EXTRA_ARGS`, `MUSIKE_DATA_DIR`, `MUSIKE_CACHE_DIR`, `MUSIKE_CACHE_MAX_MB` (2048), `MUSIKE_WEB_DIST`, `MUSIKE_BIN_DIR`, `MUSIKE_LANG` (en), and `MUSIKE_LOCATION` (BR). Extra yt-dlp arguments are split on spaces, not parsed as shell quoting.

Docker builds target Node 22, serve `/app/web`, and persist `/data` and `/cache`. Electron sets profile-specific data/cache/bin paths before importing server configuration and listens on loopback, preferring port 4280 with up to ten port attempts.

## 2. Directory Tree & File Responsibilities

Condensed source tree; dependency directories and native resource/build-system details are omitted. The audit added test coverage, bounded-work/cache helpers, frontend state/paging/persistence helpers, and the root reference/report files.

    musike-main/
    |-- package.json
    |-- pnpm-workspace.yaml
    |-- pnpm-lock.yaml
    |-- README.md
    |-- ARCHITECTURE.md
    |-- PERFORMANCE_AUDIT.md
    |-- IMPLEMENTATION_SUMMARY.md
    |-- Dockerfile
    |-- docker-compose.yml
    |-- .github/workflows/
    |   |-- docker.yml
    |   `-- release.yml
    |-- server/
    |   |-- package.json
    |   |-- tsconfig.json
    |   |-- scripts/bundle.mjs
    |   |-- src/
    |   |   |-- index.ts
    |   |   |-- app.ts
    |   |   |-- config.ts
    |   |   |-- library.ts
    |   |   |-- libraryFile.ts
    |   |   |-- search.ts
    |   |   |-- browse.ts
    |   |   |-- cache.ts
    |   |   |-- taskQueue.ts
    |   |   |-- process.ts
    |   |   |-- range.ts
    |   |   |-- directAudio.ts
    |   |   |-- ytdlp.ts
    |   |   |-- stream.ts
    |   |   |-- system.ts
    |   |   |-- tools.ts
    |   |   |-- bootstrap.ts
    |   |   |-- unzip.ts
    |   |   |-- i18n.ts
    |   |   `-- types.ts
    |   `-- test/
    |       |-- library.test.ts
    |       |-- cache.test.ts
    |       |-- http.test.ts
    |       |-- unzip.test.ts
    |       |-- frontend-state.test.ts
    |       |-- jobs.test.ts
    |       |-- delivery.test.ts
    |       |-- media-cache.test.ts
    |       `-- system.test.ts
    |-- web/
    |   |-- index.html
    |   |-- vite.config.ts
    |   |-- tsconfig.json
    |   |-- tsconfig.native.json
    |   |-- public/
    |   `-- src/
    |       |-- main.tsx
    |       |-- App.tsx
    |       |-- styles.css
    |       |-- components/
    |       |-- views/
    |       |-- hooks/
    |       |-- lib/
    |       |-- stores/
    |       |-- player/player.ts
    |       |-- i18n/
    |       |-- native/
    |       `-- tv/
    |-- desktop/
    |   |-- package.json
    |   |-- tsconfig.json
    |   |-- scripts/bundle.mjs
    |   |-- build/
    |   `-- src/
    |       |-- main.mts
    |       |-- preload.ts
    |       |-- backup.ts
    |       `-- splash.html
    |-- mobile/
    |   |-- package.json
    |   |-- capacitor.config.ts
    |   |-- streaming.json
    |   |-- scripts/
    |   |-- android/
    |   `-- ios/
    `-- docs/
        |-- design-system.md
        |-- ux-benchmark.md
        `-- screenshots/

| File/group | Responsibility and boundary |
| --- | --- |
| server/src/index.ts | CLI startup and local/network/tool diagnostics; calls startServer |
| app.ts | createApp builds routes/static handling without listening; startServer discovers tools, builds the app, listens and starts cache pruning; close terminates media work before closing Fastify |
| config.ts | Environment/path configuration evaluated on import |
| library.ts | Shared library state, single-flight initial load, sanitization, mutations, backup merge/replace, filtered track pages, serialized persistence with same-turn save coalescing |
| libraryFile.ts | Node filesystem implementation of LibraryStorage; async reads and temp-file rename writes |
| search.ts | Language-specific Innertube sessions, search fallbacks, suggestions, radio, video matching |
| browse.ts / cache.ts | Genre/artist/album discovery; bounded TTL promise memoization shared with video matching |
| directAudio.ts | Direct YouTube audio resolution and remotely configurable client list |
| ytdlp.ts | Process execution, format selection, resolve coalescing/cache, HD downloads, disk-cache eviction, maintenance barrier |
| stream.ts / range.ts | Upstream proxy and exact single-range local-file serving; malformed/multipart ranges fall back to full responses |
| taskQueue.ts / process.ts | FIFO admission control, bounded stdout/stderr capture, process deadlines, shutdown and termination escalation |
| tools.ts / bootstrap.ts / unzip.ts | Tool lookup, install/download progress, ZIP extraction; ZIP inflation is asynchronous |
| system.ts / i18n.ts / types.ts | Tool update jobs/coalesced version and release checks; translated server messages; track/library/error contracts |
| server/test/*.test.ts | Storage concurrency/recovery, optimistic frontend ordering, backup ordering, player persistence, job/process bounds, cache behavior, media ranges, static assets and ZIP regressions |
| web/index.html / main.tsx | Pre-paint theme/language/accent settings; React root, BrowserRouter, PWA registration, CSS/fonts and TV startup |
| App.tsx / lib/routes.ts | Application shell, lazy route table, global dialogs/player surfaces; canonical paths and legacy redirects |
| views/Home.tsx, Library.tsx, Collection.tsx | Dashboard, library listing, shared playlist/favorites/history page |
| views/Search.tsx, BatchSearch.tsx | Search/link handling; multi-term search with max 50 terms and three concurrent workers |
| views/Genre.tsx, Artist.tsx, Album.tsx | Remote browse pages; genre artist continuation; selectable songs/releases |
| components/TrackList.tsx, Selection.tsx, Queue.tsx | Paged standard/selectable track rows and current/upcoming queue; all retain complete playback/selection context |
| ListPager.tsx | Translated previous/next/range controls shared by track, selection and queue views |
| Artwork.tsx, Cover.tsx, AlbumTiles.tsx, GenrePanel.tsx | Lazy/fallback artwork, collection mosaics and browse tiles |
| IconButton.tsx, Page.tsx, Modal.tsx, Slider.tsx, Brand.tsx | Shared UI primitives and layout/branding |
| Controls.tsx, PlayerBar.tsx, NowPlaying.tsx, Video.tsx | Playback controls, responsive player surfaces, shared video presentation/theater |
| Rail.tsx, MobileChrome.tsx, TitleBar.tsx | Desktop rail, phone chrome, Electron title bar |
| Dialogs.tsx, TrackMenu.tsx, SettingsDialog.tsx, CustomizeSection.tsx, BackupSection.tsx, Toasts.tsx | Dialogs, actions, settings, appearance, backup controls and notifications |
| hooks/useRemote.ts, useMediaQuery.ts, useShortcuts.ts | Bounded session data memo/abort guard, viewport matching, keyboard controls |
| hooks/useListPage.ts / useRouteScroll.ts | 100-row paging with session page memory; history scroll restoration after deferred route/data layout, cancelled on user input |
| lib/api.ts, apiTypes.ts, types.ts | HTTP implementation, platform facade contract, frontend data types; some data types are duplicated from server modules |
| lib/audio.ts, backup.ts, accent.ts, desktop.ts, format.ts | Audio abstraction including iOS AVPlayer bridge; portable backup/preferences; color generation; Electron bridge; formatting helpers |
| stores/library.ts / libraryState.ts | Browser dependency wiring and injectable library store; ordered requests with pending optimistic operations replayed over confirmed state |
| lib/optimisticQueue.ts, sessionCache.ts, trackIds.ts, playerPersistence.ts | Ordered optimistic reconciliation; capacity/TTL session cache; weakly retained membership indexes; compatible cached playback serialization |
| stores/ui.ts, appearance.ts, system.ts | Dialogs/theme/toasts; device appearance; tool status/update polling |
| player/player.ts | Playback state machine, queue/radio, media events, prefetch, persistence and media-session integration |
| i18n/en.ts, pt.ts, index.ts | Typed English/Portuguese frontend messages and language store |
| native/api.ts, storage.ts, streams.ts | In-device API facade, Capacitor JSON storage, platform audio resolution |
| native/http.ts, android.ts, media.ts, ytplayer.ts, shims/ | Native transport, Android setup/TV detection, OS media controls, iOS resolver bridge and build substitutions |
| tv/tvMode.ts / tv/tv.css | Spatial D-pad navigation and scoped television presentation |
| desktop/src/* | Electron window/server lifecycle, IPC preload, update-time backups, localized startup progress UI |
| mobile/android/.../android/*.java | MainActivity, MusikeDevicePlugin, MusikePlaybackPlugin and PlaybackService native integration |
| mobile/ios/App/App/*.swift | App/scene lifecycle, WebView controller, MusikeYouTube resolver, MusikePlayback and MusikeAudio bridges |
| Build scripts/workflows | Vite/esbuild outputs, Electron packages, APK/IPA builds, Docker publishing and draft GitHub releases |

Generated outputs include `web/dist`, `web/dist-native`, `server/dist/server.mjs`, `desktop/dist`, and release packages. They are not the source of truth.

## 3. Dependency & Wiring Map

Backend flows:

- index.ts or Electron main.mts -> startServer -> refreshTools + createApp -> Fastify listen.
- Library routes -> library.ts -> LibraryStorage -> libraryFile.ts -> library.json.tmp -> rename to library.json.
- Discovery routes -> search.ts/browse.ts -> youtubei.js -> YouTube Music/YouTube. Search falls back from Music to ordinary YouTube search to yt-dlp search.
- prepare/stream routes -> ytdlp.ts -> yt-dlp child process; eligible resolution failures fall back through directAudio.ts -> YouTube. Deno/FFmpeg support media tooling.
- Audio/SD video -> stream.ts -> upstream fetch -> streamed response. HD or unavailable SD -> downloadHd -> cached MP4 -> serveFile.
- System routes -> system.ts -> version/release checks and a shared update/install job -> bootstrap/tools/ytdlp maintenance handling.
- directAudio.ts reads client configuration from the upstream repository's `mobile/streaming.json` URL; a fork does not automatically change that URL.

Frontend flows:

- main.tsx -> App.tsx -> lazy views/components -> Zustand stores and/or api facade.
- Collection/Library/Home -> stores/library.ts/libraryState.ts -> OptimisticQueue -> HTTP library/favorite/playlist/history routes.
- Search/BatchSearch/Genre/Artist/Album/GenrePanel -> api discovery methods; useRemote supplies genre/artist/album memoization. Search has its own request effects.
- player/player.ts -> api.prepare/radio/videoFor + streamSource -> audio abstraction/video element. Record plays -> library store -> history endpoint.
- SettingsDialog/BackupSection -> system store or lib/backup.ts -> ordered library store import + refresh -> system/library/import routes. Import is serialized with mutations so an older response cannot overwrite the restored library.
- Native build swaps facade and Node-only modules at Vite resolution time; shared domain functions use nativeStorage/nativeFetch. iOS resolution/audio/media control also use Swift message bridges.

All paths below are relative to the same HTTP origin. JSON facade requests send `x-musike-lang: en|pt-BR`; media elements do not generally set this header. Known HttpError values are translated and returned as `{error, code?}`. Codes include tool_missing, maybe_outdated, bot_check, and server_busy; admission overload/shutdown returns 503/server_busy. Framework validation errors also use the shared handler.

| Method and path | Query/body | Success response; implementation/caller |
| --- | --- | --- |
| GET /api/health | None | {ok:true}; app; Docker healthcheck |
| GET /api/system | None | {ytdlp,deno,ffmpeg,canInstall,downloads,job}; systemInfo; system store |
| POST /api/system/ytdlp | {channel?:"stable" or "nightly"}; otherwise stable | Translated Job; startJob; updateYtdlp |
| GET /api/search | q required, type=video selects videos, otherwise songs | {tracks:Track[]}; search; Search/BatchSearch |
| GET /api/suggest | q; blank returns empty | {suggestions:string[]}; suggestions; Search |
| GET /api/radio/:id | Video ID | {tracks:Track[]}; radio; player |
| GET /api/genres | None | {genres:Genre[]}; genres; GenrePanel |
| GET /api/genres/:gid | Genre ID | GenrePage; genre; Genre |
| GET /api/genres/:gid/artists | offset integer 0..1000, default 0 | {artists:GenreArtist[],hasMore}; genreArtists; Genre load more |
| GET /api/artists/:aid | Artist ID | ArtistPage; artist; Artist |
| GET /api/albums/:alid | Album ID | AlbumPage; album; Album |
| GET /api/search/albums | q required | {albums:AlbumCard[]}; searchAlbums; Search |
| GET /api/video-for/:id | title required; artist, duration optional | {track:Track or null}; findVideoFor; player |
| POST /api/prepare/:id | No body | {id,title,duration,hasSdVideo}; resolveStreams; player prefetch |
| GET /api/stream/:id/audio | Optional Range header | Proxied media bytes; proxyStream; audio source |
| GET /api/stream/:id/video | q=hd for HD, otherwise SD/fallback; optional Range | Proxied or cached media bytes; player video |
| GET /api/library | None | Library with all tracks; getLibrary; library store and backup export |
| GET /api/library/tracks | kind required: favorites/history/playlist; pid for playlist; offset=0 (0..1000000), limit=100 (1..200), q="" (max 200 chars) | {tracks,total,offset,limit,hasMore}; getTrackPage; additive HTTP endpoint, not used by current MusikeApi/UI |
| POST /api/library/import | {backup:{format:"musike-backup",version,library,...},mode}; replace only when mode="replace", otherwise merge | ImportResult; importLibrary; backup restore |
| PUT /api/favorites/:id | Track; ID must match path | {favorites:Track[]}; addFavorite; library store |
| POST /api/favorites | {tracks:Track[]} first 500 | {favorites:Track[]}; addFavorites; library store/selection |
| DELETE /api/favorites/:id | Video ID | {favorites:Track[]}; removeFavorite; library store |
| POST /api/history | Track | {history:Track[]}; pushHistory; recordPlay |
| POST /api/playlists | {name,tracks?:Track[]} first 500 | Playlist; createPlaylist; library store |
| PATCH /api/playlists/:pid | {name} | Playlist; renamePlaylist; library store |
| DELETE /api/playlists/:pid | None | 204, no body; deletePlaylist; library store |
| POST /api/playlists/:pid/tracks | Track or {tracks:Track[]} first 500 | Playlist; addToPlaylist; library store |
| DELETE /api/playlists/:pid/tracks/:id | Playlist ID and video ID | Playlist; removeFromPlaylist; library store |

DTOs: Genre={id,name}; GenreArtist={id,name,thumb,art,hits:string[]}; GenrePage={id,name,artists,hasMoreArtists,tracks}; AlbumCard={id,title,artist,year,thumb,art}; ArtistPage={id,name,description,banner,tracks,albums,singles}; AlbumPage={id,title,artist,artistId:string|null,kind,info,thumb,art,tracks}. ImportResult contains playlistsAdded, playlistsMerged, tracksAdded, favoritesAdded. Job contains kind,channel,status,startedAt,finishedAt?,from,to,message,log.

Video IDs match 11 characters `[A-Za-z0-9_-]`; artist IDs match `UC` plus 22 word/hyphen characters; album IDs match `MPRE` plus 6..60 word/hyphen characters; genre IDs match 8..120 word/hyphen characters plus up to two trailing equals signs. Search q is trimmed and truncated to 200 characters; suggestions to 100. Import has a 25 MiB body limit. Other routes use Fastify's default body limit.

Genre artists use 40-item pages. Initial genres read two or four source playlists; continuation reads four per round, at most five rounds per request. Genre tracks are capped at 150; artist top tracks at 50. MAX_ARTISTS=600 stops further playlist expansion once reached; one batch can exceed that threshold.

HTML/asset and route wiring:

- web/index.html links `/favicon.svg`, `/apple-touch-icon.png`, mounts `#root`, and imports `/src/main.tsx`.
- main.tsx imports Geist fonts, styles.css and tv/tv.css. TV selectors activate only under html[data-tv="1"], although the stylesheet is imported for all builds.
- Vite generates fingerprinted assets and the PWA manifest/service worker. The PWA caches artwork (600 entries, 30 days), not API responses or streams. Desktop and native modes avoid service-worker registration/use.
- Vite dev/preview proxy `/api` to `http://127.0.0.1:4180`. Production @fastify/static serves config.webDist when it exists; fingerprinted assets under assets/ cache for one year with immutable, while other files use no-cache. Unknown GET paths outside `/api/` fall back to index.html; API 404 responses remain JSON.
- App routes are `/`, `/search`, `/search/list`, `/search/genre/:id`, `/search/artist/:id`, `/search/album/:id`, `/library`, `/favorites`, `/history`, `/playlist/:id`; unmatched frontend paths render Home. lib/routes.ts redirects legacy Portuguese paths/query names/hash. Phone Now Playing uses `#now-playing`.
- Electron loads splash.html, then the local HTTP origin. preload.ts exposes theme/language/retry IPC. Desktop builds copy the splash and icon beside the bundled main/preload scripts.
- Capacitor uses web/dist-native, unless a server URL is configured. Native source changes require the platform build/sync process.

## 4. Database Schema (SQLite)

SQLite is not used. There are no SQL tables, migrations, primary-key constraints, foreign-key constraints, SQL indexes, or database connections to document. The schema below is the actual JSON persistence model, not a proposed SQL design.

| Object | Fields and types | Identity/relationship |
| --- | --- | --- |
| Library | favorites:Track[], playlists:Playlist[], history:Track[] | One library per store; arrays embed full objects |
| Playlist | id:string, name:string, createdAt:number, updatedAt:number, tracks:Track[] | New IDs use crypto.randomUUID(); timestamps use epoch milliseconds; tracks embed Track copies |
| Track | id:string, title:string, artist:string, album?:string, duration:number, thumb:string, art:string, kind:"song" or "video" | id is a YouTube video ID; duration is seconds; no SQL uniqueness/FK constraint |

Node persistence lives at MUSIKE_DATA_DIR/library.json and is replaced through library.json.tmp. Native storage uses Capacitor Directory.Data/library.json with library.tmp.json as its temporary/recovery file. A missing Node file yields an empty library; other read errors and malformed JSON fail loading.

library.ts holds one in-memory state object and a shared initial-load promise. Mutations sharing a microtask turn coalesce into one compact whole-library snapshot and one queued atomic file replacement; their callers await that durable write. A failed write rejects its caller but does not block later writes. In-memory changes are not rolled back on write failure; atomic replacement does not provide multi-process transactions or an fsync durability guarantee.

Sanitization truncates title/artist/album to 300 characters, permits HTTPS artwork URLs up to 500 characters, rounds nonnegative finite durations, and validates track IDs. Playlist names are trimmed to 80 characters. History mutations retain 60 tracks. Backup cleaning reads at most 1000 incoming playlists and keeps at most 5000 cleaned tracks per incoming track list; these are not universal lifetime limits on ordinary mutations or the combined library. Merge matches playlist ID first, then case-insensitive name using pt-BR locale. Bulk playlist additions deduplicate by track ID.

getTrackPage filters title/artist/album case-insensitively in memory and then slices the requested page. It reduces response size; it does not provide indexed lookup or avoid reading/parsing the whole JSON library on initial load.

Other persistence: browser localStorage holds theme/language/appearance/playback/recent-search/client-list settings; playback persistence retains a window of up to 500 tracks containing the active song and the matching original-order subset. It keeps the same one-key JSON format, reuses track-array serialization until references/window change, skips unchanged writes, and checks every four seconds and on pagehide/hidden visibility. Electron keeps window.json, settings.json, version.json and up to five update-time library backups under its userData profile. HD files are cache/<videoId>.720.mp4; the configured cache limit is enforced by asynchronous pruning, not admission control.

## 5. UI & Coding Conventions

- Use the existing React function components and JSX for the application. Keep DOM changes inside React-owned subtrees declarative. The standalone Electron splash uses componentRow(), cached DOM references, textContent, and local progress-width updates.
- Narrow Zustand selectors keep playback position updates out of unrelated views. TrackRow is memoized, receives a stable shared play callback and a favorite boolean, and subscribes to its own current/live state. Collection selects only its relevant playlist/track slice and actions; Home/Library also use field selectors. Selectable/control favorite checks reuse WeakMap-backed ID indexes.
- TrackList and SelectableTrackList mount at most 100 rows per page; QueueList mounts the current row plus at most 100 upcoming rows. Previous/Next controls replace the visible page rather than accumulating DOM rows. Playback and select-all still use full collections. Collection pages retain page identity across favorite edits and back navigation. This is local pagination, not virtual scrolling or network paging.
- useRemote caches up to 60 results for 30 minutes, keyed state prevents flashing a prior entity on key changes, and retry invalidates its memo entry. Keys include entity/language where callers supply them. Aborted effects cannot publish late completions. Its loader is keyed by key/attempt rather than function identity; change the key when the requested resource changes.
- Shared server cached() stores up to 200 promises per memo, expires entries on access, coalesces same-key work while retained, and removes failures. Browse TTLs are 6 hours for genres, 30 minutes for genre/artist state, and 60 minutes for albums. Video matching caches metadata-keyed results for 6 hours. Resolved server media URLs are capped at 200 entries and checked against expiration. Media subprocesses run at most three at once with 32 waiting jobs and a 30-second queue deadline. HD work additionally permits two active and eight waiting jobs. Captured process output is limited to 16 MiB combined, with 45-second resolve/search and ten-minute download execution limits. Termination escalates after two seconds; POSIX children use process groups, while Windows kills the direct child. Shutdown rejects queued media work and terminates active media processes. These limits do not bound every upstream network request.
- SessionCache bounds browser/native retention: clip mappings 200 entries/6h, genre continuation 30 entries/30min, remote page results 60 entries/30min, local list-page memory 60 entries/30min, native resolved audio 200 entries/3h, scroll history 120 entries. Native audio also checks the URL expiration before reuse.
- React.lazy/Suspense defer all eight route views. useRouteScroll observes route/data readiness and size changes for up to five seconds when restoring history; wheel/touch/pointer/key input cancels restoration. Hash-only Now Playing toggles do not reset page scroll.
- CSS source of truth is web/src/styles.css: dark defaults, light overrides, Tailwind @theme inline mappings, base rules and shared component classes. Appearance settings inject custom accent CSS through lib/accent.ts and stores/appearance.ts.

| Token family | Actual variables/defaults |
| --- | --- |
| Surfaces | --bg #0b0c0f; --surface-1 #121318; --surface-2 #181a20; --surface-3 #20232b; --surface-4 #2a2e38 |
| Text | --fg #eceef2; --fg-2 #9ba1ad; --fg-3 #6b717d |
| Accent | --accent/--accent-text #c3ec52; --accent-ink #0b0c0f; --accent-soft rgba equivalent at 12% |
| Other colors | --line, --line-strong, --highlight, --scrim, --danger; light-theme values override them |
| Geometry/motion | --radius-art 10px, --radius-tile 14px, --radius-panel 20px; --ease-out-expo cubic-bezier(0.16,1,0.3,1) |
| Typography | --font-sans Geist Variable; --font-mono Geist Mono Variable; system fallbacks |

- Tailwind utilities use semantic names such as bg-surface-2, text-fg-2, text-accent-text and ring-line. cn() joins class names; it does not resolve conflicting Tailwind utilities. Prefer one utility per property at each breakpoint/state.
- Shared classes include island, island-core, button-secondary, scroll-area, no-scrollbar, safe-top, safe-bottom, overlay-top, drawer-top, app-drag, app-no-drag, kbd, grain, skeleton, eq-bar and eq-live.
- Root data attributes are data-theme=dark/light, data-rail=compact, data-texture=off, and data-tv=1. TV focus colors derive from --accent; hover suppression excludes focused elements.
- docs/design-system.md describes pill/circular controls, 10/14px artwork, 20px panels, tone-based surface depth, and responsive rail/player layouts. Some existing components use literal radii. Scope TV overrides to html[data-tv="1"]; do not turn them into global overrides.
- The wide custom variant applies from 80rem, excluding compact rail/TV modes. The phone/desktop breakpoint is 768px. Modal.tsx documents layers: headers 10, chrome 20, floating video 30, sheet/drawer 40, modal/menu 50, toasts 60.
- Preserve button semantics, translated accessible names, keyboard/TV navigation, artwork lazy decoding/fallbacks, safe-area spacing and reduced-motion behavior. Add frontend strings to both en.ts and pt.ts; server message keys also require both catalogs.
- Treat server and native API implementations as one contract. Do not add Node imports to shared domain modules or bypass the native build substitutions when introducing platform work. The new HTTP-only paging endpoint has no facade/native method yet.
- Validation is pnpm test plus pnpm typecheck and web/native/server/desktop bundle builds as relevant. Native installer/device playback checks require their platform tooling and are separate from TypeScript/build validation.
