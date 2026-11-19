# Current acceptance — expanded web/PWA revision, 19 November 2026

The earlier checklists below are historical evidence. Current automated results and limits are in TEST-RESULTS.md.

- [x] Retired application directories/native build wiring removed; source Docker inputs updated; remaining dependency versions preserved.
- [x] Friend acceptance, phone privacy, opt-in presence, group ownership, shared viewer/editor authorization, stale-edit rejection and revocation/copy fixtures.
- [x] Ordered public import, duplicate prevention, partial failure, progress before completion, owned checkpoints and cancellation fixtures.
- [x] Direct admin Malaysian phone edit, collision/foreign rejection, session/challenge invalidation, guarded permanent deletion and cascading cleanup fixtures.
- [x] Same-account browser coordinator fixtures plus cross-account jam queue/controls/host loss, single-output permissions and drift correction fixtures.
- [x] Complete preload byte bounds/retention, hidden retry/unlock recovery, cancellation, stale-device takeover and false-SSE-liveness regression fixtures.
- [ ] Samsung A07: playlist and radio × Wi-Fi and data, ten locked transitions per combination, deliberate pause/skip, unlock recovery and memory behavior.
- [ ] Two real accounts/devices: invitation, separate output selection, guest queue addition, foreground alignment near one second, host disappearance/claim and reconnect/autoplay behavior.
- [ ] Real 50-video public YouTube playlist: usable tracks in source order, progress, private/unavailable reporting and duplicate-free rerun. No Google credentials used.
- [ ] Real PWA install, phone/wide/TV UI, reader/keyboard/focus behavior, narrow-screen admin forms and shared editing.
- [ ] Actual Docker image build/run and data migration/backup/rollback through the operator pipeline.
- [ ] Official Discord SDK build and revised service regression: Ready/profile, pause/transfer/second user and no vendor file logs.
- [ ] Correlate Samsung trace IDs with origin/tunnel/Access/WAF logs before attributing the remaining incident cause.
- [ ] Approve production promotion separately; this package changes source only.

---

## Historical acceptance records

# Acceptance checklist — fork plus 19 November bugfixes

Checked boxes below refer to automated fixtures/build checks performed for this package. Unchecked boxes require the operator's demo, external provider or physical device. They are not implied successes.

## Phase 1 — Queue pre-caching

- [x] Primary refusal falls back to complete cached audio bytes; warm hits do not re-resolve URLs.
- [x] Direct candidate is usable while a primary wrapper resolution remains pending.
- [x] Warm HTTP audio serves exact local-file Range bytes without upstream work.
- [x] Shared audio/HD usage accounting, active leases, budget stop/no-thrash and rapid-skip cancellation fixtures pass.
- [x] Server lookahead is validated/persisted; older queue-window revisions cannot replace newer skips.
- [x] Pure ordered/manual/repeat-all window regression passes; web/native/desktop code compiles.
- [ ] Measure warm primary and direct-fallback playlist/radio advances against the same local-file baseline on demo; record browser timings and audible gaps.
- [ ] Exercise real radio tail filling, optimistic queue insertion/removal, shuffle/repeat, rapid skips and concurrent clients under the deployed cache budget/wrapper.
- [ ] Verify cold-path 403 behavior and keep/remove the existing wrapper only from measured evidence. This package does not certify BUG-001's upstream cause is fixed.

## Phase 2 — Accounts, OTP and migration

- [x] Migration backup/exact original preservation/idempotent restart and malformed-source failure pass.
- [x] ADMIN_PHONE first-login bootstrap, invite-only creation, per-user isolation and single-use codes pass.
- [x] Cooldown, expiry, attempt cap, concurrent resolved-IP request limit and wasphere contract/no automatic 408/5xx retry pass with injected providers.
- [x] Secure cookie issuance, access refresh, server logout, disabled-user revocation, last-admin guard and API login wall/CSRF pass.
- [x] Auth-off legacy library/static/media tests remain green.
- [ ] A real wasphere OTP arrives for the configured admin; migrated data appears; an invited second account starts empty; uninvited phone receives no message.
- [ ] Verify actual HTTPS cookie/remember-me expiry/logout, backup/restore and failure recovery on the NAS volume.
- [ ] Run bundled promotion/revocation against demo and confirm access from a separate browser; ensure last admin cannot be removed.
- [ ] Verify hosted Android/iOS/TV cookie login, session-loss media stop and background playback. Standalone local mode remains independent.

## Phase 3 — Admin and ops

- [x] Non-admin APIs return 403 for settings/users/ops/system controls; settings validate and survive app restart.
- [x] Two distinct authenticated clients appear in ops; disabling a user removes their session/presence.
- [x] Direct/unconfigured, trusted XFF, trusted CF and untrusted-spoof cases attribute expected IPs in both presence and audit.
- [x] Admin actions emit IP-attributed structured logs and retained audit rows; sensitive request queries/headers are not serialized.
- [ ] Confirm all four panels are absent for a non-admin; exercise edits in dark/light themes and narrow/TV layouts.
- [ ] Open a second real browser, confirm the live count within seconds, and verify actual tunnel client IPs instead of the Docker bridge address.
- [ ] Verify persisted cache/lookahead/quality/arguments and OTP controls on restart; inspect server logs for audit attribution without credentials.

## Phase 4 — Google import

- [x] Fixture OAuth state single use, PKCE scope, owner-bound callback and encrypted stored tokens pass.
- [x] Ordered playlists, album-origin playlists, likes and latest-history fixture imports report per item and rerun without duplicates/resolution work.
- [x] A second user's import never changes the first user's library; refresh credentials survive reopen/restart.
- [x] Unavailable categories return partial reports; matching rejects an arbitrary wrong-artist search result.
- [x] Daily sync is off by default, per-user opt-in/opt-out is enforced and disconnect revokes/deletes credentials in fixtures.
- [ ] Configure Google Cloud test users/client/HTTPS redirect and perform real consent, refresh and revocation. Never copy actual tokens into acceptance evidence.
- [ ] Import a small real library and verify all four categories actually granted by the provider. Albums/history use private Music APIs and may be refused; public API fallback covers playlists/likes only. Record unavailable categories as unresolved acceptance, not empty successful imports.
- [ ] Verify idempotent manual top-ups, imported-origin UI labels, restored/edited collections and independent second-user consent/import on demo.
- [ ] Opt in only one demo user, advance/wait for the real daily schedule and confirm no other account syncs. Google may reject embedded WebView consent; use a regular browser for connection.

## Delivery/build scope

- [x] Full suite, TypeScript checks and web/PWA, native-mode, server and Electron bundles pass; see TEST-RESULTS.md for exact results.
- [x] ZIP is a changed/new-file source overlay; operator-owned .env, compose and deployment files, credentials, dependencies, caches/DBs and generated bundles are excluded.
- [ ] Build/run the actual Docker image and native installers with the operator pipeline and verify architecture-specific Node/device behavior. No production deployment was performed here.


## 19 November — BUG-002–006 regression acceptance

- [x] Unicode/artist/duration/version/ambiguity matching tests and original-ID/ordered fallback fixtures.
- [x] Live owner-scoped progress before job completion; bounded report deltas; review candidates/provider failures; idempotent retry and preserved restart checkpoints.
- [x] Cold first-usable-byte race, stalled primary cancellation, byte ranges, 416, admission bounds and cancellation/shared resolver ownership.
- [x] Actual Zustand player code exercised with synthetic media: playList, manual mutations, jump/shuffle/repeat, hidden ended handoff, stale radio results, transient recovery and autoplay fallback.
- [x] Request trace isolation, HTML/opaque-redirect/challenge/error classification, telemetry bounds/redaction/auth wall and owner-scoped non-resolving probes.
- [x] POSIX wrapper success/arguments, transient retry cap/clean stdout, fatal/pass-through behavior, explicit delay override and signal reaping.
- [x] Full tests/typechecks and web/native/server/desktop bundles pass; exact results in TEST-RESULTS.md. CSS, dependencies, DB schema and other deployment files unchanged.
- [ ] Re-run the actual failed Takeout/Google input; this source contains no Takeout adapter or the 387-item failed export. Record genuine unavailable/review counts and verify selected replacements.
- [ ] Capture real radio-stall timing with diagnostics enabled; correlate browser trace/Ray IDs, origin stages and Access/WAF/tunnel records.
- [ ] Test the reported Android PWA with screen off across at least ten transitions, plus manual next, rapid skips, pause/resume, online recovery and app restart. Synthetic hidden visibility is not physical-device evidence.
- [ ] Compare wrapper legacy-delay and override-zero modes on demo, with real primary/direct fallback/403 behavior. Preserve rollback until measured.
- [ ] Confirm source-only overlay installation keeps the approved wrapper executable, all operator-owned settings/mounts intact and owner/session isolation functional. No production deployment was performed here.

## 19 November — BUG-007–012 and account playback sync

- [x] Actual player fixtures exercise hidden playing→waiting→position-preserving recovery and pause/skip cancellation.
- [x] Phone normalization/backfill/backup, invalid/foreign rejection, canonical collisions and idempotence fixtures.
- [x] Real server sync policy plus two real browser coordinator modules verify remote controls and pause-before-transfer ordering, stale-write rejection and owner/session isolation.
- [x] Discord OAuth PKCE/single-use/owner state, encrypted tokens, identity uniqueness, playback/clear/disconnect and log redaction fixtures.
- [x] Internal service HTTP authentication, capacity/worker cleanup and log redaction with a mock SDK process.
- [ ] Samsung A07 physical playlist/radio × Wi-Fi/mobile-data, ten consecutive locked transitions per combination, including sustained progress after handoff.
- [ ] Real origin/tunnel/Access/WAF correlation for the reported or newly captured stall.
- [ ] Real cross-device autoplay, transfer/offline/close/restart/disable/session-expiry and narrow-screen UI acceptance.
- [ ] Official vendor SDK compilation, app eligibility, headless Ready, two users' real Discord profiles and absence of vendor-created log files.
- [ ] Hermes separate platform retirement commit and Docker image acceptance.
- [ ] Azan approval before production promotion or Cloudflare/tunnel changes.
