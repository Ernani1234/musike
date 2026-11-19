# Impact analysis — approved expanded revision

Baseline: uploaded source `79958c4d54b9173ce2d80182973c6dce80e208be`. Changes are limited to the approved bug fixes/features, platform retirement, their wiring/tests and documentation. Complete replacements are present in the ZIP; the clean patch includes deletions and the wrapper executable permission.

| Exact source files | Modified/added functions and responsibility |
| --- | --- |
| `server/src/accounts.ts`, `server/src/adminRoutes.ts` | `requestOtp`, `verifyOtp`, `changeUser`, `deleteUser`, `requireAdmin`, account revocation callback; `registerAdmin`, paged users/ops, live playback and DELETE route |
| `server/src/db.ts` | `Database` worker startup: backed-up transactional `social-import-admin-v1`, exact schema/indexes documented in architecture |
| `server/src/app.ts`, `server/src/googleImport.ts` | `createApp` service construction/recovery/close and revoke wiring; `cancelUser` for import cleanup |
| `server/src/playbackSync.ts`, `server/src/playbackRoutes.ts` | `live`, `reconcile`, `read`, `act`, `changed`, `applyJam`, `current`, `hasPendingJam`, `dropUser`; client ping and non-touching SSE heartbeat |
| `server/src/ytdlp.ts`, `server/src/playlistImport.ts`, `server/src/playlistImportRoutes.ts` | `ytdlpPlaylist`, `playlistId`, importer `start/status/resume/cancel/run/recover/close`, owner-scoped route registration |
| `server/src/social.ts`, `server/src/socialRoutes.ts`, `server/src/library.ts` | `Social` state/request/respond/friend/group/grant/edit/copy/preferences operations and route guards; `sanitizeOrigin`, `editPlaylist`, monotonic playlist revisions |
| `server/src/jams.ts`, `server/src/jamRoutes.ts` | `Jams` membership, invitations, settings, canonical commands, output/observe/publish, host reconciliation, lifecycle cleanup, bounded rate admission and routes |
| `server/src/types.ts`, `web/src/lib/types.ts` | Origin supports public YouTube playlist provenance |
| `web/src/player/player.ts`, `web/src/lib/playbackPreload.ts`, `web/src/lib/audio.ts` | `load`, `warmQueue`, `restorePlayback`, suspend/session cleanup; bounded complete-body preload; browser-only audio factory after bridge retirement |
| `web/src/lib/playbackSync.ts`, `web/src/components/PlaybackDevices.tsx` | Client ping, explicit stale claim, server jam command application, transport interception, drift alignment and device picker action |
| `web/src/lib/jams.ts`, `web/src/components/JamPanel.tsx` | Account-isolated jam store, serialized controls, bounded polling, output choice and invitation/host UI |
| `web/src/lib/social.ts`, `web/src/views/Social.tsx`, `web/src/views/SharedPlaylist.tsx` | Typed API adapters, friends/groups/permissions/presence views, live shared read/edit/copy with optimistic revisions |
| `web/src/components/PlaylistImportDialog.tsx`, `web/src/views/Library.tsx`, `web/src/views/Collection.tsx` | Import start/progress/report paging/retry/cancel, incoming shares and correct public YouTube origin labels |
| `web/src/components/AdminPanel.tsx` | Existing panel extended with paged users/clients, live playback, direct phone form and typed deletion modal |
| `web/src/App.tsx`, `web/src/main.tsx`, `web/src/lib/routes.ts`, `web/src/components/Rail.tsx`, `web/src/components/MobileChrome.tsx` | Authenticated coordination lifecycle, Social/shared routes, browser-only startup and navigation |
| `web/src/stores/ui.ts`, `web/src/i18n/index.ts`, `web/src/tv/tvMode.ts`, `web/src/lib/api.ts`, `web/src/lib/apiTypes.ts`, `web/src/lib/backup.ts`, `web/src/components/BackupSection.tsx` | Remove retired bridge imports/calls or obsolete native-target comments; preserve browser behavior |
| `web/src/i18n/en.ts`, `web/src/i18n/pt.ts` | Typed collaboration/navigation/transfer labels and explicit English fallback; browser backup wording |
| `services/discord-presence/worker.cpp`, `services/discord-presence/service.mjs` | Remove SDK file logger; retain only sanitized numeric status/error/code fields. CA-installing service Dockerfile is unchanged |
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `Dockerfile`, `.gitignore`, `.dockerignore` | Remove retired workspace/dependencies/build paths and update source Docker manifest inputs; retain PWA/proxy configuration |
| `deploy/ytdlp-wrap.sh` | Executable permission only; content unchanged |

Retired paths: `desktop/`, `mobile/`, `web/src/native/`, `web/tsconfig.native.json`, `web/src/lib/desktop.ts`, `web/src/components/TitleBar.tsx`, `.github/workflows/release.yml`. The complete per-file deletion list follows in the patch.

Tests modified/added: `server/test/admin.test.ts`, `server/test/collaboration.test.ts`, `server/test/playback-preload.test.ts`, `server/test/playback-sync-client.test.ts`, `server/test/playback-sync-deadlock.test.ts`, `server/test/player-lifecycle.test.ts`.

Documentation synchronized: `AGENTS.md`, `ARCHITECTURE.md`, `HERMES_FOUND_BUGS.md`, `README.md`, `CHANGELOG.md`, `DEPLOYMENT-NOTES.md`, `ACCEPTANCE-CHECKLIST.md`, `TEST-RESULTS.md`, `PACKAGE-MANIFEST.md`, `docs/PLATFORM-REMOVAL.md`, `docs/HERMES-VERIFICATION.md`, `services/discord-presence/README.md`, plus this impact, handoff, documentation snippets and current SHA manifest.

No CSS source file, existing compose/environment/deployment-script content, provider credentials, runtime database or unrelated discovery module was changed.
