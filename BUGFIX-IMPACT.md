# BUG-002–006 impact and implementation record

Date: 19 November 2026. Base: uploaded fork main `da3f88384651cdf8ee487054a50b0effb277cb45`. The user approved the scoped plan and the targeted wrapper exception before changes. No upstream rebase, SQLite schema/index migration, dependency-version change or styling-system change was made.

## Exact implementation scope

| Files | Changed functions / contracts | Reason |
| --- | --- | --- |
| server/src/googleImport.ts | selectImportMatch re-export; GoogleImport.resolve/run/status/recover; status route | Original-first scored fallbacks; live/cursor progress, review outcomes, idempotent batches/checkpoints and restart retention. |
| server/src/importMatching.ts (new) | normalizeImportText, rankImportCandidates, selectImportMatch | Bounded Unicode edit scoring, artist/duration/version evidence and ambiguity guard. |
| server/src/googleSource.ts | SourceTrack and source track conversion | Optional source duration retained for matching; no Takeout adapter invented. |
| web/src/components/AccountPanel.tsx | GooglePanel, ImportReport | Running progress and last item, bounded delta polling, unresolved/review list and suggestion links using existing styles/pager. |
| server/src/app.ts | createApp lifecycle hooks; radio/playback/settings/queue/stream routes | Correlation, bounded client telemetry, readyIds, bounded recent owner-scoped failure probes and cold-source wiring. |
| server/src/audioCache.ts | audioCandidates, openAudioSource/raceAudioSource, AudioCache.ensure/download/update | Shared first-byte selection, admission/deadlines, loser cancellation, complete warming and existing quota/lease protections. |
| server/src/stream.ts | proxyStream, serveFile | Cold audio races, Range/416 preservation, streaming stage counts and cleanup; warm path retained. |
| server/src/playbackDiagnostics.ts (new) | traceId/withPlaybackTrace/safePlaybackFields/playbackStage | Async request context and allowlisted timing fields. |
| server/src/ytdlp.ts | run, resolveStreams, resolveDirect/resolveDirectAudio, clientsForDirect, ytdlpSearch | Queue timings and consumer-aware cancellable subprocess resolution. |
| server/src/process.ts; taskQueue.ts | runProcess; waitForSignal helper | Abort/kill/reap without releasing a live process slot; cancel one waiter without affecting other consumers. |
| server/src/search.ts; directAudio.ts | withClient/radio; directAudio | Bounded radio waits and cancellation-aware shared SDK consumers, without Node imports in shared native code. |
| server/src/i18n.ts | English/Portuguese catalogs | Radio and audio deadline messages. |
| web/src/lib/api.ts; apiTypes.ts; stores/session.ts | request/streamSource/explainStreamError; ApiError/MusikeApi; accountRequest | Trace/ready metadata, manual redirects, failure categories, opt-in batched events and cheap error probes. |
| web/src/player/player.ts | load/primeRadio/continueWithRadio/warmQueue/onEnded/onError/wire + lifecycle hooks | All-path renewal, bounded retries, ready-media handoff, stale protection, deliberate-pause preservation and diagnostics export. |
| web/src/lib/audio.ts; native/api.ts | createUpcomingAudio; compatible stream/probe signatures | Supported browser-only spare element; standalone/native/iOS bridge behavior preserved. |
| web/src/lib/playbackDiagnostics.ts (new); playbackRecovery.ts (new) | Browser ring/classification/flush; recoverableFailure/requestRadio | Bounded diagnostic delivery and abortable, capped radio retry. |
| web/src/i18n/en.ts | features messages | Existing typed catalog; pt.ts's explicit English features fallback picks up the new keys. |
| deploy/ytdlp-wrap.sh | Complete POSIX wrapper replacement | Approved exception: classified metadata retries, no implicit success sleep, explicit legacy compatibility, clean output and signal handling. |
| server/test/*.test.ts | Existing accounts/audio/import tests plus seven focused new modules | See TEST-RESULTS.md for cases and counts. |

Documentation changes are limited to current contracts/dispositions, the approved exception, deployment/acceptance/results and historical-document pointers. HERMES original report bodies remain intact; only the current index and appended follow-up change their disposition.

## Runtime boundaries retained

- Auth-off shared JSON and standalone-native substitutions still work. Auth-on queries use the existing SQLite worker and session owner. Private Google tokens remain import-only and encrypted; public matching/playback do not receive them.
- No new schema/index is needed: report/progress additions use existing import_runs JSON, mappings and worker RPC. Active progress is memory-local to its owner; durable updates are bounded checkpoints and grouped library/mapping writes.
- No new CSS variable or inline/innerHTML renderer. Track/report rows reuse existing semantics and page sizes. Original styles.css and tv.css are byte-identical.
- Operator .env/compose/Dockerfile/mounts/system paths and other deploy files remain intact. Only the approved wrapper file is supplied, with executable mode preserved.

## Delivery / applying

The ZIP is a **changed/new-file overlay**, not a standalone checkout. Extract directly into this fork root and preserve unchanged files. Complete final files are supplied. BUGFIXES.patch is an alternative clean diff against the supplied ZIP; apply either the replacements or the patch, not both. PACKAGE-MANIFEST.md inventories the payload. Do not reuse the prior 18 November package manifest as the current inventory.

Run demo acceptance before production. Resolved source changes do not establish a Cloudflare/Android root cause or a measured reduction of the unsupplied failed library. Current dispositions: BUG-002/003/005 resolved in source; BUG-004 instrumented/mitigated and BUG-006 browser-mitigated, with real incident/device/edge verification still pending. BUG-001's historical field evidence remains preserved.
