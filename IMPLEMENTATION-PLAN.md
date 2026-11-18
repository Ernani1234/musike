# Implementation map and safe execution order

This source overlay was implemented sequentially on fork main `85843fd`: phase 1 cache/queue, phase 2 accounts/storage, phase 3 admin/proxy, phase 4 import. Initial checks used the uploaded ARCHITECTURE.md and append-only HERMES_FOUND_BUGS.md; the archive had no AGENTS.md. No upstream rebase or operator-file change is part of this package.

## Files and architectural boundaries

| Phase | New files | Existing files updated | Boundary |
| --- | --- | --- | --- |
| 1 | server/src/audioCache.ts, cacheBudget.ts; web/src/lib/playbackQueue.ts; server/test/audio-cache.test.ts, playback-queue.test.ts | server/src/app.ts, config.ts, taskQueue.ts, ytdlp.ts; web/src/player/player.ts, lib/api.ts, apiTypes.ts, native/api.ts | Node media/cache stays in server/src; queue orchestration stays in player; pure queue helper remains browser-safe; native API remains compatible |
| 2 | server/src/accounts.ts, accountRoutes.ts, db.ts, secret.ts, proxy.ts, promote.ts; web/src/components/AuthGate.tsx, stores/session.ts; server/test/accounts.test.ts | server/package.json, src/index.ts, app.ts, library.ts; web/src/main.tsx, App.tsx, components/SettingsDialog.tsx, lib/api.ts, lib/audio.ts, player/player.ts; i18n/en.ts, pt.ts | Routes wired through app, SQL behind worker RPC, pure library factory shared with native; auth screen resolves before lazy App/private stores |
| 3 | server/src/adminRoutes.ts; web/src/components/AdminPanel.tsx, AccountPanel.tsx; server/test/admin.test.ts | server/src/app.ts, accounts.ts, accountRoutes.ts, config.ts, proxy.ts; web/src/App.tsx, components/SettingsDialog.tsx, i18n/en.ts, pt.ts | Instance settings/actions require server role checks; device preferences retain existing stores/tokens; one real-IP resolver feeds rate limits/logging/presence |
| 4 | server/src/googleSource.ts, googleImport.ts; server/test/google-import.test.ts | server/src/app.ts, accounts.ts, db.ts, library.ts, types.ts; web/src/components/AccountPanel.tsx, TrackMenu.tsx, views/Library.tsx, Collection.tsx, lib/types.ts, i18n/en.ts, pt.ts | Per-user import-only OAuth, source adapter, bounded jobs and mappings stay server-side; existing library/backup model gains optional origins; React UI reuses existing list paging |
| Documentation | AGENTS.md, CHANGELOG.md, DEPLOYMENT-NOTES.md, DATABASE-DECISION.md, IMPLEMENTATION-PLAN.md, ACCEPTANCE-CHECKLIST.md, TEST-RESULTS.md | ARCHITECTURE.md, HERMES_FOUND_BUGS.md (append), README.md, PERFORMANCE_AUDIT.md, IMPLEMENTATION_SUMMARY.md | Current maps/schema/contracts synchronized; historical audit evidence remains labelled; deployment/source overlay rules explicit |

Files shared by phases were changed once in the delivered result; the ZIP contains full final files, not fragments or a patch. The complete payload list is in PACKAGE-MANIFEST.md. No new CSS token, inline styling system, innerHTML application renderer or dependency version was introduced.

## Execution order for the operator

1. Back up the current data consistently and preserve the known-good source/deployment configuration. Apply the overlay to the stated fork root. Keep all operator .env/compose/wrapper/deployment files.
2. With auth off and Google unset, run tests/typechecks/builds and smoke-test existing browser/native/TV library, queue, playback and backup flows. Measure primary/direct cached advances and rapid skips. The original shared JSON remains the source of truth here.
3. On demo, configure ADMIN_PHONE, the four wasphere variables, HTTPS public origin and stable secret/persistent secret file. Set explicit proxy trust only after observing the immediate peer. Enable AUTH_ENABLED. Confirm backup, migrated owner and first-admin OTP before inviting a second user. Restart and verify no reimport.
4. Confirm account isolation and the admin/non-admin API/UI boundary, last-admin safeguard, settings persistence, real IPs and heartbeat clients. Test session expiry/logout and hosted shells.
5. Configure Google consent/client/redirect in demo, then connect/import a small account. Verify all available categories and partial/unavailable reporting, order/origin markers, rerun top-ups, a second user's isolation and token refresh after restart. Leave daily sync off until manual acceptance; opt in one test user and verify others remain idle.
6. Record all unchecked live items in ACCEPTANCE-CHECKLIST.md before production rollout. This is a WIP demo package; successful mocked tests/builds do not assert provider/device acceptance. Keep the current BUG-001 wrapper mitigation pending those results.
7. If rolling auth back, export new per-user libraries first: turning auth off resumes the untouched old JSON and does not merge SQLite edits. Preserve DB/secret/backups for recovery. No reverse schema migration is needed for auth-off startup.
