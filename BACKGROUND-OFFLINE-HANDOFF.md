# Musike background/offline handoff — 20 November 2026

Completed the user-approved BUG-021–024 and overlapping BUG-007 source revision against `c1293caa1302c779b589289b6ba590c2d43f6caa`. Hermes BUG-018–020 fixes are retained. No production deployment was performed.

## 1. Impact analysis

See `BACKGROUND-OFFLINE-IMPACT.md` for the exact files/functions. Browser control encoding, player/Media Session lifecycle, explicit owner-scoped offline storage/auth/output handling, targeted artwork cleanup and compact import presentation changed. Server application modules, SQLite schema/queries/endpoints, CSS variables/stylesheets, Modal, operator configs, Dockerfile and shell wrapper content remain unchanged. Two test-only dependencies were added.

## 2. Code changes

- `Musike_Background_Offline_20261120.zip`: complete source under `musike-main/`, including final files and the clean patch.
- `Musike_Background_Offline_20261120.patch`: complete Git diff against the exact uploaded source, including every new file. No placeholders; no dependency/build/runtime folders.
- Clean patch application and full resulting tree/byte checks passed. `SOURCE-SHA256.json` lists packaged source hashes, excluding itself/new patch to avoid recursion; ZIP CRC and executable metadata were verified.

Choose either the full source tree or the patch, not both. Preserve the operator's environment/compose/runtime files and volumes. Use pnpm 10.14.0, run `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm --filter @musike/server bundle`, then build/run Docker through the existing operator pipeline. Historical patches in the repository are evidence, not additional installation steps.

BUG-021 now strips callback events and builds allowlisted wire data; actual React SVG fiber/click regression passes. BUG-022/007 keeps a stable audio element, complete next-byte handoff and play-intent-aware lock-screen actions. This is a source fix with physical Samsung acceptance still pending.

Offline: Library → Downloads/storage → select 512 MiB, 1 GiB or 2 GiB → Enable audio caching. Suggested 1 GiB is not enabled automatically. Recently played audio and complete lookahead bodies may be retained; explicitly download personal playlists, Resume interrupted pins and Download updates when lists change. Shared playlists require a personal copy. Downloads use current Wi-Fi/mobile data. Only complete audio endpoints/bodies are stored, including audio from video catalog items; actual video/HD/general authenticated APIs are excluded. Pins and pending pin memberships are protected from automatic eviction. Audio usage is exact; total site usage is a browser estimate. The old opaque artwork cache alone is replaced.

A previously verified account can reopen downloads after network failure. Known online auth failure cannot authorize fallback. Explicit logout removes that owner's offline data; offline logout also requires server logout on reconnect before the cookie can authenticate again. Only the last designated installation and one exclusive offline browser tab may output. No offline jams/transfers. Reconnect stops local output before fresh auth/server ownership. Another device's explicit takeover during disconnection cannot be detected; globally exclusive audio during that partition is not guaranteed under the accepted policy.

## 3. Documentation sync

`HERMES_FOUND_BUGS.md` updates current dispositions and appends a dated follow-up without rewriting historical reports. BUG-021/024 are resolved in source; BUG-022/007 and BUG-023 retain explicit physical/PWA acceptance gates. `ARCHITECTURE.md` section 8 maps the new browser route, IndexedDB schema/indexes, functions, storage bounds and output/auth lifecycle. No server endpoint or SQLite migration was introduced. Exact markdown snippets are in `BACKGROUND-OFFLINE-DOCUMENTATION-SYNC.md`.

## Verification and remaining acceptance

- PASS: 138 tests, zero failures/skips/cancellations; server/web TypeScript; production web/PWA build; server bundle; pnpm 10 frozen lockfile install.
- PASS: actual React SVG event/jam boundary, real browser coordinator modules with fixture transport, synthetic hidden lifecycle, IndexedDB admission/LRU/pin/concurrent isolation, complete-body audio-only validation, interruption/resume/logout and offline auth fallback/401/challenge/pending-logout fixtures.
- Browser visual/device acceptance was not completed: Chromium cannot launch in this environment (`socket() failed: Operation not permitted`). DOM fixtures use jsdom and storage fixtures use fake-indexeddb. Real browser quota, persistence and Web Locks remain manual acceptance checks.
- Required before promotion: Samsung A07 installed PWA, ten locked ordinary playlist and radio transitions on Wi-Fi and mobile data, notification persistence/manual next/pause; real offline restart/seek/quota/interruption; two tabs/devices and reconnect; narrow mobile import/focus; Docker and real provider/Discord regression. Follow `ACCEPTANCE-CHECKLIST.md`.
- Browser/OS force-stop, discard, storage clearing/eviction and denied persistence cannot be overridden by this web/PWA source. Do not infer physical-device success from fixtures.
