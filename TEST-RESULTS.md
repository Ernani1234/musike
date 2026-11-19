# Verification results — BUG-002–006 — 19 November 2026

Base: uploaded fork main `da3f88384651cdf8ee487054a50b0effb277cb45`. The unchanged baseline passed **58 tests** before implementation. This patch adds **34 tests**; the final full suite passes **92 tests, 0 failed, 0 skipped/cancelled**. No live deployment/provider/device acceptance is implied.

| Check | Result |
| --- | --- |
| pnpm test | PASS: 92 tests; baseline regressions plus targeted fixtures |
| pnpm typecheck | PASS: server, Electron and web/native-mode TypeScript |
| pnpm build | PASS: web/PWA production assets/service worker |
| pnpm --filter @musike/web build:native | PASS: standalone-native assets; existing large-chunk warning remains |
| pnpm --filter @musike/server bundle | PASS: single-file Node server |
| pnpm --filter musike-desktop bundle | PASS: Electron main/preload/assets |
| Source/patch integrity | Compared against the actual uploaded ZIP; changed/new replacements and an alternative clean patch reconstruct the source; wrapper executable mode preserved |
| Guardrail preservation | DB schema, dependency manifests/lockfile, styles.css/tv.css, environment/compose/Dockerfile and all other deploy files unchanged |

## Added coverage

| Test file | New tests | Evidence |
| --- | --- | --- |
| server/test/import-matching.test.ts | 4 | Typo/artist/duration scoring, Japanese width/voicing, version conflicts, ambiguity/original IDs and provider deduplication |
| server/test/google-import.test.ts | 5 | Running progress before completion, owner/cursor deltas, reviewable provider failures/idempotent top-up, original-before-search order, ambiguous suggestions and retained restart checkpoints |
| server/test/cold-audio.test.ts | 5 | Usable fallback while primary body stalls, losing-source cancellation, Range/206, bytes before full file, selection deadline/abort, 416/HTML rejection and bounded burst admission |
| server/test/direct-client-cache.test.ts | 1 | Cached/default clients usable immediately, one advisory refresh, failed stale/default client retries a changed refreshed list once |
| server/test/playback-diagnostics.test.ts | 6 | Async trace isolation/redaction, JSON/HTML/opaque redirect/challenge classification, bounded radio retry, HTTP cold lifecycle/Range/no-store, telemetry limits and non-resolving error probes |
| server/test/player-lifecycle.test.ts | 5 | Actual bundled Zustand player with synthetic media: central entry points/manual edits/jump/shuffle/repeat; hidden ended handoff without another next URL; stale radio/auth errors; transient retry/pause intent; autoplay fallback |
| server/test/resolve-cancellation.test.ts | 1 | Cancelled consumer preserves another owner/independent process; same-ID rejoin recovers |
| server/test/wrapper.test.ts | 5 | No implicit success sleep, argument fidelity, transient retry cap/clean stdout, fatal/pass-through behavior, explicit legacy override and child signal/reaping |
| server/test/accounts.test.ts | 2 | Telemetry auth/CSRF boundary and error-probe ownership isolation |

The existing audio-budget regression was made deterministic by waiting for its observable budget-stop event rather than a guessed number of event-loop ticks. Its no-thrash assertion and the other original 58 tests remain intact.

## Environment and limits

Checks used Node v24.22.3 and pnpm v11.25.0; repository manifests remain Node-22-targeted/pnpm@10.14.0. Auth still requires Node 22.13+ for its existing built-in SQLite worker. No package/version/lockfile changes were needed. The offline install lacked a mirror metadata entry; the working tree reused the previously verified local dependency tree only after confirming the entire frozen lockfile was byte-identical. No new dependency was downloaded or dependency policy changed.

Player tests execute the actual player store with controlled media/API fixtures, not a real Chromium renderer or a physical locked Android process. Candidate/provider/wasphere/Google tests use injected or disposable fixtures, not operator secrets. The POSIX wrapper tests invoke a temporary fake executable, not the production yt-dlp installation. No Docker image/installer/device build, live provider import, public tunnel/Access/WAF inspection or audible latency measurement was performed.

The exact failed Takeout input/production adapter is absent from this ZIP. BUG-002's source matching/progress is fixed, but no measured reduction of the reported 387 misses is claimed. BUG-004/006 remain real-incident/device/edge-verification pending despite source instrumentation and recovery mitigations. Use DEMO-VERIFICATION.md and append sanitized evidence before marking those symptoms fully resolved.
