# Musike expanded production handoff — 19 November 2026

Implemented the user-approved web/PWA revision against upload `79958c4d54b9173ce2d80182973c6dce80e208be`. This is source delivery, not deployment.

## Impact analysis

BUG-008 is now executed: desktop, mobile, native bridges and installer wiring are removed. The remaining workspace is server + web/PWA. The lockfile shrank from 810 to 436 package entries without new package versions/direct upgrades. `EXPANDED-IMPACT.md` lists exact source files/functions and test/documentation changes.

BUG-007 has a new bounded complete-byte preload/foreground recovery mitigation; physical Samsung acceptance remains pending. BUG-013 now uses inbound liveness, bounded transfers and explicit stale takeover. BUG-014's working CA fix is retained and verbose SDK file logging removed. BUG-015 supplies playlist-link import with progress/checkpoints/retry/dedup. BUG-016 supplies friends/groups, viewer/editor sharing, explicit copies, opt-in presence and cross-account jams. BUG-017 supplies paged admin live playback, permanent deletion and direct Malaysian phone editing without OTP, as explicitly requested.

## Code changes and installation

The ZIP contains complete source replacements and `EXPANDED-FIXES.patch`. The separate patch has identical bytes. Choose one installation method against the matching fork baseline:

1. Apply the patch to a clean checkout of the uploaded baseline, inspect the diff, then run the checks below; or
2. Use the complete ZIP in a clean source directory, preserving operator-owned environment/compose files and persistent volumes through the existing deployment process.

Unzipping over the old tree does not perform deletions. Do not apply the archived older patch files after this release. Preserve the executable bit of `deploy/ytdlp-wrap.sh`. Only the two retired package COPY instructions/comment changed in the source Dockerfile; runtime paths/tools and existing operator compose/environment files are unchanged.

Before auth-enabled startup, make a consistent data + instance-secret backup. The `social-import-admin-v1` worker migration creates a protected consistent snapshot of existing data, then applies schema/indexes and its marker transactionally. Use one application process per data directory. Interrupted imports remain resumable; rooms restart paused with hosting vacant.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm --filter @musike/server bundle
```

Use pnpm 10.14.0. Build/run the actual Docker image through the existing operator pipeline before promotion. Restore the matching source/image plus pre-migration data/secret backup for rollback of the full expanded release.

## Documentation sync

`HERMES_FOUND_BUGS.md` updates the current index and appends dated dispositions without rewriting historical reports. BUG-007 remains device-verification pending. The original BUG-017 OTP requirement is explicitly superseded by the user's direct-edit instruction. `ARCHITECTURE.md` section 7 documents current file wiring, endpoints, exact DDL/indexes, bounds and UI conventions. `EXPANDED-DOCUMENTATION-SYNC.md` contains the exact replacement/append snippets. Deployment, acceptance, retirement and SDK notes are synchronized.

## Validation and practical limits

- PASS: 121 tests, 0 failed/skipped; server/web type checks; production web/PWA build; bundled server.
- PASS: pnpm 10.14 lockfile generation and retained-version comparison. Clean frozen-lockfile resolution accepts the manifests, but an offline reinstall was blocked by a missing Geist tarball; an earlier registry lookup returned 403. Checks used existing cached exact-version dependencies. Repeat a clean install in the operator environment.
- PASS: retired-platform executable reference sweep; protected CSS/compose/runtime paths preserved. The clean patch applies to a fresh baseline worktree; its resulting source paths/bytes match the deliverable and the archive source hashes verify.
- NOT RUN: Docker image/runtime (Docker unavailable), C++ SDK build/revised service (vendor files absent), visual browser acceptance (Chromium exited on launch).
- PENDING: Samsung A07 playlist/radio × Wi-Fi/data, ten locked transitions each; real two-account jam timing/autoplay/reconnect; real 50-video playlist import/rerun; revised real Discord presence/no vendor logs; matching origin/tunnel/Access/WAF correlation.

A complete preload body is capped at 16 MiB with a 25-second deadline. It cannot keep a killed PWA alive or bypass lost authorization. One active Blob may coexist with one upcoming download. An unreachable old output may retain buffered audio even after the user explicitly takes over. Foreground jam alignment targets approximately one second on a stable connection, not sample-accurate/background playback.

Presence is off by default for friends; admin playback visibility is independent. Revoking a share removes original access, while explicit personal copies remain. Admin phone edits reject foreign/colliding numbers, preserve UUID ownership and revoke sessions/challenges. Deletion is guarded/audited and removes owned live data; existing backups follow operator retention. Provider revocation is best effort.

No production account was deleted, no production deployment occurred and no Cloudflare/operator configuration was changed.

## Remaining issue status

Earlier BUG-001/004/006 remain mitigated/incident-verification pending, BUG-002 needs the actual failed-input acceptance rerun, BUG-003 stays closed and BUG-005 stays provisionally accepted. Do not mark all incident/device issues closed based solely on these fixtures.
