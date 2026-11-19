# Musike Architecture

## 1. System Overview & Stack Rules

This reference describes the four-phase fork plus the approved 19 November 2026 BUG-002–006 source fixes, based on uploaded fork main `da3f88384651cdf8ee487054a50b0effb277cb45`. It retains the earlier audit/fallback/deployment work. It does not describe the current upstream GitHub branch. Read DEPLOYMENT-NOTES.md and ACCEPTANCE-CHECKLIST.md before enabling features on demo.

Musike is a personal music player using YouTube/YouTube Music discovery and playback. The workspace contains a Fastify server, a React web application/PWA, an Electron desktop wrapper, and Capacitor Android/iOS applications. The actual backend is Fastify/TypeScript, not FastAPI. Auth-enabled deployments use SQLite in a dedicated worker; auth-off and standalone-native libraries remain JSON.

| Layer | Declared technology |
| --- | --- |
| Workspace | TypeScript, ESM, pnpm workspaces; packageManager is pnpm@10.14.0 |
| Server | Fastify 5.12.5, @fastify/static 10.1.6, youtubei.js 18.1.0 |
| Web | React/React DOM 19.3.0, React Router 8.4.0, Zustand 5.0.15 |
| Styling/build | Tailwind CSS 4.3.3, Vite 8.3.4, Motion 14.1.0, Phosphor icons, Geist fonts |
| Desktop | Electron 44.7.0, electron-builder 26.15.3, esbuild bundles |
| Mobile | Capacitor 8.5.3; Android Java and iOS Swift bridges |
| Media tools | yt-dlp resolves/downloads; Deno supports its JS challenges; FFmpeg merges HD video |
| Persistence | Auth off: shared JSON. Auth on: SQLite WAL worker, per-user JSON library rows, users/sessions/settings/import metadata. Device-local preferences and per-user playback state |

Interaction boundaries:

- Web/desktop views call the `api` facade in `web/src/lib/api.ts`; it implements `MusikeApi` from `apiTypes.ts`.
- `server/src/app.ts` validates HTTP inputs and wires routes to library, discovery, streaming, and system modules.
- Platform-independent `library.ts`, `browse.ts`, `search.ts`, `cache.ts`, `directAudio.ts`, `i18n.ts`, `taskQueue.ts`, and `types.ts` are also reachable from the native build. Keep Node-only storage/process work outside those shared modules.
- Vite native mode replaces the HTTP facade, server configuration, and yt-dlp module with native implementations/shims. Standalone mobile does not run a Fastify server.
- An optional `MUSIKE_SERVER_URL` makes the mobile WebView load a hosted instance instead of bundled standalone assets.
- `AUTH_ENABLED` is off unless exactly true: legacy HTTP/shared-library behavior remains. When on, a hard API/login wall scopes every library operation to the authenticated user; instance settings/tool actions are admin-only. Invite approval precedes account creation. SQLite and cached library snapshots assume one owning application process; do not scale replicas over the same data directory.
- Keep the existing full-library API for backups. The new paginated track endpoint is additive; the current UI still loads the full library.

Commands: `pnpm dev`, `pnpm build` (web only), `pnpm start`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @musike/server bundle`, `pnpm --filter @musike/web build:native`, and `pnpm --filter musike-desktop bundle`.

Runtime defaults are port 4180, host `0.0.0.0`, server-relative `data/` and `cache/`, and `web/dist`. Environment overrides are `PORT`, `HOST`, `LOG_LEVEL`, `YTDLP_PATH`, `YTDLP_EXTRA_ARGS`, `MUSIKE_DATA_DIR`, `MUSIKE_CACHE_DIR`, `MUSIKE_CACHE_MAX_MB` (2048), `MUSIKE_WEB_DIST`, `MUSIKE_BIN_DIR`, `MUSIKE_LANG` (en), and `MUSIKE_LOCATION` (BR). Extra yt-dlp environment arguments are split on spaces, not parsed as shell quoting. Admin settings use a JSON argument array. New environment settings and defaults are exhaustively listed in DEPLOYMENT-NOTES.md; persisted media settings override the initial environment defaults when auth is on. Google import is hidden/unavailable without its credentials and HTTPS redirect configuration.

The auth database requires Node 22.13+ for node:sqlite without the older flag. Docker builds target Node 22, serve `/app/web`, and persist `/data` and `/cache`. Electron sets profile-specific data/cache/bin paths before importing server configuration and listens on loopback, preferring port 4280 with up to ten port attempts.

## 2. Directory Tree & File Responsibilities

Condensed source tree; dependency directories and native resource/build-system details are omitted. The audit added test coverage, bounded-work/cache helpers, frontend state/paging/persistence helpers, and the root reference/report files.

    musike-main/
    |-- package.json
    |-- pnpm-workspace.yaml
    |-- pnpm-lock.yaml
    |-- README.md
    |-- ARCHITECTURE.md
    |-- AGENTS.md
    |-- CHANGELOG.md
    |-- DEPLOYMENT-NOTES.md
    |-- DATABASE-DECISION.md
    |-- IMPLEMENTATION-PLAN.md
    |-- ACCEPTANCE-CHECKLIST.md
    |-- TEST-RESULTS.md
    |-- HERMES_FOUND_BUGS.md
    |-- BUGFIX-IMPACT.md
    |-- DOCUMENTATION-SYNC.md
    |-- DEMO-VERIFICATION.md
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
    |   |   |-- accountRoutes.ts
    |   |   |-- accounts.ts
    |   |   |-- adminRoutes.ts
    |   |   |-- db.ts
    |   |   |-- secret.ts
    |   |   |-- proxy.ts
    |   |   |-- promote.ts
    |   |   |-- audioCache.ts
    |   |   |-- cacheBudget.ts
    |   |   |-- googleImport.ts
    |   |   |-- googleSource.ts
    |   |   |-- importMatching.ts
    |   |   |-- playbackDiagnostics.ts
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
    |       |-- accounts.test.ts
    |       |-- admin.test.ts
    |       |-- audio-cache.test.ts
    |       |-- google-import.test.ts
    |       |-- import-matching.test.ts
    |       |-- cold-audio.test.ts
    |       |-- playback-diagnostics.test.ts
    |       |-- player-lifecycle.test.ts
    |       |-- resolve-cancellation.test.ts
    |       |-- direct-client-cache.test.ts
    |       |-- wrapper.test.ts
    |       |-- playback-queue.test.ts
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
| server/src/index.ts | CLI startup or bundled `promote` subcommand; local/network/tool diagnostics; calls startServer |
| app.ts | createApp wires account/admin/Google/media/library routes and static handling without listening; startServer discovers tools, builds the app, listens and starts cache pruning; close terminates media work before closing Fastify |
| config.ts | Environment/path defaults evaluated on import; media settings can be applied at runtime |
| accountRoutes.ts / accounts.ts | API auth/CSRF boundary, OTP/wasphere, invites, roles, migration, sessions, per-user library storage and presence; SQL is parameterized and owner-scoped |
| db.ts / secret.ts | Worker-confined SQLite schema/RPC/transactions; HMAC and owner-context AES-GCM; persisted instance-secret generation |
| proxy.ts / promote.ts | Explicit IP/CIDR proxy trust and shared real-IP resolution; grant/revoke admin CLI, usable in the single-file production bundle |
| audioCache.ts / cacheBudget.ts | Complete upcoming audio-byte downloads, first-ready primary/direct candidates, bounded/cancellable windows and revisions; shared managed-file accounting/reservations, queue priority and active response leases |
| adminRoutes.ts | Admin-only validated/persisted media/OTP settings, users, invites, audit/presence/cache/error ops |
| importMatching.ts / playbackDiagnostics.ts | Pure Unicode/multi-signal ranking; server AsyncLocalStorage trace context and field-allowlisted stage events |
| googleSource.ts / googleImport.ts | Dedicated import-only Music/public API source adapter; OAuth/PKCE, encrypted credentials, original-ID validation and scored fallback matching, live owner progress/delta reports, origin/idempotent maps, bounded jobs/reports and opt-in daily scheduler |
| library.ts | Browser-safe createLibrary factory; legacy facade plus isolated per-user instances; single-flight initial load, sanitization, mutations, backup merge/replace, filtered track pages, serialized persistence with same-turn save coalescing |
| libraryFile.ts | Node filesystem implementation of LibraryStorage; async reads and temp-file rename writes |
| search.ts | Language-specific Innertube sessions, search fallbacks, suggestions, radio, video matching |
| browse.ts / cache.ts | Genre/artist/album discovery; bounded TTL promise memoization shared with video matching |
| directAudio.ts | Direct YouTube audio resolution and remotely configurable client list |
| ytdlp.ts | Process execution, format selection, resolve coalescing/cache, HD downloads, disk-cache eviction, maintenance barrier |
| stream.ts / range.ts | Upstream proxy and exact single-range local-file serving; malformed/multipart ranges fall back to full responses |
| taskQueue.ts / process.ts | FIFO admission control, bounded stdout/stderr capture, process deadlines, shutdown and termination escalation |
| tools.ts / bootstrap.ts / unzip.ts | Tool lookup, install/download progress, ZIP extraction; ZIP inflation is asynchronous |
| system.ts / i18n.ts / types.ts | Tool update jobs/coalesced version and release checks; translated server messages; track/library/error contracts |
| server/test/*.test.ts | Matching/progress/trace/probe/ownership/wrapper/player lifecycle fixtures plus storage concurrency/recovery, optimistic frontend ordering, backup ordering, player persistence, job/process bounds, cache behavior, media ranges, static assets and ZIP regressions |
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
| player/player.ts | Playback state machine; proactive radio filling, current/upcoming queue warming, repeat wrap, cancellation/skip guards, per-user persistence and session-loss media shutdown |
| lib/playbackDiagnostics.ts / playbackRecovery.ts | Browser trace/ring buffer/redirect classification/telemetry and bounded radio retry helpers; no Node imports |
| lib/playbackQueue.ts | Pure ordered/deduplicated upcoming-track window including repeat-all wrap |
| components/AuthGate.tsx / stores/session.ts | Initial account bootstrap/hard login UI before lazy App mounts; OTP forms, presence/role updates and shared 401 signal |
| components/AccountPanel.tsx / AdminPanel.tsx | Account/logout, bounded import report and opt-in Google actions; lazy admin settings/users/ops. Use existing tokens/primitives |
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
- Auth off: library routes -> legacy library.ts facade -> libraryFile.ts -> atomic library.json replacement. Standalone native uses its existing Capacitor storage adapter.
- Auth on: accountRoutes resolves trusted client IP, validates same-origin write marker, authenticates/refreshes cookies and enforces API login. Library routes -> accounts.library(user.id) -> isolated createLibrary instance -> SQLite libraries row by user_id -> worker RPC. Roles/status are read from the DB on authenticated requests.
- Startup -> Accounts.open -> backed-up/transactional shared-library migration. ADMIN_PHONE becomes admin only at its first successful bootstrap OTP verification; CLI can explicitly provision/promote an alternative admin.
- OTP -> account + resolved-IP rate/cooldown locks -> hashed challenge -> one wasphere POST. Verify -> timing-safe HMAC comparison + expiry/attempt/invite/approval checks -> hashed secure session cookies. Logout/disable revoke sessions.
- Admin routes -> role check/audit log -> persisted settings/users -> runtime media defaults and cache trimming. Presence -> sessions/users/clients -> latest-45-second dashboard. Untrusted forwarded headers do not override socket IP.
- Google connect -> owner-bound encrypted PKCE state -> Google consent -> matching authenticated callback -> encrypted per-user refresh tokens. Manual or individually opted-in daily job -> dedicated Music import adapter/public API fallbacks -> title/artist resolver -> owner library + batched import_items mappings + bounded report. These credentials never enter playback/discovery.
- Discovery routes -> search.ts/browse.ts -> youtubei.js -> YouTube Music/YouTube. Search falls back from Music to ordinary YouTube search to yt-dlp search.
- prepare/stream routes -> ytdlp.ts -> yt-dlp child process; eligible resolution failures fall back through directAudio.ts -> YouTube. Deno/FFmpeg support media tooling.
- Queue prepare -> AudioCache -> concurrently prepare primary and direct fallback URL candidates -> race usable first bytes -> download a successful complete audio body -> atomic audio cache publish. Warm audio -> serveFile with Range and lease, no URL resolution. Cold audio -> openAudioSource first-usable-byte primary/direct race -> proxy; SD video -> existing proxy; HD or unavailable SD -> downloadHd -> cached MP4 -> serveFile. Shared cache accounting includes HD, audio metadata and partial files; HD merge/prune is not a hard filesystem quota.
- System routes -> system.ts -> version/release checks and a shared update/install job -> bootstrap/tools/ytdlp maintenance handling.
- directAudio.ts reads client configuration from the upstream repository's mobile/streaming.json URL; a fork does not automatically change that URL. Server callers use cached/default clients immediately and coalesce the six-hour advisory refresh; a failed stale/default choice can wait for that refresh and retry a changed client list once within the caller deadline.

Frontend flows:

- main.tsx -> AuthGate -> authenticated/auth-off lazy App -> lazy views/components -> Zustand stores/api facade. Hosted native shells load this same web origin. Standalone native mode bypasses the account bootstrap and retains its in-device backend.
- Collection/Library/Home -> stores/library.ts/libraryState.ts -> OptimisticQueue -> HTTP library/favorite/playlist/history routes.
- Search/BatchSearch/Genre/Artist/Album/GenrePanel -> api discovery methods; useRemote supplies genre/artist/album memoization. Search has its own request effects.
- player/player.ts -> api.playbackSettings/prefetch (including readyIds)/radio/videoFor + streamSource -> audio abstraction/video element. Queue/index/manual/optimistic edits and 30-second active heartbeats renew the warming window; radio extends before the configured tail threshold. Repeat-all wraps lookahead; repeat-one has none. Server depth is authoritative. Ready upcoming audio may buffer in a spare browser media element before handoff; native/iOS bridge behavior stays separate. Record plays -> library store -> history endpoint.
- SettingsDialog/BackupSection -> system store or lib/backup.ts -> ordered library store import + refresh -> system/library/import routes. Import is serialized with mutations so an older response cannot overwrite the restored library.
- Native build swaps facade and Node-only modules at Vite resolution time; shared domain functions use nativeStorage/nativeFetch. iOS resolution/audio/media control also use Swift message bridges.

All paths below are relative to the same HTTP origin. JSON facade requests send `x-musike-lang: en|pt-BR` and `x-musike-request: 1`; auth writes also require an allowed Origin when present. Authenticated responses use secure same-origin cookies. New timing headers are x-musike-request-id and x-musike-trace; media URLs carry a non-secret UUID trace query. JSON fetches handle redirects manually. Every /api response is no-store; media elements do not generally set this header. Known HttpError values are translated and returned as `{error, code?}`. Codes include tool_missing, maybe_outdated, bot_check, and server_busy; admission overload/shutdown returns 503/server_busy. Framework validation errors also use the shared handler.

| Method and path | Query/body | Success response; implementation/caller |
| --- | --- | --- |
| GET /api/health | None | {ok:true}; app; Docker healthcheck |
| GET /api/system | None; admin-only with auth on | {ytdlp,deno,ffmpeg,canInstall,downloads,job}; systemInfo; system store |
| POST /api/system/ytdlp | Admin-only with auth on; {channel?:"stable" or "nightly"}; otherwise stable | Translated Job; startJob; updateYtdlp |
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
| GET /api/stream/:id/audio | Optional Range; trace UUID; probe=1 returns owner/trace/video-scoped recent error JSON or {ok:true} without resolving | Cached local or first-byte-raced media; proxyStream; audio source |
| GET /api/stream/:id/video | q=hd for HD, otherwise SD/fallback; optional Range, trace UUID, probe=1 diagnostic JSON | Proxied or cached media bytes; player video |
| GET /api/playback/settings | None | {lookahead,audioQuality,videoQuality,diagnostics}; initial player defaults and opt-in timing mode |
| POST /api/queue/prepare | {clientId,currentId,upcomingIds,revision?}; ID patterns/100 upcoming input cap, depth clipped 0..10 | {accepted:true,lookahead,readyIds}; per-user/client window; older revisions ignored |
| POST /api/playback/events | {events:[{traceId,stage,at,videoId?,ms?,status?,reason?,visibility?,edgeRay?}]}; max 40/16 KiB; normal auth/CSRF wall | 204; enabled diagnostics accept max 240 events/min per user or resolved IP, 128 active keys; 429 on overflow; disabled drops valid batches |
| GET /api/auth/me | Public | {enabled,user,google,admin}; AuthGate |
| POST /api/auth/request | Public; {phone,invite?,remember?} | 202 {challengeId,cooldown,delivery}; phone/IP throttled |
| POST /api/auth/verify | Public; {challengeId,code} | {user}, secure access/refresh Set-Cookie |
| POST /api/auth/logout | Public, CSRF marker when auth on | {ok:true}; server invalidation, cleared cookies |
| POST /api/presence | {clientId}; logged in with auth on | {ok:true,user}; heartbeat/last-seen; auth off {ok:true} |
| GET /api/admin/settings | Admin | {media:{cacheMb,lookahead,audioQuality,videoQuality,ytdlpArgs},otpEnabled,otpExpiry,otpCooldown} |
| PATCH /api/admin/settings | Admin; partial settings/media object | Validated complete settings, persisted and applied |
| GET /api/admin/users | Admin | {users:[id,phone,name,role,status,last_seen]}; ordered, max 200 |
| PATCH /api/admin/users/:id | Admin; {name?,role?,status?} | Updated user; last-admin guard; disable revokes sessions |
| POST /api/admin/invites | Admin; {phone?} | {code,expiresAt}; hash stored, raw code returned once |
| GET /api/admin/ops | Admin | {users,connectedUsers,clients,cache,events,errors}; 100 active clients/50 events/50 errors |
| POST /api/google/connect | Logged in, configured | {url}; Google authorization URL with state/PKCE |
| GET /api/google/callback | {state,code} query plus originating user's cookie | Redirect /library?google=connected; consumes state and stores encrypted tokens |
| GET /api/google/status | Logged in owner; after? integer 0..100000, runId? max 80 chars | {connected,autoSync,lastSync,runId,status,report,itemOffset,itemTotal}; after returns at most 100 new items, cursor belongs only to that owner; never tokens |
| POST /api/google/import | Logged in owner; {} | 202 {runId}; one active/queued run per user |
| POST /api/google/sync | Logged in owner; {enabled:boolean} | {autoSync}; next due after 24h; off aborts automatic work |
| POST /api/google/disconnect | Logged in owner; {} | {ok:true,revoked:boolean}; local delete and one remote revocation attempt |
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

All non-public API routes require login when auth is on. Admin routes return 403 to non-admins (or when accounts are off); Google routes return 404 when unconfigured. Existing library paths operate on the session owner without accepting a client-supplied owner ID. New account/admin/Google labels are English keys under features; Portuguese currently uses those English keys as an explicit fallback.

DTOs: Genre={id,name}; GenreArtist={id,name,thumb,art,hits:string[]}; GenrePage={id,name,artists,hasMoreArtists,tracks}; AlbumCard={id,title,artist,year,thumb,art}; ArtistPage={id,name,description,banner,tracks,albums,singles}; AlbumPage={id,title,artist,artistId:string|null,kind,info,thumb,art,tracks}. ImportResult contains playlistsAdded, playlistsMerged, tracksAdded, favoritesAdded. Google report adds reviewNeeded, item candidates/reasons and progress {phase,processed,total,current?,lastCompleted?,pending?,startedAt,updatedAt}. Item statuses are imported/already-present/not-found/needs-review; candidate suggestions are not automatically imported. Active progress is read from the owner job; report checkpoints are persisted every 20 completed items and on terminal state. Job contains kind,channel,status,startedAt,finishedAt?,from,to,message,log.

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

Auth-enabled storage is `MUSIKE_DATA_DIR/musike.sqlite`. All SQL executes in `db.ts`'s dedicated worker via asynchronous RPC; WAL, FULL synchronous mode, foreign_keys ON, busy_timeout 5000. `batch` uses BEGIN IMMEDIATE/COMMIT with rollback. No SQL runs synchronously on the Fastify event loop. Auth-off normal startup does not open SQLite. The promotion CLI can open it independently.

All integer dates are epoch milliseconds; IDs/hashes/encrypted values are TEXT. FK delete cascades apply where specified. `users.phone` and `sessions.refresh_hash` also have SQLite's UNIQUE indexes. PKs and composite PKs have their corresponding implicit indexes. Explicit index names/columns follow below.

| Table | Actual columns and constraints |
| --- | --- |
| migrations | key TEXT PK; value TEXT NOT NULL. shared-library-v1 stores source hash; first-admin-v1 records bootstrap owner |
| users | id PK; phone NOT NULL UNIQUE; name NOT NULL DEFAULT ''; role NOT NULL DEFAULT user CHECK user/admin; status NOT NULL DEFAULT approved CHECK pending/approved/disabled; created_at NOT NULL INTEGER; last_seen nullable INTEGER |
| libraries | user_id PK, FK users(id) ON DELETE CASCADE; json NOT NULL; updated_at NOT NULL INTEGER |
| invites | hash PK; phone nullable; expires_at NOT NULL INTEGER; used_by nullable FK users(id); created_by NOT NULL FK users(id) |
| otps | id PK; phone/ip/hash NOT NULL; invite_hash nullable TEXT (no FK); expires_at/created_at NOT NULL INTEGER; attempts/consumed/remember NOT NULL INTEGER DEFAULT 0; delivery NOT NULL TEXT |
| sessions | access_hash PK; refresh_hash NOT NULL UNIQUE; access_enc NOT NULL; user_id NOT NULL FK users(id) ON DELETE CASCADE; access_expires/expires_at/created_at NOT NULL INTEGER |
| settings | key PK; value NOT NULL JSON TEXT. media, otpEnabled, otpExpiry, otpCooldown keys are used |
| audit | id INTEGER PK; at NOT NULL INTEGER; actor nullable TEXT (not FK); action NOT NULL; target nullable; ip NOT NULL; level NOT NULL DEFAULT info |
| clients | id PK; user_id NOT NULL FK users(id) ON DELETE CASCADE; session_hash/ip NOT NULL TEXT (session_hash is not a FK); last_activity NOT NULL INTEGER |
| google_tokens | user_id PK FK users(id) ON DELETE CASCADE; encrypted NOT NULL; auto_sync NOT NULL INTEGER DEFAULT 0; last_sync/next_sync nullable INTEGER |
| oauth_states | hash PK; user_id NOT NULL FK users(id) ON DELETE CASCADE; verifier_enc NOT NULL; expires_at NOT NULL INTEGER |
| import_runs | id PK; user_id NOT NULL FK users(id) ON DELETE CASCADE; status NOT NULL; created_at NOT NULL INTEGER; report NOT NULL JSON TEXT |
| import_items | user_id NOT NULL FK users(id) ON DELETE CASCADE; source_id/kind/destination_id NOT NULL; composite PK(user_id,source_id,kind); destination_id refers to domain IDs, not a SQL FK |

| Explicit index | Indexed columns |
| --- | --- |
| users_role_status | users(role,status) |
| otps_phone_time / otps_ip_time | otps(phone,created_at) / otps(ip,created_at) |
| sessions_user / sessions_expiry | sessions(user_id) / sessions(expires_at) |
| audit_time / audit_level_id | audit(at DESC) / audit(level,id DESC) |
| clients_activity | clients(last_activity) |
| google_sync_due | google_tokens(auto_sync,next_sync) |
| import_runs_user_time | import_runs(user_id,created_at DESC) |

Libraries remain JSON snapshots per user rather than normalized song tables:

| Object | Fields / identity |
| --- | --- |
| Library | favorites:Track[], playlists:Playlist[], history:Track[] |
| Playlist | id:string UUID; name:string; createdAt/updatedAt:number; tracks:Track[]; optional origin |
| Track | id:string YouTube ID; title/artist:string; album?:string; duration:number seconds; thumb/art:string; kind:song or video; optional origin |
| Origin | provider:youtube-music; sourceId:string; kind:playlist/album/like/history |

Each `createLibrary` instance coalesces initial loading and serializes/coalesces snapshot writes. Auth-owned instances read/write only their user_id row. Legacy file storage still uses library.json.tmp -> library.json; native storage remains Capacitor Directory.Data/library.json with library.tmp.json recovery. The domain does not roll back in-memory mutations after a storage-write failure, and cached snapshots require one owning app process. SQLite indexes do not make title/artist filtering inside JSON indexed.

Track sanitizer caps title/artist/album at 300 characters, permits HTTPS artwork up to 500 characters, validates IDs and rounds nonnegative duration. Names cap at 80 characters, history at 60 tracks. Backup cleaning caps 1,000 incoming playlists and 5,000 tracks per incoming list. Merge matches ID then case-insensitive name; playlist mutations deduplicate track IDs. Google album markers survive backup cleaning; Google import mappings are per owner/source/kind, loaded in one query per run and persisted in batches after durable library writes. Ordered duplicate occurrences are not representable in the existing playlist model.

Migration copies the original JSON exclusively to library.json.before-auth.bak before transactional ownership assignment/marker. Missing ADMIN_PHONE with existing data, malformed JSON or a conflicting backup stops startup. Original JSON remains unchanged; auth-off rollback does not automatically export later SQLite changes. See DEPLOYMENT-NOTES.md for consistent backups and secret persistence. OTP/session transient cleanup occurs on OTP requests; audit retains latest 1,000 events; import runs retain latest 20 per user. Startup marks interrupted import runs as error while preserving their completed checkpoints; it does not replay them automatically. Last uncheckpointed report items may need a rerun, while durable library/mapping writes remain intact.

Device preferences remain local. Player persistence uses musike:player:<user UUID> when authenticated, the legacy key when auth is off, with a window of 500 tracks containing the active song and matching shuffle subset. Changing accounts reloads the app before initializing private state; the observed unauthorized event stops media and avoids replacing the saved queue with empty state. Desktop ancillary settings/backups remain as before.

Cached audio is <videoId>.audio.bin plus .audio.json MIME/size metadata; HD is <videoId>.720.mp4. Byte warming has two active/16 waiting jobs, full-body validation, atomic publish, per-client need windows (64, 90-second priority TTL), shared reservations and active stream leases. First-byte source acquisition additionally allows eight active/24 queued selections with a five-second queue wait and nominal 20-second total selection budget including wait; each candidate has an eight-second first-byte limit and streaming reads a 30-second inactivity limit. Successful playback is not governed by a first-byte deadline. Source processes retain their existing concurrency/deadlines; shared resolution subprocesses are cancelled only after their last consumer leaves. Budget blockage halts an unchanged window; errors can retry after 30 seconds. HD merging and active leases may temporarily leave disk usage above the configured budget; it is not a hard filesystem quota. Cache is instance-wide public media, not user-private Google content.

## 5. UI & Coding Conventions

- AuthGate must resolve the session before loading App/private library/player modules. Send mutations through the same-origin request helpers; never place tokens in localStorage, URLs or JSX. Treat owner IDs as server session state. Admin visibility alone is not authorization: keep API role checks.
- Keep Node-only SQLite/crypto/provider work in server modules, and SQL exclusively behind the worker RPC. No native dependencies were added; no PostgreSQL service is required. Never put Google credentials into shared discovery or playback.
- Detailed playback diagnostics are enabled only by MUSIKE_PLAYBACK_DIAGNOSTICS=true. A 200-event browser memory ring and a 200-entry/60-second owner-scoped server failure cache are bounded. Timing logs allowlist scalar fields; do not log URLs/headers/provider errors/secrets. Client events are diagnostic claims, not security audit evidence.
- Queue warming must use the server depth, updated optimistic/manual queue order, repeat behavior and stale-request revisions. Radio is extended proactively; cancelled/stale completions cannot overwrite a replacement queue.
- Import UI refreshes the library on completion, uses existing paging for 100 report rows and origin labels, exposes running counts/current/completed activity and needs-review suggestions. It polls active runs every second, fetching at most 100 report deltas; backlog catch-up uses 250ms polling. Unavailable categories remain explicit; private-provider support is not a guaranteed public API contract.
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
- Preserve button semantics, translated accessible names, keyboard/TV navigation, artwork lazy decoding/fallbacks, safe-area spacing and reduced-motion behavior. Add frontend strings to en.ts and pt.ts (the new features group explicitly uses English fallback in pt.ts); server message keys also require both catalogs.
- Treat server and native API implementations as one contract. Do not add Node imports to shared domain modules or bypass the native build substitutions when introducing platform work. The new HTTP-only paging endpoint has no facade/native method yet.
- Validation is pnpm test plus pnpm typecheck and web/native/server/desktop bundle builds as relevant. Native installer/device playback checks require their platform tooling and are separate from TypeScript/build validation.


The 19 November source package includes the explicitly approved deploy/ytdlp-wrap.sh replacement only. Other operator-owned deployment files remain unchanged. The wrapper retries classified transient metadata extraction at most two attempts by default; download/version/update commands pass through. No implicit success sleep exists; explicit legacy YTDLP_DELAY and an optional YTDLP_WRAP_SUCCESS_DELAY override remain operator controls. All new variables/bounds are in DEPLOYMENT-NOTES.md. BUG-004/006 production cause/physical-device acceptance remains pending in HERMES_FOUND_BUGS.md and DEMO-VERIFICATION.md.

## 6. Approved production revision — BUG-007–012 and device sync (19 November 2026)

This section supersedes earlier descriptions where behavior changed. The user approved the evaluated plan before implementation. The default application remains Fastify/TypeScript + React/Zustand/Tailwind; no UI framework, CSS variable, inline style system, dependency version or existing operator environment/compose content changed. Native target deletion is an approved **Hermes follow-up**, documented in docs/PLATFORM-REMOVAL.md; until executed the legacy directories/build substitutions remain and are validated. The optional Discord native adapter is server infrastructure, not a desktop/mobile product.

### Source boundaries and wiring

| File | Ownership |
| --- | --- |
| server/src/phone.ts | Pure Malaysian +60 canonicalization; rejects foreign/invalid input. Accounts re-exports phoneOf so ADMIN_PHONE, OTP/invites and promote share one policy. |
| server/src/accounts.ts | Backed-up/idempotent malaysia-phone-v1 migration before shared-library ownership migration; no UUID/library/role merge. Provider delivery converts canonical +60 to digits only. audit() emits sanitized stdout records through the injected app logger as well as existing SQLite audit rows. |
| server/src/db.ts | Worker-only VACUUM INTO backup RPC; populated existing DB backed up before transactional playback-discord-v1 additive schema. Phone backfill uses the same worker/transaction boundary. Backup file permissions are 0600. |
| server/src/playbackSync.ts | Parameterized owner-keyed persistence and bounded in-process device/command rooms, epoch/sequence rejection and explicit pause-confirmed transfer. |
| server/src/playbackRoutes.ts | Authenticated device registration/commands/state and bounded SSE; revalidates session/status every 15 seconds. Slow SSE readers retain one latest pending view. |
| web/src/lib/playbackSync.ts | Browser-only coordinator with injected Zustand player, per-live-document identity, serial mutations, five-second progress publication, reconnect and small pagehide release. |
| web/src/player/player.ts | Actual media output only on the granted client; suspendOutput cancels work and removes sources before transfer acknowledgement. resumeOutput restores shared queue/position with local media preferences. |
| web/src/components/PlaybackDevices.tsx | Existing Modal/buttons and semantic utilities for device status and explicit transfer; used by Controls/AccountPanel. No new DOM IDs or root data attributes. |
| server/src/discord.ts / discordRoutes.ts | Owner-bound OAuth/PKCE, encrypted tokens, uniqueness of linked Discord identity, refresh/revoke and authenticated internal service delivery. Credentials never enter browser state, discovery, yt-dlp, Google or media resolution. |
| services/discord-presence/service.mjs / worker.cpp | Private bearer-authenticated HTTP boundary, bounded one-process-per-user C++ Social SDK adapter using authenticated Connect. No vendor files are supplied; SDK compilation/headless/multi-user eligibility remains operator verification. |
| web/src/components/DiscordSection.tsx | Optional link/unlink and honest service readiness in AccountPanel; typed labels in en.features, with pt.features explicitly inheriting that catalog. |

App startup: registerAccounts → registerPlayback → registerDiscord → existing admin/Google wiring. AuthGate still resolves the owner before lazy App/player state; App starts sync only for an authenticated user. Auth-off and standalone native retain their existing local/shared behavior. No replica/process scaling was added. Optional Discord absence never blocks playback/login.

### Added HTTP contracts

All paths use the existing login/CSRF/origin wall and no-store. Owner IDs always come from the session. Discord callback also requires the originating authenticated owner; callback URLs/codes never enter logs.

| Method/path | Input | Response |
| --- | --- | --- |
| POST /api/playback/devices | {clientId,name?}; clientId 8–80 word/hyphen characters, names sanitized/capped 40 | SyncView with opaque deviceId, active, epoch, revision, updatedAt, snapshot, owner devices, owner-device command and transfer target |
| GET /api/playback/state | deviceId | Owner/session-scoped SyncView |
| GET /api/playback/updates | deviceId | text/event-stream; data is SyncView; 15-second session/status recheck and heartbeat; no-store |
| POST /api/playback/sync | deviceId + type claim, command or snapshot; 2 MiB cap | Updated SyncView; 409 rejects lost ownership, stale sequence/epoch or blocked transfer |
| GET /api/discord/status | None | {configured,connected,ready}; never credentials |
| POST /api/discord/connect | Empty body | {url} for registered HTTPS OAuth callback, owner-bound ten-minute state, PKCE S256, openid identify sdk.social_layer_presence |
| GET /api/discord/callback | state/code plus owner's cookie | Redirect /library?discord=connected after single-use state and identity verification |
| POST /api/discord/disconnect | Empty body | {ok:true}; local credential deletion, internal clear and one revocation attempt |

Snapshot = {queue:Track[],original:Track[]|null,index,position,duration,status,shuffle,repeat,autoRadio}. Only the active device/epoch can publish, and seq must increase. Commands are allowlisted public player actions; volume, mute, theme and video preference are not remote commands. Sync queues are capped at 500 tracks, retaining the current track and up to 100 preceding rows. Library playlists/backups retain their existing full collections. First playback claims an unowned account; other clients mirror/control without audio. claim on another device records a transfer target; old output must remove sources and acknowledge paused/idle before a new epoch is granted. No time-based forced takeover of an unreachable browser. Pagehide uses a small keepalive position/release acknowledgement; logout awaits release. A lost/crashed old document may require verified operator repair if release could not arrive. Opening a cloned tab uses a different document identity.

Bounds: 128 in-memory rooms, 8 devices/owner, 2 SSE connections/device, 20 pending commands, 15-second command expiry, 120 mutation requests/device/minute, one coalesced pending SSE view, five-second progress persistence. Queue/status/ack/ownership changes are persisted immediately. Inactive rooms are discarded only after their state has been persisted; a reload of durable state is paused. A live browser can keep playing during transport loss, but remote commands require connectivity. Browser autoplay and OS suspension limits remain real acceptance constraints.

### Added SQLite tables/indexes

The worker applies playback-discord-v1 transactionally after a consistent backup when existing users are present. Phone migration marker is malaysia-phone-v1. Both use the existing migrations table.

| Table | Columns/constraints |
| --- | --- |
| playback_state | user_id TEXT PK FK users(id) ON DELETE CASCADE; json TEXT NOT NULL; updated_at INTEGER NOT NULL |
| discord_connections | user_id TEXT PK FK users(id) ON DELETE CASCADE; discord_id TEXT NOT NULL UNIQUE; encrypted TEXT NOT NULL; updated_at INTEGER NOT NULL |
| discord_states | hash TEXT PK; user_id TEXT NOT NULL FK users(id) ON DELETE CASCADE; verifier_enc TEXT NOT NULL; expires_at INTEGER NOT NULL |

Explicit indexes: discord_states_expiry(expires_at), discord_states_owner(user_id). PK/UNIQUE indexes scope playback/user and linked-identity lookups. Hot private queries are owner-keyed; expiry cleanup uses its index. Phone migration preflights existing users/invites, stops on invalid/colliding identities, preserves UUIDs and relationships, normalizes invites and invalidates OTPs. It does not silently merge/reassign accounts. Existing admin/session/Google constraints remain.

### Playback diagnostics/recovery updates

The supplied real trace contains hidden player.playing followed 1.8 seconds later by waiting; see the append-only Hermes correction. Browser handoff now requires at least min(8 seconds, known track length) of contiguous buffered data, not readyState alone. Queue preparation requests with the same window are coalesced. After an 8-second no-progress loading deadline (checked every five seconds), a successful error probe cannot misclassify a stalled element as an unsupported codec. Two position-preserving automatic retries use 500/1000ms delays; pause/skip/logout/transfer cancel them. Hidden-state progress does not depend on a visibilitychange. No JavaScript guarantee is made for an OS-suspended/killed PWA.

Client telemetry adds fixed operation category, safe response requestId and numeric position/buffered/readyState/networkState/mediaCode fields to the existing bounded export/schema. Server events retain trace/request/Ray IDs and resolved IP, including basic failure records. Raw queries/headers/provider text/tokens are excluded. Server startup is one structured stdout event; audit and verbose stages also use stdout. SQLite audit rows, in-memory diagnostics and UI job progress remain by user decision; no application-managed log files are configured. Docker/edge/device records are separate evidence sources.

### Discord runtime contract and limits

The main server encrypts OAuth credentials with owner context discord:<UUID>; state verifier uses discord-state:<UUID>. At most one pending state/owner is retained; expired states are indexed/cleaned. A Discord identity cannot be linked to two Musike owners. Delivery is latest-state coalesced and single-flight per user, capped to 128 tracked users. Paused/nonplaying state clears activity; missing heartbeats clear within 60–75 seconds. The private sidecar requires a >=32-character shared bearer key; tokens cross only that private service boundary. Each SDK process receives an access token through stdin, not argv. Default 16/max64 isolated workers; private HTTP body 16 KiB, 64 connections, 60–70 second expiry. Vendor stdout is parsed into allowlisted state records; provider stderr is not forwarded. No native log directory is configured.

Source OAuth/service tests use injected transports and a mock SDK process. The actual vendor SDK, headless Connect/Ready, application eligibility, Listening rendering and two-user profile acceptance were not available in this workspace and remain pending. No cloud-only all-platform presence guarantee is implied. See services/discord-presence/README.md and docs/HERMES-VERIFICATION.md.
