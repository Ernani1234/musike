# Exact documentation snippets — expanded revision

The complete updated markdown files are also supplied in the source ZIP. Original Hermes reports remain append-only; only the current index and the dated disposition are updated.

## HERMES_FOUND_BUGS.md — current index

| ID      | Title                                                              | Status                | Found      |
|---------|--------------------------------------------------------------------|-----------------------|------------|
| BUG-001 | yt-dlp stream URLs expire ~3-4s after issuance — proxied streams 403 (upstream #28) | MITIGATED (wrapper) | 2026-11-17 |
| BUG-002 | Takeout import: 387 not-found (no fuzzy matching) + no live per-item progress | RESOLVED in source; demo rerun pending | 2026-11-18 |
| BUG-003 | Look-ahead prep not guaranteed on every playback path; cold path stalls | CLOSED — source fix accepted by user; regressions retained | 2026-11-18 |
| BUG-004 | Radio sometimes stalls advancing to next song or errors server unreachable | MITIGATED + INSTRUMENTED; incident verification pending | 2026-11-18 |
| BUG-005 | yt-dlp wrapper needs whole-file fix beyond BUG-001 mitigation | RESOLVED — provisionally accepted by user; wrapper content retained | 2026-11-18 |
| BUG-006 | Cloudflare Tunnel Optimization Findings for Codex Evaluation | Browser mitigation implemented; edge/device cause unverified | 2026-11-19 |
| BUG-007 | Locked-screen next-track fetch failure on Samsung A07 | MITIGATION UPDATED — complete-byte preload + unlock recovery; device verification pending | 2026-11-19 |
| BUG-008 | Retire desktop/mobile applications and native build wiring | RESOLVED in source — web/PWA only; Docker runtime acceptance pending | 2026-11-19 |
| BUG-009 | Authenticated Discord Rich Presence | LIVE previously confirmed by user; revised stdout logging needs deployment regression | 2026-11-19 |
| BUG-010 | Logging overhaul: stdout/docker-logs only, no in-app log files; Hermes self-diagnosis | RESOLVED in source — stdout diagnostics; audit/progress retained | 2026-11-19 |
| BUG-011 | Phone number normalization (E.164, +60 default, idempotent backfill) | RESOLVED in source — canonical +60 and backed-up migration | 2026-11-19 |
| BUG-012 | Codex deliverable: Cloudflare + tunnel optimization audit prompt for Hermes | DELIVERED — audit prompt with approval/rollback gates | 2026-11-19 |
| BUG-013 | Dead output and device-sync transfer deadlocks | RESOLVED in source — inbound liveness, bounded transfers and explicit stale takeover | 2026-11-19 |
| BUG-014 | Discord runtime missing system CA trust | RESOLVED — working Hermes CA fix retained; temporary SDK file logs removed | 2026-11-19 |
| BUG-015 | Public YouTube playlist-link import | RESOLVED in source — progress, checkpoints and dedup; real playlist acceptance pending | 2026-11-19 |
| BUG-016 | Friends, groups, shared playlists, jams and opt-in presence | IMPLEMENTED in source — authorization/coordination fixtures pass; real device acceptance pending | 2026-11-19 |
| BUG-017 | Admin live playback, hard deletion and direct phone edit without OTP | RESOLVED in source — direct edit explicitly approved by user; demo acceptance pending | 2026-11-19 |

## HERMES_FOUND_BUGS.md — append this dated disposition

## 19 November 2026 — approved expanded source revision (Codex)

Base: user-uploaded `79958c4d54b9173ce2d80182973c6dce80e208be`. The user answered the scope/behavior questions and explicitly approved building, including Codex execution of BUG-008. Historical reports above remain unchanged. Current dispositions are in the index.

### BUG-007 — fresh trace and updated mitigation

The supplied second Samsung diagnostic export records first-track playback, but no next-track preloaded handoff or playing event. On 19 November at approximately 18:01:06–18:01:09 MYT the next track failed with zero buffered bytes and media code 4 while hidden; both bounded retries ran and their probes failed at the network layer. Returning visible at 18:01:22 did not recover after the two-retry budget was exhausted. Media code 4 alone does not prove a codec defect in this trace.

The player now downloads one complete upcoming audio body (16 MiB per-body cap, 25-second deadline) while the foreground connection is available and can hand that Blob to the current browser audio element. The existing spare-element fallback remains supported where appropriate. Queue/output/session changes abort/release stale work. After exhausted hidden retries, one fresh foreground recovery is permitted unless playback was deliberately paused. Diagnostics record complete/incomplete preparation and insufficient-buffer handoffs. Synthetic player and bounded-byte tests pass; Samsung A07 playlist/radio × Wi-Fi/data acceptance remains mandatory. Network partition/OS termination is not eliminated.

Origin/tunnel/Access/WAF correlation remains pending for 17:58:30–18:01:30 MYT, particularly traces `edc97641-0600-4db6-abb7-5d90428a727f`, `dae5b687-5cfa-4729-a302-e0dab285c531`, `4bdeeb10-7440-4cfd-8d6c-edc6094d4bf8`, last successful queue request `req-1zf` and Ray `a5ce5f04bf81f518-SIN`. The user already supplied the diagnostic export; do not ask for the same file again.

### BUG-008 — source retirement executed

Removed the desktop/mobile/native directories, native-only types/build substitutions, Electron/Capacitor dependencies, installer scripts/workflow and Docker manifest references. Retained web/PWA icons, service worker, phone/TV browser layouts, optional SDK infrastructure and the intentional upstream remote streaming-configuration URL. pnpm 10.14.0 regenerated the lockfile from the retained versions: 810 → 436 package entries, no added package versions or direct dependency upgrades. This reduces repository/dependency/build scope; it is not evidence of a measured production playback or memory improvement. The source retirement is resolved; Docker image build and real PWA acceptance remain pending. See docs/PLATFORM-REMOVAL.md.

### BUG-009/010/014 — reviewed working Discord fix

The working Hermes system CA installation remains unchanged. The earlier deployed presence result was confirmed by the user. Removed temporary SetLogDir/verbose vendor file logging and retained bounded numeric SDK status/error/code fields through the service stdout allowlist. SDK stderr/provider text stays suppressed. The revised adapter still requires operator SDK compilation and a deployment regression check for real presence and absence of vendor-created files.

### BUG-013 — bounded recovery with explicit stale takeover

Preserved deadlock recovery goals while applying the user's selected policy: normal transfers require pause acknowledgement; after 45 seconds without inbound client activity, an explicit Take over playback action may replace the stale owner. A server SSE heartbeat or open listener no longer keeps a suspended client online. Transfers expire after 30 seconds, old epoch writes remain fenced, and offline device pruning is bounded. Fixtures cover stale outputs, half-open SSE, transfer retry, controls and output exclusivity. Unreachable buffered audio cannot be guaranteed silent remotely.

### BUG-015 — implemented public playlist import

Library now accepts supported HTTPS YouTube playlist/watch links and an optional owned destination. Public metadata uses the existing yt-dlp wrapper/process queue; per-item playable resolution uses public credentials only. Reports show live item status, bounded pages, skipped unavailable items and retryable failures. Checkpoints survive restart/cancellation; rerun deduplicates and appends missing tracks, retaining Musike edits. Initial successful imports retain source order; later retries append recovered items. Fixture coverage includes partial failures, ownership, progress and duplicate-free rerun. Real 50-video acceptance is pending. The older report's Takeout-only description was inaccurate: this repository has Google OAuth import but no Takeout parser.

### BUG-016 — implemented social and cross-account jams

Added friend codes/links, accepted requests, persistent owner-controlled groups, live viewer/editor playlist grants, optimistic edit revisions, explicit personal copies and independently opt-in online/track presence. Phones are not exposed through friend discovery. Grant/group revocation removes access to the original; explicit copies remain owned by recipients.

Jam rooms use signed-in membership and hashed expiring/revocable invitations, bounded capacity/queues, versioned commands and the existing per-account output coordinator. Guests may add tracks; transport is host-only unless enabled. Host disappearance pauses and clears hosting for an explicit claim. Two real browser coordinator modules (synthetic media/transport) exercise cross-account queue updates, guest restrictions, drift correction and host loss while preserving one output/account. These fixtures are not proof of physical-device timing, autoplay or background acceptance.

### BUG-017 — admin controls; user explicitly overrides OTP requirement

Added paged admin live playback and permanent deletion with typed target UUID, self/last-admin guards, lifecycle cleanup and an audited transactional owned-data purge. Owned jams close rather than transfer ownership; sharing metadata cascades. Provider revocation is best effort, and operator backups follow existing retention.

The user explicitly changed the phone-edit requirement: **an authenticated administrator may edit immediately without OTP confirmation**. Implemented Malaysian +60 normalization, collision rejection, affected challenge/unredeemed phone-invite invalidation, session/client revocation and output cleanup. User UUID and library ownership remain. The configured bootstrap phone cannot silently register a replacement account after bootstrap has completed. Original OTP-request wording above is historical and superseded by this decision.

### Remaining acceptance and earlier items

BUG-002's real failed input rerun remains pending; BUG-003 stays closed and BUG-005 remains provisionally accepted with wrapper content retained and executable permission restored. BUG-001/004/006 retain their existing mitigation/incident status. Exact automated results and environment limitations are in TEST-RESULTS.md. No production deployment, tunnel/WAF change, actual account deletion or operator configuration mutation occurred.

## ARCHITECTURE.md — added current section

## 7. Current expanded production revision — 19 November 2026

Base upload: `79958c4d54b9173ce2d80182973c6dce80e208be`. The user approved Codex execution of BUG-008 together with playback fixes, BUG-013/014 review, public playlist imports, social/jam features and admin operations. This section supersedes earlier platform, transfer, phone-edit and SDK logging descriptions. No deployment was performed.

### Current platform and module boundaries

Only `server` and `web` are workspace packages. Electron, Capacitor, native bridges, native TypeScript/Vite modes and native installer CI are removed. Docker copies only the two remaining manifests. The existing Docker publishing workflow, responsive/TV browser UI, PWA icons/service worker, auth-off JSON storage and upstream `mobile/streaming.json` configuration URL remain. That external URL is intentional and unrelated to the deleted local directory. No new dependency versions, CSS variables, inline style system or application innerHTML rendering were introduced.

| Exact modules | Wiring / responsibility |
| --- | --- |
| `server/src/playlistImport.ts`, `playlistImportRoutes.ts`, `ytdlp.ts` | `createApp` creates/recover/closes the importer; validated public YouTube list IDs go through the existing bounded yt-dlp process queue; playable item validation uses public resolution without Google credentials |
| `server/src/social.ts`, `socialRoutes.ts`, `library.ts` | Accepted friend relationships, group membership, grants, presence preferences and explicit copy/edit operations; `editPlaylist` checks an optimistic updatedAt revision |
| `server/src/jams.ts`, `jamRoutes.ts`, `playbackSync.ts` | Cross-account canonical room queue/timeline above the private account/device layer; only the account's granted output receives a jam command; explicit output selection never silently transfers devices |
| `server/src/accounts.ts`, `adminRoutes.ts`, `googleImport.ts`, `app.ts` | Phone update/delete orchestration, job cancellation, output cleanup and best-effort provider disconnection; final owned-data purge and audit insert are one worker transaction |
| `web/src/lib/playbackPreload.ts`, `player/player.ts` | One pending complete audio body (16 MiB cap, 25-second deadline), Blob handoff into the current browser audio element, cancellation on queue/owner/session change, one additional foreground recovery after exhausted hidden retries |
| `web/src/lib/playbackSync.ts`, `jams.ts` | Same-account SSE coordination and client pings; jam actions serialize through the server; foreground jam polling corrects drift without reloading matching audio |
| `web/src/views/Social.tsx`, `SharedPlaylist.tsx`, `components/JamPanel.tsx`, `PlaylistImportDialog.tsx` | `/social`, `/shared/:id`, existing Modal/PageHeader/TrackList patterns; Library exposes imports and incoming shares; Rail/TabBar expose Social only for authenticated accounts |
| `web/src/components/AdminPanel.tsx` | Existing admin panel adds paged users/clients, live playback, direct phone editing and typed permanent-deletion confirmation |
| `services/discord-presence/worker.cpp`, `service.mjs` | No SetLogDir/vendor file logs; only allowlisted integer status/error/code plus existing booleans go to structured stdout. Keep runtime ca-certificates from the working Hermes fix |

New frontend labels live in typed `collaboration` and `features` catalogs. Portuguese explicitly falls back to English for collaboration. No new DOM IDs are required. Jam/friend invitation codes are read from `/social?jam=…` and `/social?friend=…`; they grant no unauthenticated API access and are not logged by application request serialization.

### Behavior, bounds and ownership

- Device freshness requires an inbound client read/ping/snapshot within 45 seconds. Server SSE writes and open listeners do not refresh it. Transfers expire after 30 seconds; inactive devices are pruned after 180 seconds when disconnected. A stale active owner remains fenced until an explicit claim with `takeover:true`. Old epoch writes are rejected. An unreachable device's buffered audio cannot be remotely guaranteed silent.
- The browser keeps complete next-track bytes outside advisory media preload. It never stores protected media in the service worker. A consumed Blob may remain active while the next body downloads; each body is capped at 16 MiB. Session loss/output suspension clears retained URLs and requests. iOS keeps its existing single-element browser path. Physical background acceptance remains pending.
- Playlist imports: two active workers, twenty waiting, one active run per owner, at most twenty retained runs per owner, at most 5,000 items per run, 100 report rows per page. `MUSIKE_IMPORT_MAX_ITEMS` defaults to 1,000 for this importer and clamps to 1..5,000 (Google import retains its own existing bounds). Metadata extraction has a 60-second deadline and existing 16-MiB process-output cap; each playable-item resolution has a 30-second cancellation deadline. Import failures retain item checkpoints. Re-import deduplicates and appends missing IDs while preserving Musike edits. Failed items append when retried; the importer does not mirror source deletions/reordering. Original successful new imports retain source order. Unavailable/private items are skipped, transient failures remain retryable. The repository has no Takeout upload/parser; historical BUG-015 Takeout wording is inaccurate.
- Friends: codes, accepted requests, at most 200 friends and 100 outstanding requests per account. No phone-number search. Presence online/current-track preferences default off and are independent; current-track presence requires live playing output. Admin visibility is independent.
- Groups: owner-controlled, at most 50 memberships per account and 200 members per group; only accepted friends may be added. Leaving/removal revokes group-derived access. Shared playlists: at most 200 owner shares, viewer default, editor opt-in, current grants/membership checked on every read/edit. Authorized access resolves the stored owner before reading that owner's library; private library APIs still never accept arbitrary owner IDs. Explicit copied playlists belong to the recipient and survive revocation. Editor saves reject stale revisions.
- Jams: at most 128 rooms, one membership per account, 500 tracks per queue. Capacity defaults to 10 accounts and is configurable with `MUSIKE_JAM_CAPACITY` clamped to 2..50. Invitations are hashed at rest, expire in 30 minutes and rotate/revoke explicitly. Join requires an existing approved account. Owner/host may lock entry, remove guests or revoke invitations. Everyone may add tracks; host controls transport unless guest controls are enabled. Room commands require the current version. State polling runs once per second for the foreground output, every five seconds for foreground mirrors, and every ten seconds while hidden or outside a jam, with one in flight. A 45-second missing host/output pauses the room and clears hosting; claiming is explicit. Restart pauses rooms and clears hosts. Alignment targets approximately one second in foreground with stable connectivity; background timers/autoplay/network limits are not eliminated.
- New jam routes are limited to 240 requests per minute per user with bounded active buckets. Shared playlist lists, friends, requests, groups, report rows, members and admin results are bounded. SQLite stays inside the existing dedicated worker with parameterized RPC.
- Admin phone updates require no OTP by explicit user decision. Normalize to Malaysian +60, reject collisions, invalidate pending OTPs and unredeemed phone-bound invites for old/new numbers, revoke sessions/clients and clear output coordination. UUID, libraries and ownership remain. A configured bootstrap number is not a permanent registration bypass after bootstrap completes.
- Hard delete requires typed target UUID, refuses self/last-admin deletion, cancels work, pauses/closes owned jams, clears runtime output/provider state, then transactionally deletes target identity, phone challenges/invites and cascading owned data with an audit record. Provider revocation is best effort outside SQLite; existing operator backups retain their normal policy. Audit evidence contains IDs/actions/IP, not phone/token/provider text.

### Added/extended API contracts

All new social/import/jam APIs require authenticated accounts and use existing same-origin cookies and write-origin/CSRF checks. They return 401 when accounts are unavailable. Responses remain no-store. Limits/errors use normal `{error}` responses.

| Method / path | Input / result |
| --- | --- |
| POST /api/playlist-imports | `{url,destination?}` → `{id}`; owner destination only; list/watch HTTPS YouTube URL accepted |
| GET /api/playlist-imports | Latest owned report or null |
| GET /api/playlist-imports/:id | `offset=0..5000` → owned summary and at most 100 item rows |
| POST /api/playlist-imports/:id/resume or /cancel | Retry failed/pending checkpoints or cancel owned work |
| GET /api/social | Incoming-share offset page (200), hasMore; own code/preferences, accepted friends and opt-in presence, requests, groups, owned/incoming shares |
| POST /api/social/friends | `{code}` → request |
| POST /api/social/requests/:id | Sender ID, `{accept:boolean}`; recipient only |
| DELETE /api/social/friends/:id | Remove friendship/request and direct/group-derived access between the two accounts |
| PATCH /api/social/preferences | `{online:boolean,track:boolean}` |
| POST /api/social/groups | `{name}` → `{id}` |
| GET /api/social/groups/:id | Member-visible group and bounded names/IDs |
| PATCH /api/social/groups/:id | Owner: `{name?}`, `{member,remove?}` or `{delete:true}`; member may remove self |
| POST /api/social/shares | `{playlist,user or group,permission?:viewer/editor,revoke?}` → share ID |
| GET /api/shared-playlists/:id | Authorized live playlist, owner name/ID and permission |
| PATCH /api/shared-playlists/:id | Editor/owner `{revision,name,tracks}`; 409 on concurrent edit |
| POST /api/shared-playlists/:id/copy | Authorized explicit personal copy |
| DELETE /api/shared-playlists/:id | Owner revokes all grants by deleting share |
| GET /api/jams | Own current room or null, also supplies inbound heartbeat |
| POST /api/jams | Create room; leave existing membership first |
| POST /api/jams/join | `{code}`; approved user, valid invitation, unlocked/capacity checks |
| GET /api/jams/:id | Member-only state/version/serverNow, host reconciliation and heartbeat |
| POST /api/jams/:id/invite | Owner/host creates/rotates `{code,expiresAt}` |
| POST /api/jams/:id/output | Member reapplies canonical state to their account's granted output |
| POST /api/jams/:id/leave or /claim | Leave gracefully or explicitly claim vacant hosting |
| PATCH /api/jams/:id | Owner/host `{guestControls?,locked?,revokeInvites?,remove?}` |
| POST /api/jams/:id/commands | `{version,action,args}`; validated player commands and host/guest permission checks |
| POST /api/playback/sync | Adds `{type:ping}` and explicit `{type:claim,takeover:true}`; views add takeoverAvailable; jam/resume commands remain server-issued |
| PATCH /api/admin/users/:id | Adds `phone`; no OTP flow; direct admin validation/revocation |
| DELETE /api/admin/users/:id | `{confirmation:targetUUID}` → `{ok:true}`; guarded transactional purge |
| GET /api/admin/users | Adds offset, 200 rows per page |
| GET /api/admin/ops | Adds offset, 100 clients per page and playback entries; connectedUsers counts all live users |

### Added migration and exact DDL

`social-import-admin-v1` runs after the existing playback/Discord migration. Existing nonempty databases receive a consistent worker `VACUUM INTO` snapshot with mode 0600 before `BEGIN IMMEDIATE`; DDL plus marker commit together. Reopening skips the marker. Foreign-key cascades deliberately close owner-created groups, shares and jam rooms rather than silently reassigning ownership. Audit actor/target fields remain historical IDs without foreign keys.

```sql
CREATE TABLE playlist_imports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,source_id TEXT NOT NULL,destination_id TEXT,status TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,summary TEXT NOT NULL);
CREATE INDEX playlist_imports_owner ON playlist_imports(user_id,created_at DESC);
CREATE UNIQUE INDEX playlist_imports_active ON playlist_imports(user_id) WHERE status IN ('queued','running');
CREATE TABLE playlist_import_entries(run_id TEXT NOT NULL REFERENCES playlist_imports(id) ON DELETE CASCADE,position INTEGER NOT NULL,json TEXT NOT NULL,status TEXT NOT NULL,PRIMARY KEY(run_id,position));
CREATE TABLE friend_codes(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,code TEXT NOT NULL UNIQUE);
CREATE TABLE friend_requests(sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at INTEGER NOT NULL,PRIMARY KEY(sender,recipient),CHECK(sender<>recipient));
CREATE INDEX friend_requests_recipient ON friend_requests(recipient,created_at DESC);
CREATE TABLE friendships(a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(a,b),CHECK(a<b));
CREATE INDEX friendships_b ON friendships(b,a);
CREATE TABLE social_preferences(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,show_online INTEGER NOT NULL DEFAULT 0,show_track INTEGER NOT NULL DEFAULT 0);
CREATE TABLE social_groups(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL);
CREATE INDEX social_groups_owner ON social_groups(owner_id);
CREATE TABLE group_members(group_id TEXT NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(group_id,user_id));
CREATE INDEX group_members_user ON group_members(user_id,group_id);
CREATE TABLE shared_playlists(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,playlist_id TEXT NOT NULL,UNIQUE(owner_id,playlist_id));
CREATE TABLE playlist_grants(share_id TEXT NOT NULL REFERENCES shared_playlists(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,permission TEXT NOT NULL CHECK(permission IN ('viewer','editor')),PRIMARY KEY(share_id,user_id));
CREATE INDEX playlist_grants_user ON playlist_grants(user_id,share_id);
CREATE TABLE playlist_group_grants(share_id TEXT NOT NULL REFERENCES shared_playlists(id) ON DELETE CASCADE,group_id TEXT NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,permission TEXT NOT NULL CHECK(permission IN ('viewer','editor')),PRIMARY KEY(share_id,group_id));
CREATE INDEX playlist_group_grants_group ON playlist_group_grants(group_id,share_id);
CREATE TABLE jam_rooms(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,host_id TEXT REFERENCES users(id) ON DELETE SET NULL,json TEXT NOT NULL,version INTEGER NOT NULL,updated_at INTEGER NOT NULL,guest_controls INTEGER NOT NULL DEFAULT 0,locked INTEGER NOT NULL DEFAULT 0);
CREATE INDEX jam_rooms_owner ON jam_rooms(owner_id);
CREATE TABLE jam_members(room_id TEXT NOT NULL REFERENCES jam_rooms(id) ON DELETE CASCADE,user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,seen INTEGER NOT NULL,PRIMARY KEY(room_id,user_id));
CREATE INDEX jam_members_seen ON jam_members(room_id,seen);
CREATE TABLE jam_invites(hash TEXT PRIMARY KEY,room_id TEXT NOT NULL REFERENCES jam_rooms(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE INDEX jam_invites_room ON jam_invites(room_id);
CREATE INDEX jam_invites_expiry ON jam_invites(expires_at);
CREATE INDEX users_created ON users(created_at,id);
CREATE INDEX otps_invite ON otps(invite_hash);
CREATE INDEX oauth_states_owner ON oauth_states(user_id);
CREATE INDEX jam_rooms_host ON jam_rooms(host_id);
CREATE INDEX invites_phone ON invites(phone);
CREATE INDEX invites_creator ON invites(created_by);
CREATE INDEX invites_used_by ON invites(used_by);
CREATE INDEX clients_user ON clients(user_id);
```
