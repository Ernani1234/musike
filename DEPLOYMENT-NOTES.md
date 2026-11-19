# Current delivery — web/PWA production revision, 19 November 2026

This header supersedes historical overlay/native instructions below. The current package is a complete source tree based on upload `79958c4d54b9173ce2d80182973c6dce80e208be`; apply the supplied clean patch against that exact baseline, or use a clean source directory. ZIP extraction over an old tree does not remove retired platform files. Preserve operator environment/compose files and runtime volumes. Only the two retired manifest COPY instructions and their comment changed in the source Dockerfile. The wrapper content remains unchanged; its executable permission is restored from the upload.

Use pnpm 10.14.0: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm --filter @musike/server bundle`. Native/desktop packages and installer CI no longer exist. Build the actual Docker image through the operator pipeline; none was built/deployed here. TEST-RESULTS.md records dependency-install and browser environment limitations separately from successful source checks.

Before auth-enabled startup back up persistent data plus the instance secret consistently. The new `social-import-admin-v1` worker migration snapshots existing nonempty data with mode 0600 and transactionally creates the documented import/social/jam tables and indexes. Restarted imports become interrupted/resumable; jams restart paused with hosting vacant. One application process remains required.

New knob: `MUSIKE_JAM_CAPACITY` defaults to 10, clamped to 2..50 accounts per room. Public playlist imports reuse `MUSIKE_IMPORT_MAX_ITEMS` with default 1,000 and cap 5,000; Google's existing separate import bounds remain. No new environment/compose file is supplied.

Normal device transfer requires pause acknowledgement. After an output becomes stale (45 seconds without inbound client activity), the user may explicitly choose Take over playback. SSE server heartbeats do not establish client liveness. A disconnected device's buffered audio cannot be guaranteed silent. Validate normal transfer, stale explicit takeover and rejected old-epoch writes on demo.

Admins may directly edit a Malaysian +60 phone number without OTP; the user explicitly approved this behavior. Edits reject collisions, keep UUID ownership, revoke sessions and invalidate affected challenges/unredeemed phone invites. Permanent deletion requires typed UUID, blocks self/last-admin deletion, clears jobs/provider/output state and transactionally purges owned data with sanitized audit evidence. Existing operator backups remain governed by their retention policy.

Preserve the working Discord ca-certificates runtime fix. Rebuild the optional adapter to remove temporary SDK file logging, then repeat actual profile/Ready/pause/second-user checks without vendor-created log files. SDK binaries/headers are operator-supplied and excluded from this source package.

Rollback the expanded release with its matching pre-migration source/image and data/secret backup. Do not mix old source with migrated social data or apply historical patches from the archive after this revision. See ARCHITECTURE.md section 7 and docs/PLATFORM-REMOVAL.md for current contracts.

---

## Historical deployment notes (earlier revisions; superseded above)

# Deployment notes — targeted bugfix source overlay

Date: 19 November 2026. Base: uploaded `Azan-Shah/musike` main commit `da3f88384651cdf8ee487054a50b0effb277cb45`. Apply to this fork; do not rebase onto upstream.

## Applying this package

1. Test on the demo instance first. Make a consistent backup of the existing persistent data and record the deployed source revision.
2. The ZIP contains complete changed/new files, with paths relative to the repository root. Extract **into the fork root**, overwriting the matching source files. It is an overlay, not a standalone repository; retain all unchanged files from the fork.
3. The user approved exactly one deployment-script replacement: `deploy/ytdlp-wrap.sh`. Preserve its executable bit and the existing mount/real-binary path. No .env, compose, Dockerfile, other deployment scripts, runtime data or generated bundles are supplied. No dependency versions changed. See BUGFIX-IMPACT.md and the complete BUGFIXES.patch.
4. Build through the existing pipeline. Source checks: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm --filter @musike/web build:native`, `pnpm --filter @musike/server bundle`, `pnpm --filter musike-desktop bundle`.
5. Configure runtime placeholders below through the operator's existing deployment mechanism. Rebuild/restart the service for environment changes; persisted admin media/OTP settings apply at runtime.

## Environment settings

Examples below are placeholders, not usable credentials. Never put an actual phone, OTP, invite code, provider key or OAuth token into source control or deployment logs.

| Name | Purpose / example placeholder | Default / behavior |
| --- | --- | --- |
| `AUTH_ENABLED` | `true` to enable the private account wall | Off unless exactly `true`. Off retains the shared JSON library and existing system-tool access; no account DB is opened by normal startup. |
| `ADMIN_PHONE` | `<ADMIN_PHONE_DIGITS>`; full international number, digits only | Unset. Required when migrating an existing shared JSON library. First successful OTP login for this number bootstraps admin once. |
| `WASPHERE_URL` | `https://<WASPHERE_HOST>` or operator's private HTTP service URL | Unset; OTP delivery unavailable until all four provider settings exist. No URL userinfo allowed. |
| `WASPHERE_API_KEY` | `<WASPHERE_API_KEY>` | Unset; server-only Bearer credential. |
| `WASPHERE_WORKSPACE_ID` | `<WORKSPACE_ID>` | Unset; escaped as a path segment. |
| `WASPHERE_SESSION` | `<SESSION_ID>` | Unset; configure the desired existing or dedicated session. No hard-coded session. |
| `MUSIKE_SECRET` | `<STABLE_RANDOM_SECRET_AT_LEAST_32_CHARACTERS>` | Unset generates `instance-secret` in the existing data directory, mode 0600. Persist/back up this file with the DB. If provided, must be at least 32 characters. |
| `MUSIKE_PUBLIC_ORIGIN` | `https://<MUSIKE_HOST>` with no trailing slash/path | Unset uses request protocol/host for same-origin checks; Google redirect fallback requires this setting. Configure explicitly behind the tunnel. HTTPS required. |
| `MUSIKE_TRUST_PROXY` | `<TRUSTED_PROXY_IP_OR_CIDR>[,<NEXT_TRUSTED_PROXY>]` | Empty: trust no forwarded addresses. Explicit IPv4/IPv6 addresses/CIDRs only; no wildcard/hop-count mode. |
| `MUSIKE_LOOKAHEAD` | `3` upcoming audio tracks | 3; integer clamped 0..10. Zero disables upcoming-byte caching and proactive radio filling. Current cold streaming remains available. |
| `MUSIKE_AUDIO_QUALITY` | `standard` or `high` | `standard`; high prefers the highest-bitrate AAC format in primary resolution. Direct fallback availability depends on provider/client. |
| `MUSIKE_VIDEO_QUALITY` | `sd` or `hd` | `sd`; initial device default only, does not overwrite an existing device preference. |
| `GOOGLE_CLIENT_ID` | `<GOOGLE_OAUTH_WEB_CLIENT_ID>` | Unset; Google import UI hidden. Auth must also be enabled. |
| `GOOGLE_CLIENT_SECRET` | `<GOOGLE_OAUTH_WEB_CLIENT_SECRET>` | Unset; Google import unavailable. Server only. |
| `GOOGLE_REDIRECT_URI` | `https://<MUSIKE_HOST>/api/google/callback` | Optional: `${MUSIKE_PUBLIC_ORIGIN}/api/google/callback`. Must be HTTPS and exactly match the OAuth client registration. |
| `MUSIKE_IMPORT_MAX_ITEMS` | `10000` | 10,000, clamped 1..100,000; shared processed-item cap per run. Source collection/item/continuation caps can also produce a partial report. |

Reused settings: `MUSIKE_DATA_DIR`, `MUSIKE_CACHE_DIR`, `MUSIKE_CACHE_MAX_MB` (2048), `YTDLP_PATH`, `YTDLP_EXTRA_ARGS`, `LOG_LEVEL`, `MUSIKE_WEB_DIST`, `PORT`, `HOST`, `MUSIKE_BIN_DIR`, `MUSIKE_LANG`, `MUSIKE_LOCATION`. The replacement wrapper honors an explicitly set legacy YTDLP_DELAY, with no implicit success-delay default. The TypeScript app still does not interpret it. Existing environment/compose settings are not rewritten; compare legacy and zero-delay modes on demo before changing a known mitigation.

Audio quality defaults affect future uncached resolution; existing cached audio is retained until eviction. Persisted admin media settings override the environment's initial media defaults on subsequent auth-enabled boots. Turning auth off bypasses those DB settings and uses the environment again. OTP enabled/expiry/cooldown defaults are true/300 seconds/60 seconds; editable bounds are 60..900 seconds expiry and 30..300 seconds cooldown. API/CLI settings are instance-wide; theme/language/layout and saved playback quality remain per device.

## SQLite recommendation and migration

Use SQLite WAL in the existing container, on a local same-host filesystem. Node **22.13 or newer** is required for `node:sqlite` without its older opt-in flag. No extra native npm dependency or database container is needed. See `DATABASE-DECISION.md` for SQLite/PostgreSQL tradeoffs. Use one application process per data directory: library snapshots are cached in that process. Do not scale replicas over the same DB or mount WAL on NFS/SMB.

On first auth-enabled startup:

1. Open/create `musike.sqlite` in the existing data directory; SQL runs exclusively in a worker thread with WAL, foreign keys, FULL synchronous mode and a five-second busy timeout.
2. Validate the existing `library.json`. If it exists and `ADMIN_PHONE` is absent, fail startup rather than assign ownership arbitrarily.
3. Copy the original to `library.json.before-auth.bak` with exclusive creation. An existing, different backup stops migration for manual review. Malformed data also stops startup. The original JSON is not edited.
4. In one transaction create/find the configured owner, insert their library if absent, record the migration marker and audit event. The owner initially has user role; the configured phone's first successful OTP login grants the bootstrap admin role once. Other users begin with empty libraries after a valid invite.
5. Subsequent boots skip the import using `shared-library-v1`. Changing `ADMIN_PHONE` later does not transfer an existing library or repeat bootstrap.

For rollback to auth-off, the old JSON still contains the pre-migration shared library. Post-migration user edits live in SQLite, so export each needed user library before rollback; toggling auth off does not merge them back. Preserve the DB and secret for later re-enablement.

Back up the whole data directory **while the app is stopped**, including `musike.sqlite` and any WAL/SHM files plus the secret and migration backup. For an online backup use SQLite's backup API/a consistent snapshot, not a lone live `.sqlite` copy. Losing/changing the secret invalidates session/OTP hashes and makes stored Google tokens unreadable. Restrict data-volume access and backup access; ordinary library JSON and phone fields are not encrypted by this application.

## WhatsApp setup and login

Provision a wasphere key with access to the selected workspace/session. Configure the four placeholders and ensure the session is connected to WhatsApp. Musike sends exactly:

```text
POST {WASPHERE_URL}/workspaces/{WASPHERE_WORKSPACE_ID}/proxy/api/sessions/{WASPHERE_SESSION}/messages/text
Authorization: Bearer <WASPHERE_API_KEY>
Content-Type: application/json
{"to":"<PHONE_DIGITS>","text":"<OTP_MESSAGE>"}
```

All 2xx responses succeed. No automatic retry occurs for HTTP 408/5xx or a timeout; the UI reports uncertain delivery and retains cooldown. A 4xx rejection is not verifiable. Uninvited numbers receive a decoy challenge and no message. Codes are cryptographically random six digits, HMAC-hashed, single use, default five-minute expiry and five verification attempts. Requests permit at most five per phone and ten per resolved IP per 15 minutes, serialized against concurrent requests. Old OTP rows are purged after one day on the next OTP request.

The public origin must use HTTPS. Cookies are `__Host-` prefixed, HttpOnly, Secure, SameSite=Lax. Access lasts 15 minutes; the refresh-backed session expires after 12 hours or 30 days with Remember me. Logout deletes the server session; disabling a user revokes their sessions. The client stops media after its first observed 401 (presence runs every 15 seconds).

An admin issues an optional phone-bound invitation, valid seven days and single use. The invite is the admin's approval for first login; there is no open registration/phone allowlist. The admin can change an existing user's approved/pending/disabled status. An unbound invite can be redeemed by one phone. The raw code is returned once and stored only as a hash. The UI does not send invitations itself.

### Container promotion CLI

Use the existing container execution mechanism; no system-path or compose change is needed. The current image's working directory contains the bundled server:

```text
node server.mjs promote '<PHONE_DIGITS>'
node server.mjs promote '<PHONE_DIGITS>' --revoke
```

For a source checkout: `pnpm --filter @musike/server promote -- '<PHONE_DIGITS>' [--revoke]` (pnpm forwards the literal `--`; the CLI filters it). The command creates a user/library if granting a missing account and refuses removal of the last approved admin. It records an audit action with local attribution. Configure `ADMIN_PHONE` before initial migration; if omitted, the CLI explicitly uses the supplied target phone for bootstrap ownership. Run against the same data directory and secret as the service. The role becomes visible on subsequent authenticated requests/presence updates.

## Proxy and real-IP setup

Observe the **immediate socket peer** at the application, then trust only that actual reverse-proxy address/range and any additional proxy hops needed to interpret your XFF chain. Do not copy a guessed Docker subnet. The trusted ingress must replace client-supplied forwarding headers, preserve the public scheme/host, and set a verified client address. Never expose a trusted proxy source to arbitrary users.

Fastify walks the trusted XFF chain to the first untrusted hop. A valid `CF-Connecting-IP` is preferred only if the immediate socket peer is trusted. With no trust configuration, or an untrusted immediate peer, forwarded IPs cannot override the socket. OTP/IP buckets, presence, audit and error attribution all use the same resolved IP. Multi-hop chains require an accurate trusted-hop list; blindly selecting an unverified leftmost XFF value would enable spoofing.

The dashboard is heartbeat-based presence: each logged-in tab pings immediately and every 15 seconds; rows active within 45 seconds are live, stale rows are removed after 60 seconds; admin ops refresh every five seconds. It shows distinct live users and individual clients, their resolved IP and last activity, not an exact count of TCP connections. Audit history retains the latest 1,000 events; the dashboard returns the latest 50 audit events and latest 50 retained errors. Request logging strips queries/headers, including OAuth codes and cookies. Admin API actions also emit structured info-level audit log lines independently of the default warn threshold.

## Google OAuth setup and provider limits

1. Create a Google Cloud project and enable YouTube Data API v3.
2. Configure the OAuth consent screen for the intended audience. During external testing explicitly add the family's test accounts. Meet Google's verification/publishing requirements before widening access.
3. Create a **Web application** OAuth client. Register the exact HTTPS callback URI above. Put the ID/secret into operator runtime configuration; never in the web bundle.
4. Configure `MUSIKE_PUBLIC_ORIGIN` or an explicit `GOOGLE_REDIRECT_URI`; restart. Auth must be enabled. Leave Google credentials unset to hide import.
5. Log into the desired Musike account, connect Google, consent, then click Import now. The callback also requires the originating Musike account's session. State is single-use/ten-minute, with PKCE S256. The sole scope is `youtube.readonly`; no email/profile scope is requested. Tokens/verifier are AES-256-GCM encrypted with owner-bound associated data.
6. Inspect the report. Re-run to top up; imported origins preserve source identity and mappings, ordered unique track IDs and album-as-playlist provenance. The library view refreshes on completion. Daily sync is individually opt-in, off by default, first due 24 hours after enabling; a one-minute server scheduler claims due users. Disabling it cancels pending/active automatic work. Disconnect deletes local credentials and attempts Google revocation once.
7. Check all four categories on the demo. Public YouTube Data API exposes playlists/liked videos but **does not expose watch history**. A separate import-only youtubei.js Music session attempts saved albums/library playlists/likes/history; this is provider-dependent/private API behavior and may be refused for a web OAuth client. Public playlists/likes are fallback sources. Albums/history have no implemented public API fallback. Missing categories are explicitly reported as unavailable/partial, not counted as successful empty imports. Do not treat the fixture tests as proof that Google currently grants these private surfaces. This package does not implement Google Data Portability or an alternative export uploader.

Matching now validates the original video first, then tries title+artist yt-dlp, existing Music search and title-only search within a 30-second item deadline. Unicode scoring preserves Japanese voicing, artist evidence and version distinctions; duration is checked when available. A replacement needs score >=0.9 and a >=0.06 lead over the runner-up. Uncertain/provider-failed items become needs-review suggestions, not automatic imports. A new collection preserves accepted source order; top-ups append missing items while retaining existing Musike edits.

History is limited to Musike's existing latest-60 unique-track model and does not preserve source playback timestamps. Saved albums become ordinary editable playlists with an album origin marker. There is no followed-artist model, so channel subscriptions are deliberately skipped. Reimports append missing items, preserve existing Musike edits, and do not delete unfavorited tracks or mirror source deletions/reordering. Duplicate occurrences of one video in a playlist collapse because Musike's existing playlist mutations deduplicate IDs. Not-found means no useful candidate was found; ambiguous or failed-provider cases stay reviewable. This ZIP still has no Takeout upload/parser; exact reproduction of the reported failed export requires that input/adapter.

Imports have two active jobs globally, one per user, up to 20 queued jobs, 20-second provider request deadlines, a configured processed-item cap, 1,000 collections per private filter and up to 200 continuation pages. Cap hits are reported partial. Reports retain up to 20 runs per user. Live progress is in owner-scoped memory; the existing status endpoint supports after/runId deltas of at most 100 items. Full report checkpoints occur every 20 completed report items and on terminal state. A restart marks interrupted runs as error while retaining completed checkpoints; a rerun recovers any last uncheckpointed report items from durable library/mapping state. Reports are not repeatedly rewritten for every resolved track. The import Google session/tokens are never attached to public discovery, yt-dlp, direct fallback, or playback.

## Native, TV and cache checks

`MUSIKE_SERVER_URL=https://<MUSIKE_HOST>` is the existing Capacitor build/sync setting for a hosted shell. The shell loads the hosted web app and its same-origin cookie login. On hosted iOS, audio uses the WebView media element so HttpOnly session cookies accompany protected streams; standalone direct YouTube playback keeps the native bridge. Standalone native builds keep local JSON, bypass account UI and do not run SQLite/OAuth. Android/iOS installation, background playback and D-pad login need physical-device testing. Google may reject embedded-user-agent OAuth; connect the same Musike account in a regular browser, then use its server-side connection from the shell. No embedded OAuth policy bypass is implemented.

Upcoming audio bodies, metadata and HD media/working files share cache accounting. Warm audio serves through the local Range path without resolver/wrapper work. Active response leases and nearer queue positions protect files from eviction; server clips lookahead to its configured depth, revisions reject stale windows, and replacement windows abort stale byte jobs. Budget blockage stops the remaining window and unchanged blocked windows do not re-download. Resolution subprocesses can now be cancelled when their last consumer leaves; another consumer keeps the shared process alive. Shared SDK waits discard cancelled completions, while underlying shared transport may finish separately. HD/FFmpeg writes retain existing asynchronous pruning and may transiently exceed a budget during merging; this setting is not a hard filesystem quota. Lowering the limit can also leave leased/current media above it until released. Lookahead reservations cannot force an eviction of current or nearer-needed media.

Cold fallback uses cached/default direct-client configuration immediately while one advisory refresh runs; on failure it can retry a changed refreshed list once. Cold audio now races usable first bytes from primary/direct paths and does not wait for a complete cache download. Acquisition is bounded to eight active/24 queued selections, five-second queue wait and a nominal 20-second total first-byte budget including admission; a selected stream has a 30-second body-read inactivity deadline, not a 20-second song-duration limit. Probe requests (probe=1 on the media URL) read a bounded recent failure and do not resolve media again. Ready next audio may buffer in a spare supported browser element before lock; native bridges/iOS keep their single-player path. Actual Android background survival, primary/fallback latency, cold 403s and any explicit legacy delay still require demo measurement. See `ACCEPTANCE-CHECKLIST.md` and `TEST-RESULTS.md`.


## 19 November additions — runtime knobs

All examples are placeholders. No operator configuration files are included/modified by this source package.

| Variable | Purpose / placeholder example | Default / bounds |
| --- | --- | --- |
| MUSIKE_PLAYBACK_DIAGNOSTICS | `true` on demo for correlated server/client timing | Off unless exactly true. Detailed stage logs and client batches require it; basic server failures still have trace context. Restart to change; settings endpoint tells the client the mode. |
| YTDLP_REAL_PATH | `<EXISTING_REAL_YTDLP_EXECUTABLE>` | Existing wrapper binary path `/opt/musike/bin/yt-dlp`; override only if the operator's current real tool lives elsewhere. Must not point back at the wrapper. |
| YTDLP_WRAP_MAX_ATTEMPTS | `2` | 2; allowed 1, 2 or 3, invalid ->2; metadata extraction only. |
| YTDLP_WRAP_RETRY_DELAY | `1` seconds | 1; integer 0..5, invalid ->1; applied between classified transient failures only. |
| YTDLP_WRAP_SUCCESS_DELAY | `0` on demo after comparing the legacy mitigation | Unset uses explicitly set YTDLP_DELAY, otherwise 0. Integer 0..10; invalid ->0. This knob overrides an explicit legacy delay. |
| YTDLP_DELAY | Existing compatibility setting, e.g. `<LEGACY_DELAY_SECONDS>` | No longer implicitly 4 when unset. An explicitly configured value remains honored on successful metadata extraction unless the new override is set. No delay is added on fatal failures or pass-through commands. |

The wrapper retries metadata flags -J/-j/--dump-json/--dump-single-json only. Transient 403/408/500/502/503/504 or classified network failures may retry; bot/login/private/removed/age/rate-limit/argument/permission failures fail fast. Unknown errors fail fast. Download/version/update commands exec the real tool without extra retries/delay. Retry logs contain classification/attempt only; final stdout is not mixed with failed partial JSON. Temporary output is private and cleaned; signals are forwarded/reaped. No system binary or bind mount was changed here.

## Playback diagnostics and incident capture

Enable MUSIKE_PLAYBACK_DIAGNOSTICS=true on demo before reproduction. Structured server events carry traceId, requestId, stage, resolved IP and available numeric status/timing/byte counts. Normal JSON calls carry x-musike-trace; media URLs carry a non-secret UUID trace query. Responses include x-musike-request-id and x-musike-trace. Detailed events identify admission, resolver/provider opening, first bytes, cache hit, completion/disconnect, radio and client visibility/error/recovery. Available Cloudflare Ray IDs are retained as identifiers. Raw URLs, headers, cookies, OTPs, tokens and provider error text are excluded from the new timing records.

The browser retains at most 200 diagnostic events in memory, with console debug output only when enabled. Batches use POST /api/playback/events (normal login/CSRF checks, 16 KiB, 40 events, 240/minute per user or resolved IP, max128 active buckets). Failed delivery keeps the bounded ring for retry/export after connectivity returns. The existing playback error toast offers Download playback diagnostics; login/challenge errors offer Sign in again. Client events/timestamps are self-reported diagnostics, not trusted security audit evidence. No new SQL tables or migrations are required.

A recent media error cache is limited to 200 entries/60 seconds, keyed by owner, trace and video ID. probe=1 on the existing media route returns only that owner's matching error JSON or {ok:true}, without a fresh resolver call. It remains no-store and subject to the normal auth wall. A successful/unknown probe does not prove that a media decoder can play the file.

JSON/probe requests use manual redirects, allowing an opaque redirect to be recognized as a sign-in/gateway-session problem. HTML without redirect evidence is treated as an unexpected response; 5xx is a server/gateway failure. Truly opaque network/CORS failures may still need browser Network and Access/WAF logs to distinguish their cause. No public caching, CORS relaxation, WAF exemption or undocumented tunnel keep-alive header is installed. The existing service worker still caches artwork only; Background Sync is not used as a music scheduler.

Run the direct-origin/public-path and screen-off checks in DEMO-VERIFICATION.md. BUG-004 and BUG-006 remain incident/device-verification pending. Do not report that Cloudflare or Android caused the issue without the matching records.

## Approved BUG-007–012 + device-sync revision

See docs/HERMES-VERIFICATION.md for installation, real-device acceptance and rollback. This deliverable is a **complete source ZIP plus patch**, not the earlier overlay. New worker migrations add playback/Discord tables and canonical +60 identities; inspect the current ARCHITECTURE.md section 6. Back up data plus secret consistently before demo startup. Invalid/colliding old identities stop startup for manual resolution; outstanding OTPs are invalidated. Backups use worker VACUUM INTO and mode 0600. Restore source/image **and matching pre-migration data** for rollback; old digit-only identity code is incompatible with new +60 rows.

Device sync is enabled for authenticated accounts only. Event streams use existing same-origin cookies and no-store; preserve proxy streaming. Transfer requires the old client to acknowledge silence and does not forcibly expire ownership. New Discord service source is optional and unverified against vendor binaries; all setup/secrets/runtime bounds and live checks are in services/discord-presence/README.md. Existing music compose/environment files and Dockerfile are unchanged. Hermes proposes the service deployment through the operator workflow. The wrapper's content is unchanged; preserve its corrected executable bit.

Platform removal remains the separate Hermes runbook; until executed, native/Electron checks are still applicable. Cloudflare audits must follow the explicit proposal/approval boundary in docs/CF-TUNNEL-AUDIT-PROMPT.md. Do not equate source tests with deployment acceptance.
