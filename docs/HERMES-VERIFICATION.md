# Hermes handoff — 19 November 2026 production revision

## Package and responsibilities

This is a complete fork source tree based on uploaded `musike-main (4).zip` (archive comment SHA `a6a7d7fbddcee337b16b31cb9662542c111a13e6`). It also includes a clean `PRODUCTION-FIXES.patch`. Apply either the full source or the patch, never both. Keep operator runtime files. Source modifications were approved after the impact review. No production access or deployment was performed by Codex.

Included: post-handoff stall recovery/diagnostics; Malaysian identity backfill; per-account single-output playback synchronization; authenticated Discord OAuth/service source; removal and Cloudflare audit instructions.

Platform deletion belongs to Hermes, in its own follow-up commit. The source intentionally retains the legacy native targets until the removal runbook is executed. Discord source is supplied but is **not certified operational**: the official SDK headers/binaries, application access, real OAuth consent and headless presence acceptance require the operator environment. Do not mark those items resolved from mocked tests.

## Installation sequence

1. Record source/image revisions and the current operator configuration. Stop demo and make a consistent data-directory backup, including SQLite/WAL/SHM and the instance secret. Preserve source and the old image for rollback.
2. Apply the complete source/patch to demo. The only existing deployment-file change is the executable bit of `deploy/ytdlp-wrap.sh`; its contents and runtime settings are unchanged. Preserve executable modes when extracting.
3. Use pnpm 10.14.0, Node 22.13+ and the existing pipeline. Run `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm --filter @musike/server bundle`. Until platform retirement also run the native and Electron bundles listed in TEST-RESULTS.md.
4. Start demo. Additive playback/Discord schema migration backs up an existing populated database with SQLite `VACUUM INTO`, then creates tables/marker in a transaction. Malaysian identity migration preflights all users and phone-bound invites, takes a consistent mode-0600 backup, normalizes values transactionally and invalidates outstanding OTP challenges. UUIDs, libraries, roles, sessions and encrypted Google credentials keep their owners.
5. If an invalid legacy number or canonical collision stops startup, do not merge/delete identities or bypass the marker. Inspect the protected database locally; report only user UUIDs and conflict counts to Azan and resolve the mapping with him. Foreign identities require an explicit operator decision. Never put phone values in logs or source.
6. Verify all tests below before proposing production promotion. Backups under the data directory are data protection artifacts, not application log files.

## Capture BUG-007 at origin and edge

The supplied 48-event client export contains `player.playing` at **13:03:49.368 MYT**, then `player.waiting` at **13:03:51.179**, then failures around **13:04:17**. This is a post-start stall. Original trace UUID: `d28b418d-5564-4c33-b720-8f409d014316`. Relevant origin timestamp window: 2026-11-19 05:01–05:05 UTC / 13:01–13:05 MYT.

Read retained Musike stdout and the corresponding connector/Access/WAF events. Operator example: `docker logs --timestamps --since 2026-11-19T05:01:00Z --until 2026-11-19T05:05:00Z <actual-musike-container>`. Use the actual discovered container, not a guessed name. If the historical data has rotated away, say so and capture a new reproduction.

On demo enable `MUSIKE_PLAYBACK_DIAGNOSTICS=true`, restart and reload the PWA. New client events identify fixed operation categories (`queue.prepare`, `library.history`, etc.), response request IDs and numeric media position/buffer/ready/network/error states. Server events include trace/request IDs and available Ray IDs. Correlate new requests end to end; do not log provider URLs, request queries, cookies, OTPs, headers, tokens or raw provider errors. Client events remain untrusted diagnostic claims. Records not reaching the app cannot appear in its stdout; collect edge/device evidence separately.

On the Samsung A07 PWA run at least **ten consecutive transitions in each playlist/radio × Wi-Fi/mobile-data combination**. Include lock before the end, lock immediately after starting, cold/warm cache, deliberate pause, rapid skip, seek, repeat, reconnect and unlock after failure. Record audible gaps and sustained progress, not merely one `playing` event. Check the first 8 seconds after handoff. Confirm two bounded recoveries preserve position without unlock and exhaustion stops with an error. Verify auth/challenge failures do not loop and pause/skip cancels pending recovery. A suspended/killed browser cannot be made reliable by JavaScript timers; document real device behavior.

## Device synchronization acceptance

- Use two browsers/devices on one account and a third on a different account. Sync is authenticated-only; auth-off stays the existing shared/local model.
- First playback claims output. Opening another device mirrors the queue, progress, state, shuffle, repeat and radio without playing. Remote controls affect the active output. Volume/mute, appearance and audio/video preference remain device-local.
- Use Devices → Play on this device. The old client pauses, cancels retries/radio, removes all media sources, then acknowledges. Only then may the new client resume at the confirmed position. An offline old client blocks transfer; do not force output merely because a heartbeat/lease expired. Check autoplay refusal on the destination and allow an explicit user tap.
- Closing a tab performs a best-effort small keepalive release after local silence. Sign out waits for an acknowledged release. Network loss can prevent delivery; reconnect the old browser/account to confirm silence. No claim of instantaneous control of an unreachable browser is made.
- Test concurrent claims/commands, account switch/logout/disable, session refresh/expiry, stale epochs/sequences, server restart and network interruption. Restart preserves the queue paused; no device should start just because the server restarted.
- Queue window: maximum 500 tracks, retaining the current track (up to 100 preceding rows). Full playlists and backups remain in the existing library. Device registry: 8 per owner, 128 active rooms, at most 2 event streams/device; slow streams retain only one latest pending update. Commands expire after 15 seconds and are capped at 20, with 120 mutation requests/device/minute. Snapshot persistence coalesces progress to five seconds, but state/queue/ack changes are durable.
- Confirm matching history writes happen on the active player only. Inspect SQL indexes and verify private state/commands never cross owners. Forwarded client IP trust remains the existing explicit proxy configuration.

## Discord service acceptance and setup

See `services/discord-presence/README.md`. Hermes must establish app eligibility/SDK access, obtain the official Linux C++ SDK and compile against those exact headers. Do not replace this with a bot status, a user-token script or an extension and call it equivalent. Prove authorized `Client::Connect` reaches Ready and actual presence appears for **two separate linked users** without a local Discord desktop client on the service host.

Confirm phone-only playback can update the same account's Discord presence, pause/close clears it (stale device reports expire within 60–75 seconds), transfer preserves one account status, and disconnect removes/revokes credentials. Logs must contain no SDK/provider text or credentials. Test service restart, refresh expiry, unavailable service, capacity and consent denial. Leave BUG-009 runtime acceptance pending until actual Discord profiles are checked. The default music container's Dockerfile/compose is unchanged; propose the private service addition through the operator's configuration process.

## Rollback

Stop the revised service and sidecar. Restore the previous source/image **and the matching pre-migration data snapshot plus secret** as a set. Do not run an old phone-normalization implementation against newly canonical `+60` identities. Do not restore just one live SQLite file. Newer playback state cannot be inferred from the old browser-only model. Provider-side authorization may need manual revocation if rolling back before disconnect. Keep the newer backup for recovery.

## Closeout

Attach sanitized test counts/build results and device/Discord/edge evidence. BUG-002 remains awaiting the failed-import rerun. BUG-003 is closed by user acceptance; BUG-005 is provisionally accepted with wrapper contents retained. BUG-007/004/006 require real symptom acceptance; BUG-008 requires Hermes's separate deletion commit. Source tests are not vendor/device acceptance. Production promotion and any Cloudflare configuration change require Azan's approval.

Device identities are per live browser document (not copied sessionStorage). Two cloned tabs cannot share one output grant. If the old document crashes or is permanently lost before its small release reaches the origin, strict pause-confirmed transfer remains blocked: Hermes must verify the old output is stopped before any operator repair of that owner's playback_state. Do not automatically clear ownership based on time alone. A normal network reconnect of the same live document reuses its identity.
