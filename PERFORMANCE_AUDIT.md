# Musike Performance & Structural Audit

Updated 18 November 2026 after both implementation passes. Source: the uploaded Musike 1.5.1 ZIP, archive comment 41706772a4c1e774e3bf1731ca28711fa1529cf4. ARCHITECTURE.md describes the delivered source. No current upstream GitHub comparison or deployment was performed.

## Actual stack and audit boundary

This repository uses React, Zustand, Tailwind CSS, Fastify/TypeScript, and JSON library storage, with Electron and Capacitor wrappers. There is no FastAPI application, SQLite database, SQL schema, SQL index, or SQL N+1 pattern to fix. There is upstream request fan-out and repeated in-memory work. Those are reviewed below.

Source inspection and tests establish behavior and scaling limits; they do not establish production latency. No production trace or real library was supplied. The only original innerHTML replacement was in the two-essential-row Electron splash, refreshed every 250 ms. The React application did not use wholesale innerHTML replacement.

## Implemented fixes

| Area | Finding | Delivered behavior |
| --- | --- | --- |
| Library startup | Concurrent cold reads could replace shared state | One shared loading promise, retryable after failure |
| Durability queue | One failed save prevented all future saves | Current callers receive failure; later saves can recover |
| Write amplification | Concurrent mutations each serialized the whole library | Mutations in the same microtask turn share a durable compact snapshot and write |
| Bulk edits | Repeated linear playlist/track searches | Set-based track insertion; ID/name Maps during backup merge |
| UI mutation ordering | Slow responses and whole-array rollbacks could erase newer edits | Serialized client requests with pending optimistic operations replayed over confirmed state |
| Startup/import ordering | StrictMode could duplicate loads; restoration raced other edits | Coalesced initial loads; import plus refresh ordered with other library operations |
| Track DOM size | Standard/selection/queue lists mounted entire collections | Previous/Next pages of at most 100 tracks; queue additionally retains its current row |
| Playback/selection context | Paging could accidentally queue/select only the visible page | Playback and select-all retain the complete source collection; row indices include the page offset |
| React work | Fresh callbacks defeated row memoization; broad library subscriptions | Stable callbacks, field selectors, narrowed row playback state, memoized Collection duration/membership |
| Favorites | Per-row and control array membership scans | Set membership, including WeakMap-backed indexes for immutable frontend arrays |
| Artwork | Full collection scan for four covers | Stop after the first four distinct thumbnails |
| Navigation | All eight route views loaded eagerly | React.lazy/Suspense route splitting |
| Scroll restoration | One animation frame assumed route content already existed | Wait for route/data readiness and layout, up to five seconds; cancel immediately on user input |
| Player storage | Track arrays serialized every four seconds, including unchanged paused state | Reuse array serialization; skip identical saves; retain existing JSON format |
| Large saved queues | Active index could exceed the saved first 500 tracks | Save a window containing the active track and its matching original shuffle order |
| Remote requests | Late effects could publish old data; key change could briefly show prior entity | Aborted completions ignored; keyed remote state; retry invalidates cached data |
| Browser/native caches | Several Maps grew without bounds | Capacity/TTL SessionCache for remote pages, list-page memory, clips, genres, native audio and scroll history |
| Server caches | Infinite video-match cache, stale resolved entries, cache capacity off by one | Bounded TTL/coalesced video matching; 200 resolved media entries with expiry; shared bounded browse helper |
| Media subprocesses | Unlimited distinct child processes and captured output | Three active/32 waiting; 30s queue timeout; combined stdout/stderr cap of 16 MiB |
| HD downloads | Unlimited distinct downloads; synchronous cache-hit filesystem checks | Two active/eight waiting; async stat/cache-hit path; same-ID promise sharing |
| Process lifecycle | Timed-out work could release control while children were still alive | Queue slots retained until child close; termination escalation after two seconds; queued/active work stopped on server close |
| Cache pruning | Concurrent scans/rm races and unbounded stat fan-out | Shared pruning promise; eight metadata reads at a time; disappearing entries tolerated |
| Tool status | Concurrent initial polls repeated release/version probes | In-flight version/release requests shared |
| ZIP extraction | inflateRawSync blocked the event loop | Asynchronous ZIP inflation |
| Static delivery | No explicit hashed-asset versus HTML policy | Fingerprinted assets: one-year immutable; other files: no-cache |
| Media seeking | Minimal unanchored Range parser | Exact single ranges, suffix/open-ended/huge values, correct 416; malformed/multipart headers fall back to full responses |
| CSS/UI consistency | TV hover suppressed focus transform; ring ignored user accent | Focus excluded from hover suppression; TV ring derives from accent tokens |
| Splash rendering | Startup rows destroyed/rebuilt every tick | Reused componentRow nodes and localized text/progress updates |
| Testability | App construction required opening a socket | createApp() supports Fastify injection; startServer owns listening and media shutdown |

## Vanilla JS and styling pattern

Retain React function components and declarative JSX in the main application. Keep shared behavior in IconButton, Modal, Artwork, PageHeader, ListPager, and the stores/hooks. Use stable props and narrow subscriptions to localize updates. The standalone splash uses lightweight vanilla component functions and cached DOM references. Its two rows do not need event delegation.

styles.css already contained dark/light tokens, semantic Tailwind @theme mappings, base rules and shared component classes. Those remain the source of truth. The implementation fixes the observed TV conflict and uses the shared button-secondary class for paging. It does not claim every existing literal radius/utility has been standardized or visually reviewed.

## Endpoint-by-endpoint backend review

Every original registration in server/src/app.ts was traced. All remain available; the filtered track page endpoint is additive.

| Endpoints | Execution/scaling and current status |
| --- | --- |
| GET /api/health | Cheap async liveness response; deliberately does not test YouTube/disk/tools |
| GET /api/system | Async tool version/release checks with completed caching and in-flight coalescing |
| POST /api/system/ytdlp | One shared install/update job; refreshTools still performs synchronous discovery scans during startup/job completion |
| GET /api/search | Music -> YouTube -> yt-dlp fallbacks; yt-dlp work is now bounded; youtubei calls still lack an explicit overall deadline |
| GET /api/suggest | Blank shortcut, max eight suggestions; frontend debounce and abort guards; upstream work is not fully cancelled by HTTP disconnect |
| GET /api/radio/:id | Up-next response and optional session retry; player takes up to 25 when extending radio |
| GET /api/genres | Six-hour bounded memo; upstream discovery call lacks an explicit overall deadline |
| GET /api/genres/:gid | Cached genre state; initial two/four playlist reads; artwork derived from existing items rather than per-artist requests |
| GET /api/genres/:gid/artists | Real 40-item offset pages; four playlist reads per round, at most five rounds; concurrent extensions shared; a batch can overshoot the 600-artist stop threshold |
| GET /api/artists/:aid | Cached 30 min; artist request plus bounded top-song/album expansion; discography response remains unpaged |
| GET /api/albums/:alid | Cached 60 min; maps supplied album tracks; client selection list now paged |
| GET /api/search/albums | One upstream search, no continuation exposed |
| GET /api/video-for/:id | Up to two search phrasings; six-hour bounded memo keyed by title/artist/duration and shared in-flight work |
| POST /api/prepare/:id | Same-ID coalescing; bounded yt-dlp process/output; direct-audio fallback retained; 503/server_busy does not bypass admission through fallback |
| GET /api/stream/:id/audio | Streamed bytes/backpressure, Range forwarded, fetch aborted when response closes, one 403/410 retry; overall resolution/idle deadlines remain future work |
| GET /api/stream/:id/video | SD proxy or HD cache; bounded/coalesced HD work, asynchronous cache lookup, serialized pruning |
| GET /api/library | Full JSON library retained for startup/export compatibility; still O(total library) response/serialization |
| GET /api/library/tracks | Added bounded output: kind, pid, offset 0..1000000, limit 1..200, q max 200; in-memory filtering and matching totals |
| POST /api/library/import | 25 MiB body cap, sanitization and ID/name indexed merge; client import is now ordered with pending edits; parsing/serialization remain synchronous |
| PUT /api/favorites/:id; POST /api/favorites; DELETE /api/favorites/:id | Validated IDs, bulk POST first 500, full favorites responses; shared startup and coalesced recoverable persistence |
| POST /api/history | Retains 60 history tracks; full-library persistence can coalesce with same-turn mutations |
| POST /api/playlists; PATCH /api/playlists/:pid; DELETE /api/playlists/:pid | Existing UUID/name semantics; whole-library persistence; DELETE remains 204 |
| POST /api/playlists/:pid/tracks; DELETE /api/playlists/:pid/tracks/:id | Bulk POST first 500, Set deduplication; full Playlist response retained |
| Static assets/SPA | Immutable fingerprinted assets, revalidated HTML, SPA GET fallback; API 404 remains JSON |

## Exact core refactoring excerpts

The source files in this ZIP contain the complete implementations, rather than illustrative placeholders.

### Coalesced, recoverable persistence — server/src/library.ts

```ts
function persist(): Promise<void> {
  if (pendingSave) return pendingSave;
  const target = storage!;
  pendingSave = Promise.resolve().then(() => {
    pendingSave = null;
    const snapshot = JSON.stringify(state);
    const write = writeChain.then(() => target.write(snapshot));
    writeChain = write.catch(() => {});
    return write;
  });
  return pendingSave;
}
```

### Bounded standard track rendering — web/src/components/TrackList.tsx

```tsx
const page = useListPage(tracks, listKey);
const queue = context ?? tracks;
const onPlay = useCallback(
  (position: number) => playList(queue, position),
  [playList, queue],
);
```

The JSX maps page.items and passes position={page.start + i}. ListPager replaces the current page; no later pages accumulate in the DOM.

### Ordered optimistic updates — web/src/lib/optimisticQueue.ts

```ts
private render() {
  this.publish(
    this.pending.reduce((state, op) => op.apply(state), this.confirmed),
  );
}
```

Each request runs after the prior one. Success updates confirmed state and removes only that operation; failure removes only the failed operation. Remaining optimistic operations are replayed, preserving subsequent user intent. libraryState.ts integrates loading, favorites, history, playlists and backup restoration with that mechanism.

## Validation

| Check | Result |
| --- | --- |
| pnpm test | 30 passed on Linux/Node 24.22.3 |
| pnpm typecheck | Server, desktop, web and native configurations passed |
| Web production build | Passed; main JS 653.44 kB / 192.88 kB gzip |
| Native web build | Passed; main JS 1346.56 kB / 368.39 kB gzip |
| Server bundle | Passed |
| Desktop bundle | Passed |
| Source patch dry-run | Checked during packaging |

Tests cover cold-start shared reads, same-turn write coalescing, failed save recovery, bulk deduplication, backup merges, HTTP contracts/pagination, optimistic response/failure ordering, double toggles, initial-load/import ordering, cache expiry/capacity, player serialization reuse/current-track restoration, job bounds/timeouts/shutdown, real child-process limits, HD coalescing/cache pruning, system poll coalescing, byte ranges, static caching/SPA/API boundaries, and stored/deflated ZIP extraction.

Compared with the initial patched build in this session, the main web chunk changed from 716.25 to 653.44 kB and native from 1408.98 to 1346.56 kB. This is a bundle-size observation, not a measured playback/startup latency improvement. Total PWA precache remains larger than the main chunk and includes deferred routes. Both main chunks still exceed the 500 kB build warning threshold.

The environment uses Node 24.22.3/pnpm 11.25.0; source declares pnpm 10.14.0 and the Docker/build tooling targets Node 22. The POSIX fake executable HD test is skipped on Windows; no Windows/macOS/iOS/Android device run was performed. Dependency versions and the JSON backup format were preserved.

Headless Chromium was attempted, but the environment denied its process-singleton socket. Browser visual/scroll/focus checks therefore remain unverified. No live YouTube playback, production load benchmark, Docker image, Electron installer, APK, IPA, tool install/update or deployment was performed. Unit/injection/build checks do not establish those behaviors.

## Remaining limits and safe follow-up

1. Full-library JSON remains the storage and bootstrap contract. Same-turn batching reduces duplicate writes but does not remove synchronous whole-library parsing/stringification. A metadata/page facade migration across web/native and an explicit persistence redesign are separate changes.
2. Failed writes retain in-memory domain changes; atomic rename is not transaction rollback, fsync durability, or multi-process coordination. Use one owning server process per data directory.
3. youtubei requests and direct-audio fallback still need explicit overall deadlines/cancellation if production traces show stalls. Process admission bounds do not cover all network calls. Tool installation/update uses its own single job and lifecycle.
4. Cache budget enforcement happens after download and is not hard disk admission or an active-file lease system. A file larger than the configured cache budget and simultaneous playback/eviction warrant further policy work.
5. Paging is local UI pagination, not virtual scrolling or network-backed bootstrapping. Verify keyboard/TV focus, route Back/Forward restoration and mobile layout on real devices before release. Very long artwork/discography grids and eager global dialogs remain profiling candidates.
6. Remaining literal CSS radii/utility duplication and duplicated shared DTO declarations are incremental cleanup work, rather than invented new architecture.

## Safe application order

1. Back up the existing source and library.json; retain the original archive.
2. Apply the delivered source as one compatible change set; retain the existing library/backup format and one owning instance.
3. Run pnpm test and pnpm typecheck, then web/native/server/desktop bundle commands.
4. On staging, test large collections, page-two playback and select-all, rapid favorite edits, backup merge/replace, SD/HD seeking, Back/Forward, custom accents, TV focus and device media controls.
5. Review the documented residual limits and capture production response bytes, p50/p95 latency, event-loop delay, memory and React commits before choosing a storage migration or further bundle/windowing work.
6. Roll out with the prior source/data backup available for rollback. Nothing was published or deployed by this task.
