# Changelog

## Unreleased — WIP demo package — 2026-11-18

### Phase 1 — Queue pre-caching

- Added server-controlled lookahead, full audio-byte caching, concurrent primary/direct candidate preparation and local Range playback for warm tracks.
- Shared audio/HD cache accounting, reservations, active-response leases and queue priority prevent lookahead from evicting nearer-needed/current media. Budget blockage stops a stable window; rapid skips replace/cancel old byte work and stale request revisions are ignored.
- Wired playlist, manual/optimistic, repeat-all and proactively filled radio queues to the same preparation path. Server defaults preserve existing device choices.
- Reviewed HERMES BUG-001. Warm cached audio avoids URL age and wrapper-delay resolution at the switch. Retained the operator's wrapper and its reported mitigation; cold live/provider behavior remains a demo check, not a claimed upstream root-cause fix.

### Phase 2 — Accounts and WhatsApp OTP

- Added opt-in hard login wall, invite-only per-user libraries and a once-only ADMIN_PHONE bootstrap, plus a container-compatible promotion/revocation CLI.
- Implemented the specified wasphere send contract without automatic ambiguous-result retries, hashed six-digit single-use OTPs, cooldown/rate/attempt limits and secure refresh-backed cookies with server logout.
- Selected SQLite WAL in a worker thread; added transactional, backed-up/idempotent shared-JSON ownership migration. Auth off retains the legacy JSON flow. No new dependency versions or deployment-file edits.
- Added session-scoped player persistence and media shutdown on observed session expiry. Hosted iOS audio uses same-origin WebView cookies; standalone native storage/bridge remain available.

### Phase 3 — Admin and operations

- Added admin-only persisted media/OTP settings, invites, roles, approval/disable controls, last-admin protection, cache usage, retained error/audit tail and heartbeat presence with IPs.
- Added explicit proxy IP/CIDR trust with no forwarded-header trust by default. The same resolved IP feeds OTP limits, presence and structured audit/error attribution.
- Restricted existing instance tool controls to admins when auth is enabled; device appearance settings remain available to everyone. Audit logging omits request queries, headers and provider credentials.

### Phase 4 — YouTube Music import

- Added per-user optional Google authorization-code/PKCE consent using only youtube.readonly, encrypted server-side refresh credentials and owner-bound callback state. Playback never receives these credentials.
- Added ordered playlist and album-as-playlist imports, likes, latest-60 history attempts, origin labels, bounded per-item reports, conservative title/artist matching and idempotent top-ups with batched mappings.
- Added default-off per-user daily sync, cancellation, disconnect/revocation and restart recovery. Reports refresh the library and render at most 100 rows per page.
- Public playlists/likes have API fallbacks. Albums/history depend on the private Music adapter; refusal/limits produce partial/unavailable reports. Subscriptions are skipped because Musike has no artist-follow model. Live provider acceptance is explicitly outstanding.

### Validation and delivery

See `TEST-RESULTS.md` and `ACCEPTANCE-CHECKLIST.md`. The source overlay includes full changed/new files, architecture, implementation mapping and operator setup notes. Operator-owned `.env`, compose and deployment files are excluded.
