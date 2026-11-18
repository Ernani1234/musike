# Verification results — 18 November 2026

Source: fork main `85843fd42020dbf47831ec97d268981ec0f434d9` plus this four-phase WIP overlay. The baseline contained 30 tests; the package adds 28, for **58 passed, 0 failed, 0 skipped** on the final full run. No release, container rollout or live provider acceptance was performed.

| Check | Result |
| --- | --- |
| `pnpm test` | PASS: 58 tests, 0 failures/cancellations/skips; final run approximately 3.8 seconds |
| `pnpm typecheck` | PASS: server, desktop and web including native-mode TypeScript |
| `pnpm build` | PASS: web production build and PWA service worker |
| `pnpm --filter @musike/web build:native` | PASS: standalone-native production assets; existing >500 kB chunk warning remains |
| `pnpm --filter @musike/server bundle` | PASS: single-file Node server |
| `pnpm --filter musike-desktop bundle` | PASS: Electron main/preload and copied assets |
| Bundled `node server/dist/server.mjs promote …` | PASS on a disposable fixture: grant first/second admin, revoke second, reject last-admin revoke |
| Source `pnpm --filter @musike/server promote -- …` | PASS on disposable data: literal `--` argument forwarding |
| Source-overlay integrity | PASS: complete final changed/new files; payload compared with uploaded base; operator-owned deployment files unchanged/excluded; runtime/build/dependency files excluded |

## New test coverage

| Test file | Tests | Main coverage |
| --- | --- | --- |
| server/test/audio-cache.test.ts | 8 | Primary/fallback complete bytes, no repeat resolve on warm hit, shared HD/audio budget and leases, stable budget stop, stale skip cancellation/revisions, first-ready candidate, exact warm HTTP 206, cancelled-track rejoin and serialized publication/lease/eviction |
| server/test/playback-queue.test.ts | 1 | Ordered deduplicated manual/optimistic windows, repeat-all wrap, repeat-one/zero-depth behavior |
| server/test/accounts.test.ts | 10 | Backed-up/idempotent migration, malformed/missing-owner/conflicting-backup safety, OTP bootstrap/invite/isolation/cookies/refresh/logout, attempt/expiry/cooldown/IP concurrency limits, exact wasphere request/no ambiguous retry, encryption ownership and concurrent invite single use |
| server/test/admin.test.ts | 3 | Non-admin 403s, validated/persisted settings, live sessions/disable cleanup, four-case resolved-IP trust matrix, restart persistence |
| server/test/google-import.test.ts | 6 | OAuth state/PKCE/read-only scope, token encryption/restart refresh, ordered album/playlist/likes/history fixtures, idempotent mapping and job dedupe, per-user isolation/default-off daily sync, unavailable partials, conservative matcher and cross-account/HTTP callback boundary |

The original 30 tests continue covering legacy HTTP/storage, optimistic edits/backup ordering, paging/persistence, TTL caches, media Range/static delivery, process/job bounds/shutdown, HD caching, tool status and ZIP extraction. Auth-disabled startup/library/media tests remain green; new fixture tests enable auth explicitly.

Runtime used for checks: Node v24.22.3 and pnpm v11.25.0, using the offline dependency store/frozen lockfile. Repository packageManager remains pnpm@10.14.0; bundles target Node 22. Actual Node 22 runtime/container and native installer builds were not exercised here. Auth requires Node 22.13+ for built-in SQLite without the older flag. No package version/dependency/lockfile change was needed.

## Scope of evidence

Media/provider/auth transports in the new automated tests are injected fixtures. The tests prove local byte serving, data ownership and request/control contracts; they do not measure audible gap/real YouTube latency, prove WhatsApp delivery, authorize a real Google account, or demonstrate that private Music album/history endpoints accept the configured OAuth client.

Browser visual flows, dark/light/TV navigation, actual tunnel/header deployment, NAS backups, real remembered-cookie behavior, embedded-browser OAuth policy, device/background playback, Docker image build and production load require the unchecked demo steps in ACCEPTANCE-CHECKLIST.md. Google public playlists/likes have API fallbacks; albums/history remain private-adapter dependent and must be reported unavailable/partial when refused. BUG-001's wrapper mitigation remains in place pending live cold/warm tests.
