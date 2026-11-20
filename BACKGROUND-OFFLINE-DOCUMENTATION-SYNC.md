# Documentation sync — 20 November 2026

These exact snippets are already applied in the supplied source. Original Hermes report history remains append-only.

## HERMES_FOUND_BUGS.md — current disposition rows

| ID | Title | Status | Found |
| --- | --- | --- | --- |
| BUG-007 | Locked-screen next-track fetch failure on Samsung A07 | SOURCE LIFECYCLE FIX UPDATED — stable audio element/intent-aware Media Session; Samsung verification pending | 2026-11-19 |
| BUG-018 | Stale jam transfer grants, JSON guards and guest next/previous | HERMES FIX RETAINED — reported deployed a67c8db | 2026-11-19 |
| BUG-019 | Redundant Library backup button | HERMES FIX RETAINED — button remains removed | 2026-11-19 |
| BUG-020 | Mobile import modal scrolling | HERMES FIX RETAINED — scrolling/focus layout unchanged | 2026-11-19 |
| BUG-021 | Circular SVG/React event JSON on playback controls | RESOLVED IN SOURCE — real React SVG regression passes | 2026-11-19 |
| BUG-022 | Ordinary locked playlist/radio notification/audio loss | SOURCE LIFECYCLE FIX IMPLEMENTED — Samsung acceptance pending | 2026-11-20 |
| BUG-023 | Persistent audio-only offline music and storage budget | IMPLEMENTED IN SOURCE — offline/storage/auth fixtures pass; real PWA acceptance pending | 2026-11-20 |
| BUG-024 | Compact mobile playlist import presentation | RESOLVED IN SOURCE — existing bottom-sheet scrolling retained; visual acceptance pending | 2026-11-20 |

## Implementation follow-up — BUG-007/021–024 — 20 November 2026

Authorized after the user's final confirmation, against upload revision `c1293caa1302c779b589289b6ba590c2d43f6caa`. Original reports above, including the duplicated BUG-018 heading, are preserved verbatim as historical evidence. Hermes BUG-018–020 changes remain in place.

- **BUG-021 resolved in source:** real React SVG path clicks reproduce the circular fiber reference. Controls now explicitly invoke zero-argument actions; the remote/jam boundary constructs a data-only allowlisted payload. Guests retain next/previous permission, conflict refresh/retry, and bounded output-grant waiting.
- **BUG-022 and overlapping BUG-007 source lifecycle fix:** ordinary playlist/radio auto-end and manual-next paths now keep the same audio element. Complete next-body hydration avoids relying on advisory media buffers. Loading retains Media Session play intent; Play is idempotent while loading, Pause cancels loading, and invalid artwork cannot abort playback. Pause-before-source completion cannot later start the prior track. No native app, silent keepalive, speculative tunnel edit or yt-dlp shell rewrite was added. The shell wrapper's existing tests pass unchanged. This is not a claim that the Samsung A07 OS incident is proven resolved: ten locked playlist/radio transitions on both Wi-Fi and mobile data, notification persistence and manual controls still require physical-device acceptance.
- **BUG-023 implemented in source:** user-selected 512 MiB/1 GiB/2 GiB opt-in budget, recent audio cache, explicit personal-playlist pin/update/resume, bounded complete audio-only bodies, atomic owner-scoped admission and oldest-unpinned eviction. Pinned and pending memberships are protected. Offline authenticated reopening, explicit logout purge/pending server logout, same-installation output eligibility, exclusive offline tab ownership and stop-before-reconnect are wired. No offline jams/transfers. An offline installation cannot detect another device's explicit takeover while disconnected, as accepted by the user. Old opaque artwork cache alone is replaced; exact audio usage and approximate total site usage are shown separately.
- **BUG-024 resolved in source:** compact Import pill/short labels/wrapping and removed duplicate padding; retain the existing scrollable mobile Modal. Completed import polling stops. Real narrow-screen/keyboard/focus acceptance remains pending.

Verification: 138 tests, zero failed/skipped; server/web TypeScript, production web/PWA build and server bundle pass. See TEST-RESULTS.md for exact environment, lockfile checks and unperformed device/runtime acceptance. No production deployment or new SQLite schema/endpoint is included.


## ARCHITECTURE.md — new current section

## 8. Browser audio lifecycle and offline audio — 20 November 2026

This section supersedes earlier spare-element, artwork-cache and in-memory-only descriptions. No server endpoint or SQLite schema/index changed. `deploy/ytdlp-wrap.sh` was audited and its existing five subprocess fixtures pass; uploaded executable metadata is retained and its content is unchanged. It resolves server metadata, not Android audio focus.

| Exact browser modules | Current wiring/functions |
| --- | --- |
| `components/Controls.tsx`, `MobileChrome.tsx`, `Queue.tsx` | Zero-argument callbacks invoke player actions explicitly; React MouseEvent/SVG fiber objects cannot become action arguments |
| `lib/playbackCommands.ts`, `playbackSync.ts`, `jams.ts` | `playbackCommand` constructs allowlisted scalar/track payloads before jam or remote JSON encoding; existing queue cap 500, document IDs, pause acknowledgement, stale takeover and version retry remain |
| `player/player.ts`, `lib/audio.ts` | `load`, `warmQueue`, `onStarted`, `onEnded`, `toggle`, output/session shutdown retain one audio element, cancel stale sources and reuse complete next-track or downloaded bodies. Locked online transitions keep a synchronous source/play path when no complete body is ready; user-activated starts and offline starts may query IndexedDB |
| `lib/mediaSession.ts`, `lib/playbackPreload.ts` | Intent-aware loading/playing/paused/none, idempotent play/pause, validated artwork; one complete network body (16 MiB/25 seconds/two attempts) or one hydrated downloaded next body, plus the active Blob. Hydration never overwrites a newer target |
| `lib/offlineStore.ts` | Async IndexedDB transactions own settings, metadata, pins, complete Blobs, budget admission, LRU eviction, trim and owner purge |
| `lib/offlineDownloads.ts`, `stores/offline.ts` | One download worker per tab, one latest recent request and one pending explicit pin; generation/AbortController fencing, 90-second body deadline, 64 MiB per-file cap, refresh/status, minimal cached account and output eligibility |
| `components/AuthGate.tsx`, `stores/session.ts`, `lib/api.ts` | Previously authenticated offline entry only after transport failure; 401/403/challenge/invalid JSON cannot authorize offline fallback. General account/library/discovery calls reject offline. Cached profile contains UUID/name only; offline role is user, no phone, tokens, cookies or admin privileges copied |
| `App.tsx`, `views/OfflineLibrary.tsx`, `lib/routes.ts` | Online `/offline` route; offline session mounts a dedicated downloaded-audio view instead of online routes, social, jams or admin. Local playback/seek/volume/repeat/shuffle use the existing controls; list pages cap at 60 |
| `components/OfflineStorage.tsx`, `views/Library.tsx`, `Collection.tsx` | Library storage/download entry; personal playlist pin/update/unpin actions, exact audio progress and separate approximate origin usage |
| `components/AccountPanel.tsx`, `views/OfflineLibrary.tsx` | Explicit logout removes owner settings/Blobs/metadata/pins/player snapshot and broadcasts account cleanup. Offline logout records a pending server logout which must complete before a cookie can authorize the next online startup |
| `main.tsx`, `web/vite.config.ts` | Delete only obsolete cache `artwork`; preserve other caches, auth state, preferences and IndexedDB. New image-only `musike-artwork-v2` refuses opaque responses; app shell/lazy chunks remain precached |
| `components/PlaylistImportDialog.tsx`, `views/Library.tsx`, `i18n/en.ts`, `pt.ts` | Compact Import pill, shorter form copy, wrapping rows, no nested padding, terminal polling stops. Retain Hermes Modal safe-area/88dvh/inner-scroll layout. New `offline` labels have explicit English fallback in Portuguese |

### IndexedDB schema (browser-local; version 1)

Database: `musike-offline`. All asynchronous body/metadata mutations use IndexedDB transactions; SQLite remains behind the existing server worker.

| Store | Key | Indexes | Stored data |
| --- | --- | --- | --- |
| `settings` | `owner` UUID | primary key | enabled, budget bytes, last-output eligibility, display name; no authentication secret |
| `audio` | `[owner,id]` | `owner`; `recent` = `[owner,played]` | Track metadata, exact body bytes, last-played timestamp |
| `blobs` | `[owner,id]` | `owner` | Complete audio Blob only; metadata scans never load bodies |
| `pins` | `[owner,id]` | `owner` | Last completed personal playlist snapshot, explicit pending target snapshot, error field |

Admission and oldest-unpinned eviction run atomically across settings/audio/blobs/pins, including concurrent tabs. Cap 2,000 audio entries and 100 pinned lists per owner, 5,000 tracks per pin target. Protect both completed and pending target memberships; a budget reduction may leave pinned bytes above the new limit and block additions. It never deletes pinned bodies automatically. Active/taken Blob URLs remain usable if their unpinned database copy is trimmed.

Download admission requires same-origin `/api/stream/:id/audio`, HTTP 200, an audio MIME, a nonempty fully read body, and at most 64 MiB. Reject redirects, opaque/HTML/video and HTTP 206 bodies; never store a partial body as ready. A catalog `kind:"video"` is eligible only through its audio endpoint. A recent play automatically queues audio only after the user enables caching. Complete lookahead bodies may be retained without a duplicate download. Failed/paused jobs leave pending pin metadata; Resume retries missing bodies. Pin updates require Download updates; the previous completed playlist stays usable until replacement completes. Shared lists must first use the existing explicit personal-copy operation. User-started downloads use the active Wi-Fi/mobile connection with a visible data notice.

The 512 MiB/1 GiB/2 GiB budget is chosen on this browser installation/account; suggested 1 GiB is inert until Enable. Pausing caching retains existing playable downloads. Exact audio accounting is separate from `navigator.storage.estimate()` origin usage; persistence is requested on enable but may be denied. Browser eviction, clearing site data, force-stop, process discard and OS background policies remain outside application guarantees.

`musike:offline-owner` points to the last online-verified cached owner; `musike:output-device:<owner>` remembers the installation's last granted document, avoiding mirror-tab revocation. The player keeps its existing `musike:player:<owner>` key. The offline view grants output only for an eligible installation and an exclusive `navigator.locks` lock `musike-offline-output:<owner>`; unsupported/contended locks fail closed. No offline transfer, jam or live cross-device control exists. On reconnect, stop local output, revalidate `/api/auth/me`, reload and await the existing server output grant. During a disconnection, another device's explicit server takeover cannot be observed; concurrent audible playback across that partition remains possible by the user's accepted policy. No silent timer takeover was added.

Tests add only `fake-indexeddb@6.2.4` and `jsdom@27.2.0` to server devDependencies; existing runtime dependency versions and lock entries are preserved. Fixtures exercise actual React SVG callbacks, real browser coordinator modules, synthetic media lifecycle, IndexedDB semantics, complete-body admission, interruption, auth fallback and cleanup. Physical Samsung and real-browser offline/PWA acceptance remain separate.
