# Impact analysis — production fixes and device synchronization

Date: 19 November 2026. Base: uploaded musike-main (4).zip, archive SHA label a6a7d7fbddcee337b16b31cb9662542c111a13e6. Work was explicitly approved after the architecture/bug review and scope questions. This is a complete source deliverable plus a clean patch, not a deployment.

## Exact implementation boundaries

| Files | Functions/components changed or added | Reason |
| --- | --- | --- |
| server/src/phone.ts; accounts.ts | malaysianPhone/phoneOf, Accounts.open/normalizePhones/sendOtp/audit | Canonical Malaysian-only identities, fail-safe backfill and stdout audit |
| server/src/db.ts | Database worker initialization, featureSchema, backup RPC | Backed-up transactional additive schema; all SQL remains in worker |
| server/src/playbackSync.ts | cleanSnapshot, PlaybackSync.register/read/subscribe/act/close | Owner state, bounded commands, epoch/sequence fencing and silence-confirmed ownership |
| server/src/playbackRoutes.ts | registerPlayback | Authenticated registration/state/commands/SSE and cleanup |
| server/src/discord.ts | DiscordService.connect/callback/status/update/deliver/disconnect/close | OAuth/PKCE/encrypted lifecycle and coalesced private SDK delivery |
| server/src/discordRoutes.ts | registerDiscord | Cookie-owner routes and lifecycle wiring |
| server/src/app.ts | createApp request/error/telemetry hooks and feature wiring | Exact authenticated boundaries, trace/IP correlation and safe telemetry contracts |
| server/src/playbackDiagnostics.ts; index.ts | safePlaybackFields, structured startup | Fixed allowlist additions and stdout records |
| web/src/player/player.ts | load/warmQueue/onError/wire/toggle/onLoadingDeadline/suspendOutput/resumeOutput | Post-start stall recovery, buffer validation, cancellation and output ownership |
| web/src/lib/playbackSync.ts | startPlaybackSync, claimPlayback/releasePlayback, playbackCanOutput, usePlaybackDevices | Injected browser coordinator, remote commands, original shuffle identity, repeated transfers/reconnect and best-effort release |
| web/src/lib/api.ts; playbackDiagnostics.ts | request, PlaybackEvent/recordPlayback | Fixed operation labels, request IDs and numeric media-state fields |
| web/src/App.tsx | authenticated sync effect | Start/stop sync only after owner bootstrap |
| web/src/components/Controls.tsx; PlaybackDevices.tsx | ModeSwitch, PlaybackDevices | Existing button/Modal patterns; wrapping layout keeps new device control outside transport icons |
| web/src/components/AccountPanel.tsx; DiscordSection.tsx | AccountPanel, DiscordSection | Account link/unlink, device picker and release-before-logout |
| web/src/i18n/en.ts | features catalog | Typed labels; pt already explicitly inherits en.features |
| services/discord-presence/service.mjs; worker.cpp; Dockerfile; .dockerignore; README.md | Private service, isolated authenticated SDK adapter/build and setup | Optional server infrastructure; no official SDK files or credentials included |
| .gitignore | Vendor/build exclusions | Prevent SDK binaries/headers entering future commits |
| deploy/ytdlp-wrap.sh | Executable bit only, 0644 → 0755 | Uploaded mode prevented direct execution; wrapper content unchanged |

Tests added: phone.test.ts, playback-sync.test.ts, playback-sync-client.test.ts, discord.test.ts and discord-service.test.ts. Existing player-lifecycle.test.ts adds actual hidden-stall/cancellation regressions. Existing account/admin/Google fixtures use valid synthetic Malaysian values; the Google live-progress wait now observes both processed and durable imported counts, fixing a timing-sensitive assertion without changing import engine behavior.

## Documentation sync

HERMES_FOUND_BUGS.md preserves original reports, updates the disposition index and appends the corrected real trace and implementation evidence. ARCHITECTURE.md section 6 documents exact new tables/indexes/routes/module boundaries and limits. AGENTS.md records the approved scope. CHANGELOG.md, DEPLOYMENT-NOTES.md, ACCEPTANCE-CHECKLIST.md, TEST-RESULTS.md, README.md and PACKAGE-MANIFEST.md reflect current source behavior and pending acceptance.

New operator documents: docs/HERMES-VERIFICATION.md, docs/PLATFORM-REMOVAL.md, docs/CF-TUNNEL-AUDIT-PROMPT.md and services/discord-presence/README.md.

No dependency version, lockfile, shared discovery/provider token path, CSS variable, inline style system, existing Dockerfile/compose/environment content or unrelated module was refactored. Platform/native removal is intentionally an instruction deliverable for Hermes, not applied deletions.

## Evidence and remaining limits

106 tests pass and TypeScript/web/PWA/native/server/Electron bundles pass; see TEST-RESULTS.md for environment details. Browser screenshot testing was blocked by the environment's socket restriction, so no visual/physical-device acceptance is claimed. Official Discord headers/binaries/app access were not supplied; source integration and mock service tests are delivered, but native SDK compilation/headless profile acceptance remain pending. Actual Samsung/tunnel cause, the user's outstanding import acceptance, Hermes platform deletion and any production/Cloudflare changes remain operator work with the documented gates.

## Full changed/new source file inventory

- `.gitignore`
- `ACCEPTANCE-CHECKLIST.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `CHANGELOG.md`
- `DEPLOYMENT-NOTES.md`
- `HERMES_FOUND_BUGS.md`
- `PACKAGE-MANIFEST.md`
- `PRODUCTION-FIXES-IMPACT.md`
- `README.md`
- `TEST-RESULTS.md`
- `deploy/ytdlp-wrap.sh`
- `docs/CF-TUNNEL-AUDIT-PROMPT.md`
- `docs/HERMES-VERIFICATION.md`
- `docs/PLATFORM-REMOVAL.md`
- `server/src/accounts.ts`
- `server/src/app.ts`
- `server/src/db.ts`
- `server/src/discord.ts`
- `server/src/discordRoutes.ts`
- `server/src/index.ts`
- `server/src/phone.ts`
- `server/src/playbackDiagnostics.ts`
- `server/src/playbackRoutes.ts`
- `server/src/playbackSync.ts`
- `server/test/accounts.test.ts`
- `server/test/admin.test.ts`
- `server/test/discord-service.test.ts`
- `server/test/discord.test.ts`
- `server/test/google-import.test.ts`
- `server/test/phone.test.ts`
- `server/test/playback-sync-client.test.ts`
- `server/test/playback-sync.test.ts`
- `server/test/player-lifecycle.test.ts`
- `services/discord-presence/.dockerignore`
- `services/discord-presence/Dockerfile`
- `services/discord-presence/README.md`
- `services/discord-presence/service.mjs`
- `services/discord-presence/worker.cpp`
- `web/src/App.tsx`
- `web/src/components/AccountPanel.tsx`
- `web/src/components/Controls.tsx`
- `web/src/components/DiscordSection.tsx`
- `web/src/components/PlaybackDevices.tsx`
- `web/src/i18n/en.ts`
- `web/src/lib/api.ts`
- `web/src/lib/playbackDiagnostics.ts`
- `web/src/lib/playbackSync.ts`
- `web/src/player/player.ts`
