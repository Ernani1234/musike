# 20 November 2026 — approved BUG-021–024 / BUG-007 revision

- Fixed React/SVG event serialization at control callbacks and the typed remote/jam command boundary; retained Hermes BUG-018–020 fixes.
- Reworked browser audio transitions around one audio element, complete-body handoffs, intent-aware Media Session and idempotent lock-screen play/pause. Real Samsung validation remains pending.
- Added opt-in audio-only offline storage, selected budgets, recents, explicit personal-playlist downloads/updates/resume, pin-protected LRU admission, usage controls, offline authenticated entry, output fencing and logout purge. No general API/video caching or new SQLite schema/endpoints.
- Replaced the old opaque artwork cache only and compacted playlist import presentation while retaining modal scrolling; stopped terminal import polling.
- Added DOM/IndexedDB regression dependencies only. Existing runtime versions, shell wrapper content, Dockerfile, operator environment/compose/deployment settings, social/admin/Discord behavior and web/PWA-only scope are preserved.
- Verification: 138 tests; typechecks, web/PWA and server bundle pass. Physical Samsung/PWA/real-provider and Docker acceptance remain operator checks.

---

# Changelog

## Unreleased — BUG-007–012 and device synchronization — 2026-11-19

- BUG-007: corrected the incident interpretation from the supplied 48-event export: the next track started hidden, then stalled. Added contiguous-buffer handoff checks, queue-request coalescing, an eight-second no-progress deadline and two cancellable hidden-state retries preserving position. Real Samsung/edge cause remains acceptance-pending.
- BUG-010: fixed operation/request/media-state diagnostic fields, resolved-IP and traceable failure/audit stdout records, structured startup. Existing SQLite audit/progress functions retained by user decision; no app log files.
- BUG-011: Malaysian +60 canonical identity input/storage and digits-only wasphere delivery; consistent worker backups, collision/invalid preflight, transactional idempotent users/invites backfill and OTP invalidation.
- Added authenticated account-level playback synchronization, bounded owner state/commands/SSE, per-document identities, stale-write fencing and pause-confirmed transfers. Volume/appearance/video preference remain local; no forced takeover of unreachable output.
- BUG-009: added owner-bound Discord OAuth/PKCE, encrypted token lifecycle and an isolated authenticated C++ SDK service source. Vendor SDK compilation/headless operation/app eligibility and real profile acceptance remain unverified; feature gracefully hides without configuration.
- BUG-008: completed the reference evaluation and exact Hermes retirement instructions; actual platform deletion is deliberately a separate Hermes commit. BUG-012: delivered evidence-first Cloudflare/tunnel audit prompt with Azan approval and rollback gates.
- BUG-002 remains awaiting the user's import rerun; BUG-003 closed by user acceptance; BUG-005 provisionally accepted, wrapper content retained (executable archive metadata corrected). Original Hermes reports remain append-only.
- Added playback/Discord tables via backed-up worker migration; dependencies, CSS tokens and existing operator configs unchanged. See TEST-RESULTS.md and PRODUCTION-FIXES-IMPACT.md.

## Unreleased — targeted BUG-002–006 fixes — 2026-11-19

- BUG-002: original-ID validation, Unicode title/artist/duration/version ranking, ordered bounded resolver fallbacks and reviewable uncertain/provider failures. Added live progress, bounded report deltas/checkpoints and preserved restart reports; retries remain idempotent. The supplied source has no Takeout adapter; the reported failed export still needs demo reproduction.
- BUG-003: cold audio uses the same first-usable-byte primary/direct race as preparation, with bounded admission/timeouts and preserved Range/no-store. Browser preloading/handoff uses server-ready media, stale queues are cancelled, and shared subprocess cancellation respects other consumers.
- BUG-004: correlated request/trace/stage timings and available Cloudflare Ray IDs; bounded client telemetry/export, manual redirect/error classification, recent failure probes without re-resolution, radio/media retry and lifecycle recovery. The production incident cause remains verification-pending.
- BUG-005: user-approved wrapper-only deployment exception. Removed implicit success sleep, bounded/classified metadata retries, clean final stdout and signal forwarding. Explicit legacy delay compatibility is preserved; other operator files are unchanged.
- BUG-006: browser buffering before background transitions and lifecycle diagnostics/recovery, with synthetic hidden-state tests. No speculative public API caching, WAF exception, keep-alive header or Background Sync scheduler was added. Real locked-device/tunnel verification remains outstanding.
- BUG-001: original field report/mitigation retained. No claim that upstream URL semantics or the historical wrapper explanation were verified here.
- Validation: see TEST-RESULTS.md. SQLite schema, dependencies, CSS tokens and auth/native ownership boundaries are unchanged. Complete replacements and a clean patch are delivered in one source overlay.


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


## 19 November 2026 — expanded web/PWA production revision

- Resolved BUG-008 in source: retired Electron/Capacitor applications and native build/installer wiring; repaired source Docker inputs and regenerated the pnpm lockfile without adding package versions.
- Updated BUG-007 mitigation with bounded complete next-track bytes, active-element Blob handoff, safe cancellation and one fresh foreground recovery; Samsung acceptance remains pending.
- Reviewed BUG-013 with real inbound liveness, bounded transfer recovery and user-triggered stale takeover; preserved old-epoch fencing and normal pause acknowledgements.
- Preserved the working BUG-014 Discord system CA fix; removed temporary SDK file logging and forwarded allowlisted numeric diagnostics to stdout.
- Implemented BUG-015 public playlist-link import with per-item progress, owner-scoped checkpoints, partial failure/retry and duplicate prevention.
- Implemented BUG-016 friend requests, groups, viewer/editor sharing, explicit copies, opt-in presence and versioned jam rooms above private device ownership.
- Resolved BUG-017 in source: paged admin playback visibility, guarded audited permanent deletion and direct Malaysian phone editing without OTP, as explicitly approved; sessions/challenges are revoked and UUID ownership stays stable.
- Kept earlier bug dispositions factual, historical Hermes reports intact and real provider/device/Docker acceptance separate from fixtures.
