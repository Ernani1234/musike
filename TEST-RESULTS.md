# Current verification — background/offline revision, 20 November 2026

Uploaded baseline: `c1293caa1302c779b589289b6ba590c2d43f6caa`. Node v24.22.3, pnpm 10.14.0. Docker targets Node 22; no container/device acceptance is implied.

| Check | Observed result |
| --- | --- |
| `pnpm test` | PASS — 138 tests, 0 failed, 0 skipped/cancelled |
| `pnpm typecheck` | PASS — server and web |
| `pnpm build` | PASS — production web/PWA, 36 precached entries, 868.91 KiB |
| `pnpm --filter @musike/server bundle` | PASS |
| `pnpm install --frozen-lockfile` | PASS with pnpm 10.14.0 and available cache/registry; new test dependencies linked, esbuild postinstall succeeded |
| Dependency scope | Only server devDependencies jsdom 27.2.0 and fake-indexeddb 6.2.4 plus 43 required lock package/snapshot additions; existing lock entries/versions preserved |
| Existing shell wrapper | All five fixtures pass; content unchanged, original ZIP executable permissions retained |
| Source/patch/archive | Clean patch application, byte/tree/hash and ZIP CRC verification recorded with this package |
| Headless Chromium | NOT RUN successfully — browser exits at launch (`socket() failed: Operation not permitted`). Actual React SVG and AuthGate tests use jsdom; storage fixtures use fake-indexeddb, not real-browser quota/eviction |
| Samsung A07 / Wi-Fi / mobile / locked notification | PENDING — synthetic hidden/media fixtures do not establish physical OS behavior |
| Real offline PWA, quota/persistence/Web Locks, provider/tunnel, Discord SDK and Docker runtime | PENDING — operator acceptance in ACCEPTANCE-CHECKLIST.md |

Sixteen new fixtures cover Media Session/metadata and data-only commands, the actual React SVG fiber/click/jam pipeline, owner/budget/pin/concurrent IndexedDB admission, full-body audio-only downloads, interruption/resume/logout and last-output eligibility, and real AuthGate fallback for offline/401/challenge/pending logout. One additional preload hydration fixture brings the suite from 121 to 138 tests. Existing lifecycle fixtures now verify the same audio element rather than a spare and exercise loading play/pause cancellation. The reported OS freeze cause remains unproven until physical testing.

The pnpm 11 fallback attempted an automatic policy install and stopped; its unsolicited workspace setting was removed. Final package commands and frozen install used the repository-pinned pnpm 10.14.0. No dependency artifacts or generated build output enter the source ZIP.

---

# Current verification — expanded web/PWA revision, 19 November 2026

Baseline upload: `79958c4d54b9173ce2d80182973c6dce80e208be`. Node v24.22.3; package commands use pnpm 10.14.0. Production Docker still targets Node 22; no actual container runtime was available here.

| Check | Actual result |
| --- | --- |
| `pnpm test` | PASS — 121 tests, 0 failures, 0 skipped |
| `pnpm typecheck` | PASS — server and web packages |
| `pnpm build` | PASS — production web/PWA assets and service worker |
| `pnpm --filter @musike/server bundle` | PASS — bundled server |
| pnpm 10.14 lockfile-only generation | PASS — offline metadata reconstructed from already-installed integrity-pinned packages; 810 → 436 package entries; no new package versions or direct dependency upgrades |
| Clean `pnpm install --frozen-lockfile --offline` | Resolution accepted the lockfile, but reinstall could not finish: the pnpm 10 store lacked the Geist 5.3.0 tarball. Earlier registry lookup returned HTTP 403 for an existing transitive package. Source checks used the existing cached exact-version dependencies; a clean install remains an operator check |
| Retired-platform executable reference sweep | PASS — no remaining local imports, native scripts, Capacitor/Electron dependencies or Docker COPYs; intentional upstream remote streaming URL retained |
| Patch/tree/hash verification | PASS — clean patch application, complete resulting tree/byte comparison and archive source hashes |
| Headless browser visual inspection | NOT COMPLETED — installed Chromium exited during launch; no screenshot/UI acceptance claimed |
| Docker image build/run | NOT RUN — Docker unavailable |
| Official SDK C++ build and actual revised presence service | NOT RUN — private vendor headers/binaries are not supplied; the prior Hermes CA fix/user-confirmed presence remains documented |
| Samsung/background, real jam timing, public playlist and tunnel/provider acceptance | PENDING — fixtures are not physical device or live provider evidence |

Added/extended fixtures cover accepted friend requests and phone privacy; opt-in presence; owner-controlled groups; viewer/editor grants, optimistic conflict rejection, revocation and explicit copies; public import ordering/dedup/partial failures/checkpoints/cancellation; direct Malaysian admin phone edit and session/challenge revocation; guarded hard deletion and FK cleanup; backed-up/idempotent migration; complete preload body bounds and release; foreground recovery without overriding deliberate pause; false SSE liveness and explicit stale takeover; and actual browser coordinator modules across account/device/jam boundaries using synthetic media/transport.

The jam removal authorization fixture rejects naming a nonmember and verifies that a rejected request cannot change room settings or affect the unrelated account. Existing legacy auth-off, media Range/cache, matching, OAuth, provider-redaction, wrapper and cancellation fixtures remain passing. The wrapper's uploaded executable permission was restored; its content did not change.

---

## Historical verification records (superseded by current results above)

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

## Approved BUG-007–012 + device-sync revision — 19 November 2026

| Check | Actual result |
| --- | --- |
| Full pnpm test script | **106 tests passed; 0 failed, 0 skipped** |
| pnpm typecheck script | Server, web, standalone native types and Electron types passed |
| pnpm build | Web/PWA production build passed; manifest/service worker generated |
| pnpm --filter @musike/server bundle | Passed |
| pnpm --filter @musike/web build:native | Passed; existing large-chunk advisory remains |
| pnpm --filter musike-desktop bundle | Passed |
| Node syntax check: presence service.mjs | Passed |
| git diff --check | Passed |
| Browser screenshot/UI runtime test | Attempted but blocked: no packaged Playwright browser; system Chromium then failed with socket Operation not permitted. No visual acceptance claimed. |
| Official Discord C++ SDK compilation/runtime | Not run: Developer Portal SDK headers/binaries and application access not supplied. HTTP service used a mock SDK process in tests. |
| Docker image, physical device, live provider and Cloudflare acceptance | Not run here; Hermes checklist supplied |

Environment: Node v24.22.3; available pnpm runner 11.25.0; repository declaration pnpm@10.14.0 is unchanged. The environment runner attempted dependency verification/build-policy rewriting on initial bare pnpm commands. Those workspace edits were removed. Checks were executed with environment-only `--config.verifyDepsBeforeRun=false --config.managePackageManagerVersions=false` so source/lockfile policy remained unchanged. The operator should use the declared pnpm 10.14.0 and production Node 22.13+ in the image pipeline. Dependency package versions and lockfile did not change.

Regressions added: Malaysian format equivalence and foreign rejection; consistent phone backup/backfill/idempotence and collision failure; server ownership/command/transfer fencing; two actual browser coordinator modules against the real synchronization backend, including reconnect, shuffle object identity and pause-before-output ordering; actual player hidden playing→waiting recovery, position retention and cancellation; Discord PKCE/owner/single-use/encrypted storage and identity uniqueness; playback/clear/disconnect and safe logs; real internal HTTP service authentication/capacity/cleanup with an injected mock SDK process.

One existing Google progress fixture was timing-sensitive: it observed processed=1 before its durable imported count reached 1 under parallel load. Its wait now requires both conditions; no Google engine behavior changed. Synthetic account fixtures were changed to Malaysian canonical-compatible examples. The original wrapper's ZIP permission was 0644 and direct execution failed; contents are unchanged and executable mode is restored.

These results establish source behavior, not the original tunnel cause, uninterrupted physical lock-screen audio, rendered narrow/TV UI quality, vendor SDK compatibility or production deployment. Historical results above belong to earlier packages.
