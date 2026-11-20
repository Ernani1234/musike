# HERMES_FOUND_BUGS.md — Agent field reports

Append-only reports of bugs found by the Hermes agent (read-only audits and automation) while
operating Musike in production. For ChatGPT revisions: review each report, acknowledge it in the
Change log, then fix it or explicitly defer it. Do not treat these as speculation — every report
below includes reproduction steps and captured evidence.

## Index

| ID      | Title                                                              | Status                | Found      |
|---------|--------------------------------------------------------------------|-----------------------|------------|
| BUG-001 | yt-dlp stream URLs expire ~3-4s after issuance — proxied streams 403 (upstream #28) | MITIGATED (wrapper) | 2026-11-17 |
| BUG-002 | Takeout import: 387 not-found (no fuzzy matching) + no live per-item progress | RESOLVED in source; demo rerun pending | 2026-11-18 |
| BUG-003 | Look-ahead prep not guaranteed on every playback path; cold path stalls | CLOSED — source fix accepted by user; regressions retained | 2026-11-18 |
| BUG-004 | Radio sometimes stalls advancing to next song or errors server unreachable | MITIGATED + INSTRUMENTED; incident verification pending | 2026-11-18 |
| BUG-005 | yt-dlp wrapper needs whole-file fix beyond BUG-001 mitigation | RESOLVED — provisionally accepted by user; wrapper content retained | 2026-11-18 |
| BUG-006 | Cloudflare Tunnel Optimization Findings for Codex Evaluation | Browser mitigation implemented; edge/device cause unverified | 2026-11-19 |
| BUG-007 | Locked-screen next-track fetch failure on Samsung A07 | SOURCE LIFECYCLE FIX UPDATED — stable audio element/intent-aware Media Session; Samsung verification pending | 2026-11-19 |
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
| BUG-018 | Stale jam transfer grants, JSON guards and guest next/previous | HERMES FIX RETAINED — reported deployed a67c8db | 2026-11-19 |
| BUG-019 | Redundant Library backup button | HERMES FIX RETAINED — button remains removed | 2026-11-19 |
| BUG-020 | Mobile import modal scrolling | HERMES FIX RETAINED — scrolling/focus layout unchanged | 2026-11-19 |
| BUG-021 | Circular SVG/React event JSON on playback controls | RESOLVED IN SOURCE — real React SVG regression passes | 2026-11-19 |
| BUG-022 | Ordinary locked playlist/radio notification/audio loss | SOURCE LIFECYCLE FIX IMPLEMENTED — Samsung acceptance pending | 2026-11-20 |
| BUG-023 | Persistent audio-only offline music and storage budget | IMPLEMENTED IN SOURCE — offline/storage/auth fixtures pass; real PWA acceptance pending | 2026-11-20 |
| BUG-024 | Compact mobile playlist import presentation | RESOLVED IN SOURCE — existing bottom-sheet scrolling retained; visual acceptance pending | 2026-11-20 |
---

> Current dispositions are in the index and the dated follow-up below. Original reports retain their historical wording/status as evidence. “Resolved in source” does not certify a live provider, tunnel or physical-device acceptance test.

## BUG-001 — yt-dlp stream URLs expire ~3-4s after issuance; proxied streams fail with 403

**Status:** MITIGATED — `ytdlp-wrap.sh` wrapper deployed in production and demo; root cause is in the upstream server and is unfixed at v1.5.1 (Ernani1234/musike#28).
**Severity:** High — playback of server-proxied yt-dlp streams fails with 403 whenever the proxy fetch happens outside the URL validity window.
**Found:** 2026-11-17 by the Hermes agent, while revamping and hardening the self-hosted deployment.
**Surface:** Musike server v1.5.1 (`Ernani1234/musike`, prebuilt `ghcr.io/ernani1234/musike:latest`) using its yt-dlp backend for playback.

### Observed behaviour

- Stream URLs handed to Musike by yt-dlp become invalid roughly 3-4 seconds after issuance. Musike proxies the stream at fetch time, so any fetch later than that window returns 403 and playback errors out.
- Timing probe: a wrapper that calls yt-dlp and then sleeps N seconds reproduces the failure deterministically at N above the validity window; at N=4 the proxy fetch measured a **+3.94 s delta** between URL issuance and the proxied fetch, and the fetch succeeded.

### Root cause

The URL is issued by yt-dlp once, but the actual fetch happens later, when the client requests the proxied stream. By then the stream URL is stale (single-use / short-TTL token semantics), so YouTube answers 403. Musike only notices at proxy time. Tracked upstream as Ernani1234/musike#28 — still unfixed at v1.5.1.

### What it is NOT (checked, not assumed)

- **Not a caching problem:** the 403 occurs on a fresh proxied fetch, not a stale cache entry.
- **Not a proxy/auth misconfiguration:** the same URL fetched inside the validity window succeeds; only the age of the URL changes the outcome.
- **Not client-side:** the failure reproduces with direct server-side fetches inside the same environment.

### Workaround deployed

`ytdlp-wrap.sh` wraps yt-dlp: it runs yt-dlp, then sleeps `YTDLP_DELAY` seconds (default 4) before exiting. Because Musike obtains the proxied URL from the wrapper's output after yt-dlp finishes, the URL Musike ends up proxying is fetched fresh — inside the validity window.

- The wrapper is bind-mounted read-only into `/data` (`./ytdlp-wrap.sh:/data/ytdlp-wrap.sh:ro`).
- Activated with env `YTDLP_PATH=/data/ytdlp-wrap.sh`, delay tuned with `YTDLP_DELAY=4`.
- Verified in production and demo on 2026-11-17: playback works with the wrapper; without it, proxied streams 403.

### Suggested upstream fixes

- Re-invoke yt-dlp (fresh extraction) when a proxied fetch returns 403, instead of serving the stale URL.
- Or: fetch the stream URL lazily at proxy time rather than reusing the one yt-dlp printed at resolve time.

### Operational impact

- Without the workaround, yt-dlp-sourced playback is effectively broken for any fetch slower than ~3 s.
- The wrapper adds a fixed `YTDLP_DELAY` delay per resolve — negligible in practice for interactive playback.
- Remove the wrapper and the `YTDLP_PATH`/`YTDLP_DELAY` env once upstream fixes #28.

---

## Implementation follow-up — BUG-001 — 2026-11-18 WIP source overlay

The preceding field report and its deployed wrapper mitigation are retained unchanged. No operator wrapper, YTDLP_PATH, YTDLP_DELAY, compose or environment file was changed by this package.

Phase 1 now resolves primary and direct fallback candidates ahead of playback, fetches a successful full audio body into the shared cache, and serves warm audio using the same local-file Range path as cached media. The first ready successful candidate can be used without waiting for the other wrapper/direct lookup. Queue priority, active leases, budget reservations and stale-window cancellation address eviction and skip races. Radio is filled before the queue tail; playlist/manual/optimistic changes all renew preparation.

Regression evidence: fixtures cover primary refusal followed by fallback byte capture, a later warm hit without resolution, first-ready direct preparation while primary is pending, exact HTTP 206 bytes from the audio cache, budget/lease behavior and rapid-skip/out-of-order cancellation. These verify warm-path behavior, not production YouTube's token semantics or a measured end-to-end playback latency. The pre-existing cold proxy still retries rejected URLs once. Actual wrapper timing, cold primary/direct fallback and device latency remain demo checks in ACCEPTANCE-CHECKLIST.md; BUG-001 remains operationally mitigated, not asserted fully resolved upstream.

## BUG-002 — Google Takeout import: high not-found rate and no live per-item progress

**Status:** OPEN — root-cause state verified in source; fix delegated to Codex
**Severity:** High — "Not found: 387" of ~695 items silently lost; import gives no feedback while running
**Found:** 2026-11-18 by the Hermes agent, investigating "Imported: 307 · Already present: 1 · Not found: 387"
**Surface:** `server/src/googleImport.ts` → YouTube Data API / source resolution; UI `AccountPanel.tsx`, `en.ts`, `stores/session.ts`
**Scope observed:** prod (music.machan.live, :4180), 2026-11-18

### Observed behaviour
- Import finishes with 387 not-found; sample misses are real songs (maimai/umamusume/proseca titles: "チエルカ／エソテリカ", "スロウダウナー", "ワールドイズマイン (CPK! Remix)") while junk (#shorts, live, meme, CSGO SoloQ Parts 1-13) matched and imported.
- UI shows only the final summary; no per-item streaming progress during the run.

### What it is NOT (checked, not assumed)
- Not a rate-limit abort: TaskQueue(2, 20, 60000) completes and final UPDATE L199 writes the summary.
- Not auth failure: run INSERT L123 executes and routes L219-231 return 202.

### Root cause (verified by reading source)
- `selectImportMatch()` (L20-30): exact source.id first; otherwise normalized title AND artist evidence. `normalized()` strips boilerplate (official/music-video/audio/lyrics/topic/vevo) but there is no fuzzy scoring, no artist-weighted ranking, no duration check, no fallback provider — Japanese/specialised titles miss while generic junk ("CSGO SoloQ") matches.
- Progress is only the final UPDATE (L199); nothing is emitted per item during `start()`.

### Suggested fixes (Azan decision 2026-11-18: BOTH live progress AND better matching)
- Live per-item streaming progress: emit an SSE/poll item-completion event per track so the UI shows N/M processed + not-found names as they fail.
- Better matching: fuzzy/artist-weighted scoring with duration tolerance, ordered candidate fallbacks (video → search-of-title → alternate provider), and explicit "low-confidence, kept for review" bucket instead of a silent not-found list.

### For the next ChatGPT revision
- [ ] Stream per-item completion events during import; surface running counts in AccountPanel.
- [ ] Rework selectImportMatch into scored multi-signal matching; route misses to a reviewable list, not a dead counter.
- [ ] Acceptance: re-run the failed library — not-found drops to only genuinely unavailable tracks; UI shows live progress.

### Change log

| Date | Actor | Change |
|------|-------|--------|
| 2026-11-18 | Hermes agent | Report created (OPEN). Fix delegated to Codex. |

## BUG-003 — Look-ahead preparation not guaranteed on every playback path (cold path still stalls)

**Status:** OPEN — Phase-1 overlay covers warm paths only; completion for all paths delegated to Codex
**Severity:** Medium-High — gaps between tracks / first-play latency on any path the overlay misses
**Found:** 2026-11-18 by the Hermes agent, reviewing the BUG-001 Phase-1 source overlay
**Surface:** `web/src/player/player.ts` (lookahead, primeRadio, api.prefetch/prepare), `web/src/lib/audio.ts`, `server/src/audioCache.ts`, `config.ts`, `adminRoutes.ts`
**Scope observed:** prod via CF tunnel free tier, 2026-11-18

### Observed behaviour
- Phase-1 overlay (repo doc, "Implementation follow-up — BUG-001") resolves primary+fallback ahead of playback and warms the cache, but explicitly only for warm paths: "These verify warm-path behavior… Actual wrapper timing, cold primary/direct fallback and device latency remain demo checks".
- Cold proxy still retries rejected URLs once; first play of any unprepared track pays full cold latency.

### What it is NOT
- Not a missing feature: preparation logic exists (primeRadio, prefetch with prepare(upcoming.slice(0,3)) fallback) — the gap is coverage and cold-path guarantee, per the overlay's own admission.

### Suggested fixes (Azan decision 2026-11-18: extend existing look-ahead to EVERY playback path)
- Guarantee preparation on every path: playlists, albums, radio, shuffle, import results, queue jumps — renew preparation on every queue mutation, not just the covered ones.
- Eliminate the cold-path stall: when no prepared candidate exists, resolve+prepare synchronously with the same first-ready logic used warm, so a fresh track never waits on the wrapper retry chain.

### For the next ChatGPT revision
- [ ] Audit every queue-mutation/playback entry point for preparation renewal; cover albums, shuffle, import results, queue jumps.
- [ ] Make the cold path use the same ahead-of-playback resolution as warm.
- [ ] Acceptance: no audible gap on first play of any path; instrument and demo-verify cold latency per ACCEPTANCE-CHECKLIST.md.

### Change log

| Date | Actor | Change |
|------|-------|--------|
| 2026-11-18 | Hermes agent | Report created (OPEN). Fix delegated to Codex. |

## BUG-004 — Radio sometimes takes very long to advance to the next song or errors "Can't reach the Musike server"

**Status:** OPEN — user-reported; comprehensive logging requested as the diagnostic first step
**Severity:** High — radio playback stalls or dies mid-session
**Found:** 2026-11-18 by Azan (user report) — next-song delay or "Can't reach the Musike server" error
**Surface:** radio advance path (player.ts radio renewal + server resolve endpoints) behind CF tunnel free tier
**Scope observed:** prod, 2026-11-18 (no repro metrics yet — this entry is the logging mandate)

### Observed behaviour
- Occasionally the next radio track takes a very long time to start, or the player errors that it cannot connect to the server.
- Known context: 2026-11-17 "Can't reach the Musike server" was diagnosed as an Access-cookie re-login bounce, not origin death — radio errors may share that signature or be a genuine latency/failure.

### What it is NOT (checked, not assumed)
- Not yet isolated: without per-request timing logs, a CF-tunnel stall, an unresolved next-track wait, an Access cookie expiry, and a backend crash look identical from the UI.

### What Hermes could not check
- Provider-side resolve latency during the incident; tunnel-edge behaviour at that moment.

### Suggested fixes (Azan decision 2026-11-18: create comprehensive logging, then fix)
- Comprehensive request-lifecycle logging: server-side timing for resolve/prepare/stream endpoints (queued → resolved → bytes-served), client-side timestamps for track-advance and error surfaces, correlated by request id; include whether the request was warm (prepared) or cold.
- After logs land, reproduce the stall, then apply the BUG-003 guarantee (radio next-track always prepared ahead of playback) so advance never waits on a cold resolve.

### For the next ChatGPT revision
- [ ] Add correlated server+client timing logs for the full radio advance chain (and playback generally).
- [ ] Apply the always-ahead-of-playback preparation guarantee to radio advance.
- [ ] Acceptance: a stalled advance is diagnosable from logs alone (which stage timed out, warm or cold); radio advance no longer blocks on cold resolve.

### Change log

| Date | Actor | Change |
|------|-------|--------|
| 2026-11-18 | Hermes agent | Report created (OPEN) from Azan's report; logging mandated first. Fix delegated to Codex. |

## BUG-005 — yt-dlp wrapper: whole-file fix requested (beyond the BUG-001 mitigation)

**Status:** OPEN — the deployed wrapper only mitigates BUG-001's 403s; a holistic fix of the wrapper was requested
**Severity:** Medium — wrapper-level delays/retries remain visible as cold-path latency (see BUG-003/004)
**Found:** 2026-11-18 — Azan: "include the fix of ytdlp-wrap as the whole"
**Surface:** `data/ytdlp-wrap.sh` wrapper + the YTDLP_PATH/YTDLP_DELAY env knobs (untouched by the Phase-1 package, per the follow-up note)
**Scope observed:** prod wrapper as deployed at the BUG-001 mitigation

### Observed behaviour
- The wrapper mitigates the upstream 403 via retries/delay, but wrapper timing remains a demo-check unknown; cold paths still pay its retry chain (BUG-003 overlay note).

### Suggested fixes (Azan decision 2026-11-18: fix the wrapper as a whole)
- Holistic review of ytdlp-wrap.sh: retry strategy, delay tuning, error classification (which failures retry vs fail fast), interaction with the Phase-1 first-ready resolution, and removal of redundancy now that resolution happens ahead of playback.
- Reconcile wrapper env knobs with the overlay so the wrapper is only the last-resort path, not the primary latency source.

### For the next ChatGPT revision
- [ ] Full wrapper audit + rewrite pass: classify failures, tighten retries/delays, remove paths made redundant by ahead-of-playback resolution.
- [ ] Acceptance: wrapper only engages on genuine upstream refusal; measured cold latency within the demo checklist budget.

### Change log

| Date | Actor | Change |
|------|-------|--------|
| 2026-11-18 | Hermes agent | Report created (OPEN) per Azan's request. Fix delegated to Codex. |


## Cloudflare Tunnel Optimization Findings — for Codex Evaluation

**Date:** 2026-11-19  
**Found:** Hermes agent, while diagnosing musike PWA next-track failure on Android lock screen  
**Scope:** Musike PWA behind Cloudflare tunnel; deployment: Chrome PWA → Cloudflare tunnel → musike Docker container on gcp-docker-sg (100.88.13.4)

### Observed behaviour
- Musike PWA (Chrome Add-to-Home-Screen, Samsung A07, Android 16, OneUI 8.5) plays current song fine when device is locked (screen off)
- On song completion, next-track transition fails with "cannot connecting to server" error
- Manual next-track or keeping device unlocked works normally
- Error does NOT occur when device remains unlocked
- Cloudflare tunnel may idle-drop or WAF-geo-block the re-fetch request when app wakes from lock screen

### Cloudflare tunnel configuration
- Tunnel token present in `/opt/data/home/.cloudflared/` (credentials [REDACTED])
- Workers package at `/opt/data/synturn-cloudflare-workers/`
- Tunnel routes musike domain to Docker container
- `machan.live` WAF geo-blocks non-MY IPs — CF‑originated probes must be excluded
- Page rules and WAF custom rules for musike domain **unverified**
- Tunnel idle timeout / keep‑ale settings **unverified** — possible cause of backgrounded fetch dropping

### PWA service worker lifecycle on Android lock
- `player.ts` onEnded() handler: `when repeat !== "all" AND autoRadio falsy AND queue exhausted, player pauses instead of loading next track`
- `web/vite.config.ts`: `navigateFallbackDenylist: [/^/api\\\\//]` means API routes always bypass SW
- No `navigator.backgroundSync` registration verified for next-track fetch
- Service worker may be terminated by Android webview when screen locks, killing any background fetch

### Root cause hypotheses (for Codex evaluation)
1. **SW termination on lock**: Android webview terminates the SW on screen lock; next-track fetch uses normal `fetch()` which drops when SW is terminated
2. **Cloudflare tunnel idle-drop**: Tunnel idle timeout drops the connection when app is backgrounded/locked; re-fetch on song completion fails
3. **WAF geo-block**: `machan.live` WAF blocks non-MY IP traffic; CF‑originated next-track fetch from locked device is blocked
4. **Missing caching headers**: No keep‑alive / stale‑while‑revalidate headers on musike Docker origin; backgrounded fetch stale and revalidated/failed

### Suggested Codex evaluation priorities
- PWA service worker lifecycle on Android lock screen (verify SW termination, Background Fetch/Sync registration)
- Cloudflare tunnel idle timeout and keep‑alive configuration (test with `Cloudflare-Tunnel-Keep-Alive` or always‑on keep-alive)
- WAF/page-rule configuration for musike domain (ensure CF‑originated traffic is exempt from geo‑block)
- Caching headers on musike Docker origin (add `Cache-Control: public, max-age=300, stale-while-revalidate`)
- Background Sync registration for next-track pre-fetch when app enters lock screen state



---

## Implementation follow-up — BUG-002–006 — 2026-11-19

Base: uploaded fork main `da3f88384651cdf8ee487054a50b0effb277cb45`. The user approved the evaluated plan and the one-file exception for `deploy/ytdlp-wrap.sh` before implementation. Other deployment/environment/compose files and the SQLite schema are unchanged. Original field reports above remain intact; the index is the current disposition summary.

### BUG-002 — RESOLVED in the supplied import engine/UI; failed-library rerun pending

- The supplied ZIP contains Google OAuth import, not a Takeout parser/upload adapter. The reported production Takeout input and its 387 failed items were not supplied. No new Takeout format/endpoint was invented.
- Validate an original video ID anonymously before replacement searches. Then try title+artist yt-dlp search, the existing Music search chain, and title-only search. Per-item resolution has a 30-second deadline, an initial six-second original-ID allowance and eight-second search-step allowances; each step contributes at most eight candidates.
- Score normalized Unicode title/artist evidence and duration when available. Preserve Japanese voicing and live/remix/cover distinctions. Auto-accept only sufficiently confident, separated candidates. Uncertain or provider-failed items are retained as needs-review with bounded suggestions/reasons; valid source items are not filtered as “junk” by genre/content taste.
- Expose running phase, processed/total, current and last-completed item, pending saves and counts through the existing owner-scoped status endpoint. UI polls at one-second intervals during work and fetches report deltas in pages of 100. Reports remain bounded/paged; durable checkpoints occur every 20 completed report items and at completion/cancellation, rather than a full SQL report write for every item. Restart recovery preserves completed checkpoints.
- Regression fixtures cover matching, original/fallback order, live progress before completion, cursor/owner isolation, review candidates, restart reports and idempotent retry. Actual reduction of the reported 387 misses is not claimed without that input and a demo rerun.

### BUG-003 — RESOLVED in source: queue renewal and cold audio first-byte selection

- All queue/index/repeat mutations use the central player renewal path. Real store tests exercise playList (the album/playlist/import entry point), manual insertion/removal, jumps, shuffle, repeat and ended transitions.
- Cached audio still serves local Range bytes. Cold audio now uses the same candidate discovery/first-usable-byte selection as warming, racing primary/direct paths and cancelling losers instead of waiting on the wrapper retry chain or on a complete file download. Range/206/416 behavior and no-store are retained.
- Candidate acquisition has eight active/24 queued slots, five-second admission wait, a nominal 20-second selection budget including wait, and eight-second first-byte candidate limits. Queue admission failure is 503/server_busy. Streaming body reads have a 30-second inactivity deadline; successful streams are not cut off by the first-byte timer.
- Advisory client-list refresh no longer holds a cold fallback open: cached/default clients are tried immediately; if that choice fails, a changed refreshed list can retry once within the same deadline.
- A prepared browser element buffers only server-confirmed ready upcoming audio. It can hand off without issuing a new media URL on ended; stale buffers are discarded, and rejected spare-element autoplay falls back to the previously authorized player. Standalone native/iOS bridges remain on their existing path.
- Tests cover warm/cold bytes, stalled primary bodies, fallback, queue bursts, cancellation, shared resolver ownership, buffer handoff and autoplay fallback. Cold network latency cannot be zero by definition; audible/device/tunnel latency remains a demo measurement.

### BUG-004 — MITIGATED and instrumented; production incident cause still unverified

- Add trace/request IDs and stage timings for queue admission, resolution, source opening/first bytes, cache hits, streaming completion/disconnect, radio and client lifecycle/errors. Detailed logging is opt-in with MUSIKE_PLAYBACK_DIAGNOSTICS=true; basic failures still have traceable server records. Available Cloudflare Ray IDs are retained as constrained diagnostic identifiers.
- Client JSON/error probes use manual redirect handling, distinguishing opaque/login redirects and edge challenges from JSON origin failures, unexpected HTML, network loss and timeouts. No raw headers, cookies, OTPs, tokens, URLs or provider error text enter the new timing logs.
- Radio retrieval/retry is bounded, failures are surfaced, stale responses cannot overwrite manual queue intent, and transient media errors retry the same track with preserved position. Visibility/online recovery respects deliberate pauses and a retry cap.
- A media error probe now reads a recent owner/trace/video-scoped failure (200 entries, 60 seconds) via probe=1, avoiding a second expensive resolver call solely to learn why the first failed. The normal auth wall still applies.
- The original incident has not been reproduced through the operator's live Access/tunnel stack. Keep this item verification-pending until a real stalled advance is correlated with browser/origin/edge records.

### BUG-005 — RESOLVED in wrapper source; explicit legacy compatibility retained

- The supplied wrapper had no retry chain; it executed yt-dlp then always slept, even after failure. A sleep after extraction does not regenerate a URL. The historical successful deployment observation is preserved without repeating that causal explanation as fact.
- The replacement retries only classified transient metadata-extraction failures, capped at 1..3 attempts. Authentication/bot/private/content/age/rate-limit failures fail fast. Download/version/update commands pass through without automatic retries. Only final attempt stdout reaches the caller, and termination is forwarded/reaped.
- There is no implicit success delay. Explicit YTDLP_DELAY remains a compatibility opt-in; YTDLP_WRAP_SUCCESS_DELAY can override it. Existing operator settings are not silently removed. Measure the deployed combination before disabling a known mitigation.
- POSIX fixtures verify success timing, arguments, retry cap, clean stdout, fatal/pass-through behavior, delay override and signal forwarding. No actual system yt-dlp executable or container mount was changed here.

## BUG-006 — browser mitigation implemented; Cloudflare/device hypotheses remain unverified

- Browser-side buffering of an already-ready next track reduces dependence on a new fetch at the transition. Visibility/online hooks, bounded recovery, request/trace/Ray identifiers and exportable client diagnostics make lock-screen failures inspectable.
- Synthetic media tests exercise ended transitions while visibility is hidden. They do not emulate Android process termination or prove physical screen-off playback on the reported phone.
- The existing PWA caches artwork only. The navigation fallback denylist is not evidence that service-worker termination caused the incident. No Background Sync music scheduler, speculative keep-alive header, blanket WAF exception or public caching of authenticated APIs was added.
- Real tunnel settings, Access/WAF events and a locked-device reproduction are operator checks in DEMO-VERIFICATION.md. A dead/suspended PWA cannot be kept alive by a server cache header; no unsupported continuous-playback guarantee is made.

### Validation

See TEST-RESULTS.md for the exact full-suite/build results, BUGFIX-IMPACT.md for file/function scope and DOCUMENTATION-SYNC.md for concise changed contracts. Original reports, operator settings and unresolved external acceptance evidence are preserved.

---

## BUG-007 — Locked-screen track transition still fails: first on-device diagnostics captured (preload handoff fired, media fetches timed out while hidden)

**Status:** OPEN — incident from BUG-006 now reproduced WITH instrumentation on the real device; fix delegated to Codex
**Severity:** High — continuous listening on a locked phone breaks at every track boundary that needs a fresh media fetch
**Found:** 2026-11-19 by the Hermes agent, from the exported client diagnostics `musike-playback-diagnostics.json` (trace `d28b418d-5564-4c33-b720-8f409d014316`), investigating "when the phone is locked when playing next song got this error"
**Surface:** web client playback pipeline → Musike media proxy → Cloudflare Tunnel/edge; interacts with BUG-001 (URL age) and BUG-003 (look-ahead)
**Scope observed:** prod (music.machan.live), trace window 2026-11-19 05:01:09–05:04:19 UTC (13:01–13:04 MYT), page hidden 05:01:20→05:04:19

### Observed behaviour (from the trace, times UTC)

- 05:01:16.758 `player.preload` `u_6z-Zr5rvE` — look-ahead prepared ~2.5 min before it was needed.
- 05:01:16–05:03:49 track `fjjcBqHUClU` plays. At 05:01:20.825 `page.hidden`; while hidden, the app's ~30 s API heartbeats ALL return 200 (92–221 ms, rays `a5cca883…`, `a5cca93f…`, `a5cca9fa…`, `a5ccaab6…`, `a5ccab71…`) — the app/tunnel/edge path stays fully reachable while locked.
- 05:03:49.320 `player.ended` (`fjjcBqHUClU`); 05:03:49.322 `player.preloaded_handoff` (`u_6z-Zr5rvE`) — the BUG-006 browser mitigation FIRED correctly.
- Immediately at handoff, 3 media-path `http.start` (05:03:49.329/.368/.385): two end at `http.error` `reason:"timeout"` after **28.06 s / 28.06 s** → `prepare.error` ×2; a third ends `reason:"network"` at 28.4 s → `media.error` → `player.error reason:"media"` at 05:04:19.588.
- `page.visible` / `page.resume` arrive at 05:04:19.230 — recovery/visibility logic only ran after unlock; no media retry succeeded while hidden.

### What it is NOT (checked, not assumed)

- **Not a network loss:** API heartbeats kept returning 200 every ~30 s through the entire hidden window, seconds away from the failing fetches.
- **Not a missed preload:** preload ran 153 s before handoff and `preloaded_handoff` executed at the transition.
- **Not the radio path:** this was the manual queue path (`player.load` → `player.playing`).
- **Not yet attributable to the edge:** the timed-out requests recorded NO `edgeRay` — whether they ever reached Cloudflare/origin is unknown from client data alone.

### What Hermes could not check

- Server-side and tunnel/Access/WAF logs for those three requests (they carry no Ray ID in the export; correlation needs the BUG-010 logging overhaul).
- Android/phone-side network state (doze mode, background data restriction) during the hidden window.
- Whether the preloaded media URL was still valid at handoff (~153 s old; cf. BUG-001's expiry behaviour) vs. the fetch stalling mid-transfer.

### Root cause (hypothesis for Codex to verify, evidence above)

While the page is hidden, the media/stream fetch path stalls (no bytes, no status) until the ~28 s client timeout aborts it, while small API requests keep succeeding. The BUG-006 mitigation chain (preload + handoff) executes but does not prevent the failure because the handoff still issues fresh media fetches at transition time. Recovery is visibility-gated, so the queue stays broken until unlock.

### Suggested fixes (Azan decision 2026-11-19: delegated to Codex)

- Correlate the failing fetches with origin/tunnel logs (needs BUG-010) to split "request never left the edge" from "origin stalled".
- Add a hidden-state retry ladder for media fetches failed with timeout/network (bounded, position-preserving), independent of visibility resumption.
- At `preloaded_handoff`, check URL age and re-resolve (fresh yt-dlp extraction) before serving, closing the BUG-001 interplay.
- Rejected alternative: blanket WAF/keep-alive workarounds (already explicitly ruled out in BUG-006).

### Operational impact

- Any transition that needs a fresh media fetch while the phone is locked kills playback until the screen is unlocked; preloaded/cached transitions survive.

### For the next ChatGPT revision

- [ ] Verify against origin/tunnel logs whether the timed-out media requests reached origin.
- [ ] Hidden-state bounded retry for media fetches (timeout/network reasons), preserving queue intent per BUG-006 rules.
- [ ] Freshness check + re-resolve of preloaded stream URLs at handoff.
- [ ] Acceptance: a locked-screen transition completes audibly with no unlock needed, evidenced by a new diagnostics export showing `player.playing` for the next track while `visibility:"hidden"`.

### Status update — 2026-11-19 (user report; log handover)

- Azan reports BUG-007 STILL persists on the Samsung A07 despite the tested source repair: locked-screen transitions still fail/stall, same symptom as the original trace.
- **Log handover:** Azan will supply the recent downloaded on-device log HIMSELF, directly to Codex. Do not re-request, re-derive or reconstruct the client diagnostics export — wait for the file from Azan and correlate every hypothesis against it before writing code.
- Implementation remains delegated to Codex (see "For the next ChatGPT revision" above).

### Change log

| Date | Actor | Change |
|------|-------|--------|
| 2026-11-19 | Hermes agent | Report created (OPEN) with first on-device trace evidence; BUG-006's unverified incident now reproduced with instrumentation. Fix delegated to Codex. |
| 2026-11-19 | Hermes agent | Azan: still reproducing on Samsung A07 (same symptom); fresh log to be supplied DIRECTLY by Azan to Codex. Index status updated. |

## BUG-008 — Remove the `desktop/` and `mobile/` folders completely (Codex to evaluate, Hermes to execute)

**Status:** OPEN — Codex instructed to EVALUATE and produce safe-removal instructions; a prior Codex revision was told to merely ignore these folders and left them in place
**Severity:** Low (repo hygiene) — 168 tracked files of dead weight (desktop/ 16, mobile/ 152) that every revision has to carry and reason around
**Found:** 2026-11-19 by the Hermes agent at Azan's instruction ("no to just ignore desktop and mobile folder but to remove it completely")
**Surface:** repo tree `desktop/` (build, package.json, scripts, src, tsconfig.json), `mobile/` (android, ios, capacitor.config.ts, package.json, scripts, streaming.json); interactions unknown until evaluated
**Scope observed:** `Azan-Shah/musike` @ main, 381 tracked paths, 2026-11-19

### Observed behaviour

- Both folders are tracked at main and are not part of the deployed product (prod runs the web + server containers on PCM).

### Root cause (verified at tree level)

- `mobile/` is a Capacitor wrapper (152 files incl. android/ios scaffolding); `desktop/` a packaged desktop target. Neither is in the deployment path, but removal was deferred rather than done.

### What it is NOT (checked, not assumed)

- Not verified harmless yet: shared code imports, workspace wiring and CI references have NOT been swept — that evaluation is exactly the delegated work.

### Suggested approach (Azan decision 2026-11-19: remove completely, via evaluation-first)

Codex must EVALUATE and then write step-by-step removal instructions for HERMES to execute (Codex does not assume host access):

### For the next ChatGPT revision

- [ ] Sweep references: `pnpm-workspace.yaml` package globs, root `package.json` scripts/workspaces, `pnpm-lock.yaml` entries, `.github/` workflows, `docs/`, `deploy/`, and any `web/`/`server/` import of code under those folders.
- [ ] Produce a removal instruction document for Hermes: exact paths to delete, config files to edit, lockfile/workspace regen command, and the test suite to run afterwards.
- [ ] Hermes executes the instructions on a clean clone; nothing else changes in the same commit.
- [ ] Acceptance: `desktop/` and `mobile/` gone from the tree, lockfile/workspace consistent, full test suite green, zero dangling references (grep sweep clean).

### Change log

| Date | Actor | Change |
|------|-------|--------|
| 2026-11-19 | Hermes agent | Report created (OPEN). Removal delegated: Codex evaluates + writes Hermes instructions; Hermes executes. |

## BUG-009 — Discord Rich Presence (feature request routed through the bug doc)

**Status:** OPEN — design delegated to Codex
**Severity:** Enhancement — show what is playing as the user's Discord status
**Found:** 2026-11-19 by Azan ("add on discord rich presence")
**Surface:** playback state (web client / server queue) → Discord RPC

### Observed behaviour / desired

- Discord should display the currently playing track/artist and playing state.

### What it is NOT (checked, not assumed)

- Not spec'd yet where the RPC client should run. Note the constraint: the desktop app is being REMOVED (BUG-008), so a desktop-app RPC host is off the table; the realistic options are a small server-side/companion process on the host, or a browser-integration approach.

### Suggested fixes (Azan decision 2026-11-19: delegated to Codex)

- Codex to propose the design: RPC host location, auth/scope, track/artist/album artwork fields, idle/pause state mapping, and graceful degradation when Discord is absent.

### For the next ChatGPT revision

- [ ] Design + implement Rich Presence for the playing state, respecting the BUG-008 removal of the desktop target.
- [ ] Acceptance: playing a track updates the Discord status with title/artist; pause/close clears it without errors in the Musike logs.

### Change log

| Date | Actor | Change |
|------|-------|--------|
| 2026-11-19 | Hermes agent | Report created (OPEN). Design delegated to Codex. |

## BUG-010 — Logging overhaul: application must log strictly to stdout (docker logs), no in-app log files; target: Hermes self-diagnosis

**Status:** OPEN — redesign delegated to Codex
**Severity:** Medium (operability) — diagnosing production incidents currently requires files/app-internal state instead of one `docker logs` stream
**Found:** 2026-11-19 by Azan ("logging to be overhaul strictly by tail of docker instead of inside application e.g. allow hermes to read all logs and diagnose himself")
**Surface:** server logging configuration → container stdout → `docker logs` on PCM0267

### Observed behaviour / desired

- All server-side logging must go to stdout/stderr ONLY, so `docker logs -f musike` (and `docker compose logs`) is the single, complete, chronological source of truth. No application-managed log files under `/data` or elsewhere.
- Keep the trace/request IDs and stage timings introduced by BUG-004, now emitted to stdout with the same opt-in switch (`MUSIKE_PLAYBACK_DIAGNOSTICS=true`) for verbose stage detail; basic failures stay traceable by default.
- Preserve the BUG-006 privacy posture: no raw headers, cookies, OTPs, tokens, provider URLs or error text in logs.

### What it is NOT (checked, not assumed)

- The browser-side diagnostics export (BUG-007's JSON) is a client artifact and stays as-is; this entry concerns server-side logging only.

### Suggested fixes (Azan decision 2026-11-19: delegated to Codex)

- Route every log write through the stdout logger; remove/supersede any file-logging path; document the `docker logs` diagnosis procedure so Hermes can read all logs and diagnose without app-internal access.

### For the next ChatGPT revision

- [ ] Eliminate in-app log files; verify the container writes nothing to disk for logging.
- [ ] Ensure trace IDs from BUG-004 appear in stdout records for queue/media/radio/lifecycle events.
- [ ] Acceptance: from the PCM host, `docker logs` alone reproduces a full request trace end-to-end, and no log files are created in the container.

### Change log

| Date | Actor | Change |
|------|-------|--------|
| 2026-11-19 | Hermes agent | Report created (OPEN). Redesign delegated to Codex. |

## BUG-011 — Phone number normalization (requested change)

**Status:** OPEN — delegated to Codex; exact module to be located during the revision
**Severity:** Medium — inconsistent phone entry formats break matching/dedup of user identities
**Found:** 2026-11-19 by Azan ("add in phone number normalization")
**Surface:** user identity / phone-number fields in the server

### Observed behaviour / desired

- Phone numbers must be normalized to a single canonical form (E.164) at input and compared in that form everywhere: trim spaces/dashes/parentheses, handle leading zeros and a default country code (+60), and store/compare consistently so the same number entered in different formats is the same identity.

### What it is NOT (checked, not assumed)

- Hermes has not yet mapped the exact storage/comparison sites in source — Codex locates them in the revision (do not guess the file list).

### Suggested fixes (Azan decision 2026-11-19: delegated to Codex)

- Normalize on input and on comparison; add a one-off migration/backfill for existing stored values; add regressions for +60 formats, spaces, dashes, leading zeros and duplicates-after-normalization.

### For the next ChatGPT revision

- [ ] Locate all phone entry/storage/comparison sites and normalize to E.164 (+60 default).
- [ ] Backfill/migrate existing rows idempotently.
- [ ] Acceptance: the same number entered as `011-300 0675`, `+60113000675` and `60113000675` resolves to one identity; existing data survives the migration.

### Change log

| Date | Actor | Change |
|------|-------|--------|
| 2026-11-19 | Hermes agent | Report created (OPEN). Delegated to Codex. |

## BUG-012 — Codex deliverable: author a Cloudflare/tunnel optimization prompt for Hermes

**Status:** OPEN — delegated to Codex
**Severity:** Enhancement (operability) — BUG-006 and BUG-007 show edge/tunnel behaviour is central to playback reliability, but settings were tuned ad hoc
**Found:** 2026-11-19 by Azan ("maybe codex can also write a prompt for hermes to better improve the cloudflare setting for this application and also the tunnel")
**Surface:** Cloudflare zone settings, WAF/Access rules, caching, and the Cloudflare Tunnel serving prod music.machan.live

### Desired deliverable

- Codex writes a PROMPT (instruction document) addressed to Hermes: how to audit and improve the Cloudflare configuration and the tunnel for Musike — e.g. WAF/Access interactions with media streaming, cache rules for static vs. authenticated media paths, timeouts/proxy settings relevant to the BUG-007 media stalls, tunnel resilience — with an explicit approval gate: Hermes proposes changes, Azan approves, Hermes applies and verifies.

### What it is NOT (checked, not assumed)

- No live Cloudflare change is requested by this entry itself; the deliverable is the prompt/checklist document committed to the repo.

### For the next ChatGPT revision

- [ ] Commit the prompt document (e.g. `docs/CF-TUNNEL-AUDIT-PROMPT.md`) with concrete audit steps, evidence to collect, and rollback notes.
- [ ] Acceptance: Hermes can execute the prompt unaided and produce a findings + proposed-changes report for Azan's approval.

### Change log

| Date | Actor | Change |
|------|-------|--------|
| 2026-11-19 | Hermes agent | Report created (OPEN). Prompt authoring delegated to Codex. |

## Implementation follow-up — BUG-007–012 and device synchronization — 2026-11-19

The user reviewed the architecture/impact questions and explicitly approved implementation, including device sync, authenticated Discord SDK service, Malaysian-only OTP and Hermes-owned platform deletion/live verification. Historical reports above remain unchanged. The index records current dispositions.

### Corrected evidence for BUG-007

The original uploaded `musike-playback-diagnostics.json` contains 48 events. For trace d28b418d-5564-4c33-b720-8f409d014316, **player.playing exists at 05:03:49.368 UTC / 13:03:49.368 MYT while hidden**, after handoff at .322. The player then enters waiting at 05:03:51.179. The incident is a stall after initial playback, not proof that the next song never started. The old http.start events lack operation/path labels; they cannot prove the three failing requests were media transfers. Successful small API requests do not rule out a separate media/transport failure. A same-origin preloaded URL's age is not evidence of an expired YouTube URL, especially with complete server-cached bytes. Origin/tunnel correlation remains pending.

Source fixes require contiguous buffered coverage at handoff, coalesce identical warming requests, record request-purpose and media state, detect no-progress loading and retry twice (500/1000ms) at the same position without waiting for visibility. Pause, skip, logout and transfer cancel retries. Synthetic actual-player fixtures reproduce hidden playing→waiting→recovery and cancellation. Physical Samsung A07 playlist/radio tests on Wi-Fi/data remain necessary; no OS-suspension or Cloudflare root-cause claim is made.

### BUG-008 / BUG-012 deliverables

`docs/PLATFORM-REMOVAL.md` maps exact deletions, Docker/workspace/CI/native-browser wiring edits, lockfile regeneration and acceptance/rollback. Hermes executes separately; folders remain in this delivered revision. `docs/CF-TUNNEL-AUDIT-PROMPT.md` directs read-only inspection and evidence, then exact proposals for Azan approval before any live configuration mutation. Both documentation deliverables are complete; platform execution and edge changes are not claimed.

### BUG-009 / account device synchronization

Added per-owner server playback snapshots, bounded commands/event streams, per-live-document identity, epoch/sequence rejection and explicit silence acknowledgement before transfer. Other devices mirror/control the active output. Opening another tab does not play. Queue/state/shuffle/repeat/radio are shared; volume/theme/media preferences remain local. Unreachable old output cannot be silently forced off, so transfer waits. Normal close sends a small best-effort release; logout waits for acknowledgement.

Discord source adds PKCE/account linking, encrypted refresh lifecycle, unique owner mappings and a private bearer-authenticated service spawning isolated authenticated Social SDK workers. Browser receives no tokens. Pause/stale/disconnect clears presence; absence does not break playback. OAuth tests use mocked providers; sidecar tests use a mock SDK executable. **Official SDK headers/binaries and Developer Portal eligibility were not supplied, so native vendor compilation, headless Ready and real multi-user Discord profile acceptance remain pending.** No bot/local-RPC substitute is asserted to fulfill the chosen integration. See `services/discord-presence/README.md`.

### BUG-010 / BUG-011

Server operational output uses stdout, including structured startup, trace/request/Ray-correlated errors/stages and sanitized audit actions. Existing SQLite security audit history, admin panels and tool progress remain by user decision; no application-managed log-file destination was found or added. Client diagnostic export remains bounded and adds safe fields.

Phone identities normalize to canonical +60; local/international Malaysian variants converge, foreign numbers fail before OTP delivery and wasphere receives digits only. Startup migration preflights invalid/colliding identities, makes consistent worker backups, updates users/invites transactionally and invalidates OTPs. User UUIDs, ownership, roles and libraries are preserved; collisions are never merged automatically. Tests cover equivalence, rejection, backfill/backup, idempotence and failure without identity mutation.

### Dispositions and validation

BUG-002 remains source-resolved with full user import acceptance pending. BUG-003 is closed at the user's instruction. BUG-005 is provisionally accepted with source contents unchanged; executable permission was corrected because the uploaded wrapper was mode 0644 and direct execution failed. BUG-001/004/006 retain mitigation/incident verification status. Exact test/build results and limits are in TEST-RESULTS.md. No production deployment, live Discord/Cloudflare change or platform deletion was performed here.

---

## BUG-013 — Dead active output tab permanently deadlocks device sync; killed tabs stay "online" until nothing can play

**Status:** FIXED in source — server patch commit `d2a0eb4` on `main`, deployed to production as image `musike-prod:local-d2a0eb4` on 2026-11-19 (container healthy). Regression tests added in `10b23d3`. User acceptance (multi-device play/pause/track-select after killing a tab) pending.
**Severity:** Critical — once the active output tab was closed without releasing, **no device in the room could ever play, pause or select tracks again**, and the device list grew with dead tabs marked "online" until playback was impossible.
**Found:** 2026-11-19 by the Hermes agent, while diagnosing user reports of multi-device sync failures on prod (`music.machan.live`).
**Surface:** `server/src/playbackSync.ts` (device-sync engine, fork source) + sync routing in `server/src/playbackRoutes.ts`.

### Observed behaviour (user reports, prod)

- Follower devices could only seek forward/back; play/pause/song selection and stop were rejected.
- Closed tabs stayed in the device list as "online"; the list grew over sessions until no device could play at all — on prod, "I can't play any song either way".

### Root cause

Room state was only reconciled on new-room creation and registration. When the active output device died (tab closed):

- `room.active` still pointed at the dead device. Every play/pause/track command hit the "active device is offline" gate → permanent **409 "The active device is offline"** (follower "only seek works": seek was the action type not gated).
- A pending playback transfer claimed by the dead device could never be acknowledged → every later claim got **409 "Another playback transfer is pending"**, forever.
- Dead devices were only pruned on registration and the "online" flag used a different liveness rule than the active device, so dead tabs lingered "online".

### What it is NOT

- **Not client-side:** the web client (`web/src/lib/playbackSync.ts`) was verified to send the full command set (toggle/next/prev/playTrack/playList/seek) through the sync API correctly; the server rejected them.

### Fix (commit d2a0eb4, server-only; no client rebuild needed)

Added a `reconcile()` pass in `playbackSync.ts`, invoked on every sync `act()` and `register()`:

- Prunes stale non-active devices (no SSE listener + not seen for >180s).
- Clears a dead active device (no listener + >45s since last seen): hands playback to the claimant if one is waiting, otherwise pauses and sets `active = null` so any device can claim.
- Cancels transfers whose owner died or that are older than 30s (new `transferAt` field on the room; previously "pending" was unbounded).
- Device "online" flag in the device list now uses the same liveness rule, so killed tabs drop to offline and are pruned.

### Verification

- TypeScript typecheck clean; full server suite **104/104 pass** (in `node:22-slim` against the patched source).
- Dedicated regression tests (`10b23d3`, `server/test/playback-sync-deadlock.test.ts`): (1) dead active tab self-heals — a claim after 60s takes ownership, can command, dead device shows offline; (2) hung transfer times out after 35s and is re-claimable instead of 409ing forever.
- Prod deployed and healthy (`docker compose build && up -d` in `~/docker-compose/projects/musike-prod`, image retagged `local-c0ed2af` → `local-d2a0eb4`); demo image `musike-demo:local-d2a0eb4` built for the next demo spin. Rollback: prior tags `local-c0ed2af`, `local-bcc5352`, … plus rollback images dated 2026-11-18.

### REVIEW REQUESTED (ChatGPT revisions)

Please review the patch before the next release package: **commit `d2a0eb4` — `server/src/playbackSync.ts`** (original backed up at `/tmp/playbackSync.ts.bak` on the PCM host), plus regression tests in `10b23d3` (`server/test/playback-sync-deadlock.test.ts`). Focus points: the 45s dead-active / 180s prune / 30s transfer-timeout thresholds, reconcile running under the per-user account lock, and epoch/seq reset behaviour when ownership is handed over.


## BUG-014 — Discord presence sidecar stuck at Connecting: runtime image had no CA certificate trust store

**Found:** 2026-11-19 (Hermes). **Symptom:** sidecar workers accepted the access token (`UpdateToken` -> `Connect()`) but every session hung at SDK `status:1` (Connecting) for ~60s, then failed with `status:0, error:1` (Error::ConnectionFailed). No rich presence published.

**Diagnosis chain (why it looked like nothing):**
1. `worker.cpp` status callback initially discarded the Error enum — first fix (`fce2d2d`) emitted full status/error events, revealing `status:1 error:0` (stall inside the SDK).
2. All external network probes PASSED from the same container: DNS A records, TLS to `gateway.discord.gg:443`, `https://discord.com/api/v10/gateway`, even `https://gaming-sdk.com/api/v9/gateway` via Node — HTTP 200. Network was NOT the problem at the transport level.
3. Enabled the SDK's own file logging: `client->SetLogDir("/tmp/discord-logs", LoggingSeverity::Verbose)` (`b93d6ae`, `a1592b4` surfaced SetLogDir's return). Two quirks: the SDK concatenates dir+"discord.log" WITHOUT a separator (file lands at `/tmp/discord-logsdiscord.log` — `find /tmp -name '*.log'`, never just `ls` the dir), and the file flushes only on failure/exit, so an empty dir during Connecting is NOT evidence SetLogDir failed.
4. SDK log on failure showed the real error: `TLS Handshake Error ... handshake.cc:392 268435581` against `https://gaming-sdk.com/api/v9/...` followed by request timeouts — the SDK's bundled **BoringSSL** verifies against the SYSTEM trust store, and the runtime image (`node:22-bookworm-slim` + manual apt layer) had NO `/etc/ssl/certs` at all. Node working did not prove CAs exist: Node bundles its own Mozilla store.

**Fix:** added `ca-certificates` to the runtime `apt-get install` list in `services/discord-presence/Dockerfile` (commit `979a934`). After the rebuild/redeploy the SDK connects and presence publishes: worker logs show continuous `{"event":"discord.sdk.updated","ready":true,"published":true}` every ~5s; user confirmed rich presence live on Discord.

**Not a bug / benign residual:** repeated `RPC Connect error: -2` ("failed to receive READY payload") in the SDK log is the SDK attempting to reach a LOCAL Discord desktop client over IPC — absent in a container; rich presence rides the gateway and is unaffected.

**Key lesson:** a passing network probe from Node does not validate the system trust store for BoringSSL-based binaries. Check `docker exec <ctr> ls /etc/ssl/certs | wc -l` (0 = missing) before suspecting TLS/network/Discord-side issues.

REVIEW REQUESTED — focus points:
- `services/discord-presence/Dockerfile`: ca-certificates added to BOTH stages (builder + runtime); any risk the apt layer bloats or that stage 1 lacked it matters? (Stage 1 also patched — confirm both are needed/consistent.)
- worker.cpp emits `discord.sdk.logdir` `{ok}` and full status events with error names — confirm no token/secret or PII can leak into these log lines (applicationId and status codes only).
- The two SDK log quirks (dir+filename concatenation, flush-on-failure) make future diagnosis non-obvious — consider a comment or doc note in worker.cpp.


## BUG-015 — YouTube playlist import by link (feature request — Codex to implement)

**Status:** OPEN — feature recorded and implementation DELEGATED TO CODEX by Azan (2026-11-19); nothing implemented yet
**Severity:** Enhancement (import) — one-link import of a whole YouTube playlist
**Found:** 2026-11-19 by the Hermes agent at Azan's instruction ("allow to import youtube playlist by link")
**Surface:** web import UI → server import pipeline / yt-dlp wrapper (BUG-005 context); interacts with BUG-002 (Takeout import engine, live per-item progress) and BUG-001 (URL expiry)
**Scope observed:** repo `Azan-Shah/musike` @ `main`, 2026-11-19

### Observed behaviour
- No import path accepts a YouTube playlist URL today; the only bulk import is Google Takeout archives (BUG-002).

### What it is NOT (checked, not assumed)
- Not a duplicate of BUG-002: Takeout imports an offline archive, this is live `list=` links resolved on demand.
- Not the same surface as the single-track yt-dlp path: playlists need batch resolution, ordering and partial-failure handling.

### Root cause (verified by reading source + routing probes)
- Feature gap, not a defect. The fixed yt-dlp wrapper (BUG-005) is the natural resolution engine; the BUG-002 live-progress UI contract is the pattern to reuse.

### Suggested fixes (Azan decision 2026-11-19: delegated to Codex — implement NOW)
- Accept YouTube playlist URLs (`playlist?list=…`, `watch?v=…&list=…`, `music.youtube.com` variants) in the import UI and server API.
- Resolve the batch through the existing yt-dlp wrapper with per-item live progress (reuse BUG-002's engine/UI contract); ordered, resumable on failure.
- Skip-and-report private/unavailable/unembeddable items; never fail the whole batch on one item.
- Respect the existing library dedup so re-importing the same link does not duplicate tracks.
- Rejected alternative: none offered — direct feature request.

### Operational impact
- Curating library content currently needs manual per-track adds or Takeout archives; link import removes the biggest onboarding gap for existing YouTube users.

### For the next ChatGPT revision (Codex)
- [ ] Server endpoint + UI accepting a playlist link, resolving via the yt-dlp wrapper with live per-item progress.
- [ ] Partial-failure reporting and idempotent re-import.
- [ ] Acceptance: importing a 50-video public playlist by link yields all playable tracks in order, with per-item progress visible, and a re-import of the same link creates no duplicates.

### Change log

| Date | Actor | Change |
|------|-------|--------|
| 2026-11-19 | Hermes agent | Report created (OPEN). Implementation delegated to Codex. |

## BUG-016 — Social layer: friends, persistent shared playlists, live jam rooms, presence (feature request — Codex to implement)

**Status:** OPEN — feature recorded and implementation DELEGATED TO CODEX by Azan (2026-11-19); nothing implemented yet
**Severity:** Enhancement (social) — full friends/party system
**Found:** 2026-11-19 by the Hermes agent at Azan's instruction ("somesort like party system of friends system? each user can sync song together eg jam together. share playlist with eachothers")
**Surface:** new social module (server + web) → existing auth/users; extends the device-sync engine (`playbackSync`, BUG-013) from one owner's devices to cross-user rooms; presence intersects BUG-017's admin live view
**Scope observed:** repo `Azan-Shah/musike` @ `main`, 2026-11-19

### Observed behaviour
- Multi-device sync exists within one account (BUG-009/BUG-013 engine). There is no cross-user social feature: no friends, no shared playlists, no listen-together rooms, no user presence beyond one's own devices.

### What it is NOT (checked, not assumed)
- Not a rework of device sync: the existing engine stays the owner-device layer; jam rooms are a new cross-user layer that may reuse its snapshot/epoch/ack design.
- Not presence for admin: the "who is online and playing" admin view is BUG-017 and may consume the same presence data, but is scoped and authorized differently.

### Root cause (verified by reading source + routing probes)
- Feature gap. The needed primitives (auth'd users, SSE command/event streams, playback snapshots from the sync engine) all exist server-side.

### Suggested fixes (Azan decision 2026-11-19: delegated to Codex — implement NOW)
Azan chose the FULL social layer:
- **Friends:** add/accept friend requests between accounts; friends can see each other's shared playlists.
- **Persistent shared playlists:** any user can share a playlist with a friend or group; shared playlists are readable (and optionally editable per share-level) by recipients, survive logouts.
- **Live jam rooms ("listen together"):** any user creates a room; guests join by invite link/code; everyone hears the same queue in sync; host controls playback (option to allow guests); queue additions from any member; room state mirrors the device-sync snapshot model with a designated output.
- **Presence:** show friends who is online and what they are listening to (opt-out per user privacy setting).
- Consent/privacy: sharing and presence are always opt-in per user; leaving a room must be graceful (learn from BUG-013's dead-output failure mode — a leaving host must hand over or pause, never deadlock the room).

### Operational impact
- Currently Musike is a strictly personal library/player; no shared listening between accounts at all.

### For the next ChatGPT revision (Codex)
- [ ] Friends + requests, shared playlists with permission levels, jam rooms with invite codes, presence with opt-out.
- [ ] Room liveness must inherit BUG-013's reconcile lessons (dead host/output handover, no permanent 409 deadlock).
- [ ] Acceptance: two accounts on separate devices — A shares a playlist to B (visible in B's library), A creates a room, B joins by code, both hear the same track in sync, B adds a queue item, A kills their tab and the room hands over or pauses instead of deadlocking.

### Change log

| Date | Actor | Change |
|------|-------|--------|
| 2026-11-19 | Hermes agent | Report created (OPEN). Implementation delegated to Codex. |

## BUG-017 — Admin operations: live view of what online users are playing; permanent user deletion; admin phone-number edit with OTP (feature request — Codex to implement)

**Status:** OPEN — feature recorded and implementation DELEGATED TO CODEX by Azan (2026-11-19); nothing implemented yet
**Severity:** Enhancement (admin/operability)
**Found:** 2026-11-19 by the Hermes agent at Azan's instruction ("allow admin to see also what online user is playing and also able to permanently delete user or edit their phone number")
**Surface:** admin panel (exists; disposition per the 2026-11-19 follow-up above) → server users/admin routes; presence data shared with BUG-016; phone edit interacts with BUG-011 (canonical +60 identities) and the OTP system
**Scope observed:** repo `Azan-Shah/musike` @ `main`, 2026-11-19

### Observed behaviour
- Admin cannot see what an online user is currently playing.
- Admin cannot permanently delete a user account.
- Admin cannot edit a user's phone number.

### What it is NOT (checked, not assumed)
- Not the same authorization surface as BUG-016 presence: this is admin-only, shows regardless of the user's friend-visibility settings (admin is an operator role, not a "friend"); BUG-016 presence remains user-scoped and opt-in.

### Root cause (verified by reading source + routing probes)
- Feature gap in the admin surface; the sync engine already holds live playback snapshots per owner (BUG-009 follow-up) that an admin view can read.

### Suggested fixes (Azan decision 2026-11-19: delegated to Codex — implement NOW)
- **Live "who's playing what":** admin panel view of every online user with their current track/state (playing/paused/idle, device), driven by the existing playback snapshots/SSE.
- **Permanent delete:** hard-delete the user and ALL owned data — account, library, history, playlists, devices/rooms, shares — inside one audited transaction; also purge owned jam rooms and shared-playlist links referencing them (BUG-016 interplay); never silently merge or reassign ownership (BUG-011 collision rule).
- **Phone-number edit:** admin edits the number, but the NEW number must still complete OTP verification before the identity switches (Azan's explicit choice — do not give admins an OTP bypass); canonical +60 normalization (BUG-011) applies; old number's pending OTPs are invalidated on success.
- All three actions audit-logged server-side (audit history retained by user decision, see BUG-010 disposition).

### Operational impact
- Operator cannot moderate accounts or troubleshoot "what is user X hearing right now" without DB access; orphaned/abandoned accounts cannot be removed.

### For the next ChatGPT revision (Codex)
- [ ] Admin live playback view (read-only) over existing snapshots.
- [ ] Hard-delete with full data purge + audit trail; deletes owned rooms/shares cleanly.
- [ ] Admin phone edit gated on OTP verification of the NEW number; +60 normalization; pending OTPs invalidated.
- [ ] Acceptance: admin sees a live playing row for a test user; deleting that user removes every owned record with no orphaned shares/rooms; editing the test user's phone to an unverified new number does NOT switch identity until OTP succeeds.

### Change log

| Date | Actor | Change |
|------|-------|--------|
| 2026-11-19 | Hermes agent | Report created (OPEN). Implementation delegated to Codex. |


---

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

## BUG-018 — Live-jam takeover deadlocked on stale transfer grants (fixed — deployed 2026-11-19, prod @ a67c8db)

**Symptom:** taking over playback on a second device while the first was still playing produced a raw JSON parse-error toast and broke the jam until reload/rejoin (2 devices, ~100% repro). The takeover user also had no next/prev control.

**Root cause chain (confirmed from source):**
1. Server `claim` re-stamped `transferAt` on every same-device retry, so the 30s `reconcile` expiry never fired → stale `room.transfer` blocked all claims/commands with 409s until reload.
2. Transfer grant required the old devices

## BUG-018 — Live-jam takeover deadlocked on stale transfer grants (fixed — deployed 2026-11-19, prod @ a67c8db)

**Symptom:** taking over playback on a second device while the first was still playing produced a raw JSON parse-error toast and broke the jam until reload/rejoin (2 devices, ~100% repro). The takeover user also had no next/prev control.

**Root cause chain (confirmed from source):**
1. Server `claim` re-stamped `transferAt` on every same-device retry, so the 30s `reconcile` expiry never fired — stale `room.transfer` blocked all claims/commands with 409s until reload.
2. Transfer grant required the old device's ack snapshot to report `paused`, but `suspendOutput()`'s status flip is an async audio event — the immediate ack snapshotted `playing` and the grant was refused, ping-ponging forever.
3. One malformed SSE frame tore down the whole sync connection (unguarded `JSON.parse`) into a 3s reconnect loop.
4. Bare `response.json()` in `accountRequest` surfaced the raw `SyntaxError` as the user-visible toast.
5. Guest allowlist in `server/src/jams.ts` only permitted `addToQueue`/`playNext` — `next`/`prev` got 403 "Only the host controls playback" even with `guest_controls` off.

**Fix (8 files, commit a67c8db):** server claim expires transfers after ~10s and no longer re-stamps the clock on re-claim; client ack snapshot forces `paused` when `pausedForTransfer`; SSE frames wrapped in per-event try/catch; `accountRequest` guards the JSON parse and errors carry `.status`; `playJamHere` waits bounded ~12s for the grant before binding `/output` and toasts `transferPending` on timeout; jam commands retry once on 409 with a refreshed view; guest allowlist adds `next`/`prev`; `transferPending` i18n key added.

**Verification:** server tests 117 pass / 0 fail; `tsc --noEmit` clean; prod rebuilt and healthy on `musike-prod:local-a67c8db` (local + public 200). Live 2-browser takeover repro + guest next/prev still to be confirmed manually by the operator.

## BUG-019 — Library top-nav redundant DatabaseIcon backup button (fixed — deployed 2026-11-19, prod @ a67c8db)

Redundant with the pending settings-removal decision (operator-approved). Button, icon import and `setSettingsOpen` usage removed from `web/src/views/Library.tsx`.

## BUG-020 — Playlist import dialog unscrollable on mobile viewport (fixed — deployed 2026-11-19, prod @ a67c8db)

The `Modal` panel had no max-height or scroll: tall content (import report header + summary + entry list) overflowed off-screen on phone viewports. `web/src/components/Modal.tsx` panel is now `max-h-[88dvh]` flex-column with a scrollable, overscroll-contained body — fixes all dialogs, not just the import one.

## BUG-021 — OPEN (Codex handoff): JSON toast still fires on every media-control interaction; "Converting circular structure to JSON" from SVG React fiber nodes (reported 2026-11-19, prod @ a67c8db)

**Operator report after the BUG-018 fix deploy:** transfer/takeover improved, but a JSON error toast still appears on media-control use. This is a Codex handoff entry — investigate and fix; do NOT revert the BUG-018 patches (tests 117 pass / 0 fail, typecheck clean, both devices confirmed hard-refreshed onto the new client bundle).

**Observed:**
- Error fires on ANY media-control interaction (play, next, prev) from EITHER device in a live jam — not only during takeover.
- Error text (verbatim from operator): "Converting circular structure to JSON --> starting at object with constructor 'SVGPathElement' | property '__reactFiber$kcfdn3r52ds' -> object with constructor 'zi' --- property 'stateNode' closes the circle" (same message repeated with 'SVGSVGElement').
- "Audio Video Devices" is the surrounding UI context the operator associated with the error; exact trigger point unconfirmed — operator saw it "just appear" on control interaction.
- Both devices on bundle `local-a67c8db`. No console stack traces collected (operator declined; Codex must repro locally).

**Analysis leads for Codex (NOT verified — starting points):**
- The circular object is a React fiber-linked SVG DOM node, so a non-serializable value (event object, DOM element, or React component instance) is reaching a `JSON.stringify` path. Candidate sites:
  1. Jam command path: `setJamControl` / `playJamHere` in `web/src/lib/jams.ts` — an `args` array or command payload carrying a non-serializable value into `accountRequest`; the parse/serialize guard added in a67c8db may now be surfacing it as the toast.
  2. SSE receive path in `web/src/lib/playbackSync.ts` — `receive()` payload contamination.
  3. Toast call sites passing an Error/ReactNode where `toast()` expects a string, possibly with an "Audio Video Devices" title (devices panel in `PlaybackDevices`/settings).
- The minified constructor `zi` indicates a shared production-bundle component; reproduce on a dev build for the real name.
- Distinguish the toast variant: if it shows the app's `unexpectedResponse` wording, the failure is on the send path (request body serialization); if it shows the raw "Converting circular structure" string, it may be a different catch site. Compare both.
- Suggested repro: 2 devices in one jam on a dev build, press play from each device, capture the console stack.

**Scope:** live jam media controls. Operator accepts current takeover behavior otherwise. Do the heavy lifting: dev-build repro, stack trace, root cause, fix, tests. Deploy per the standing demo-first cycle (demo spun 1:1 from prod, verified, prod after operator sign-off).

## BUG-022 — AMENDMENT (supersedes prior Bug #4 guidance; Codex: refactor the Android background-audio wrapper as a whole) (reported 2026-11-20, prod @ a67c8db)

**Operator report (Samsung A07, Chrome PWA):** background playback bugs persist even after Codex's earlier fix attempts. No diagnostics could be downloaded — evidence is observational only. Operator's words: "we on the right path".

**Observed (operator, verbatim intent):**
- While the phone is LOCKED, the current playing song shows media controls in the Android notification.
- The moment the song advances to the next track (operator is unsure whether the next was manually pressed or auto-advanced — treat both as repro candidates), the notification media controls DISAPPEAR.
- On unlock the song plays right away instantly. Operator confirms this instant-resume-on-unlock is ACCEPTABLE: "music should keep playing seamlessly through lock/unlock — unlock changing to instant play is fine". Note: operator has never verified manual next-while-locked; the desired end state is uninterrupted music while driving (screen locked, song keeps playing forever).
- Operator suspects Android PWA sleep/kill (battery optimization or service-worker/host termination) as the mechanism.

**What Codex must do (scope: evaluate the whole mobile background-audio chain, not another patch):**
- Locate and audit the Android/mobile background-audio wrapper script in the repo (the sh wrapper around playback — operator calls it "such a junky ass quick fix"; server tests reference a wrapper forwarding termination and reaping its metadata child). Codex identifies the exact file(s) from this description.
- Refactor the wrapper + the media-session/notification layer together into a proper design: media notification must survive track advance (auto-advance and manual next) while locked, and the host/PWA must survive Android sleep.
- Cover both repro candidates: auto-advance while locked AND manual next while locked. Re-test on Samsung A07 after each attempt (no diagnostics available — operator verifies behavior manually).

## BUG-023 — NEW: offline mode for music (music only, never video) (reported 2026-11-20)

**Context:** operator's Chrome storage shows the PWA already holds ~4GB of cache.

**Desired behavior (operator-confirmed: options 1 + 3 combined):**
1. Auto-cache recently played songs, bounded by a storage limit (suggest 1–2GB with oldest-evicted; exact cap is Codex's design decision).
2. Cache entire playlists the user explicitly marks offline (a per-playlist "offline" toggle), independent of play history.
3. Video is EXCLUDED entirely from offline caching — no video blobs in the persistent cache.

**Codex design notes:** audit what currently fills the 4GB cache; reconcile the new cache with service-worker/Cache Storage eviction; surface a small usage indicator + per-playlist offline toggle in the UI; music-only enforcement must be hard (no fallback to caching video).

## BUG-024 — NEW: YouTube playlist import dialog restyle for mobile (reported 2026-11-20)

**Desired (operator-confirmed):** bottom-sheet style consistent with other dialogs (BUG-020 already made the Modal scrollable — this entry is purely a styling/UX pass), a compact "Import" pill button, and shortened labels/wording. Codex reworks the mobile presentation of the import dialog (`PlaylistImportDialog.tsx` + copy in `web/src/i18n/*`) — do not reintroduce unscrollable content (keep the Modal a67c8db scroll behavior).


## Implementation follow-up — BUG-007/021–024 — 20 November 2026

Authorized after the user's final confirmation, against upload revision `c1293caa1302c779b589289b6ba590c2d43f6caa`. Original reports above, including the duplicated BUG-018 heading, are preserved verbatim as historical evidence. Hermes BUG-018–020 changes remain in place.

- **BUG-021 resolved in source:** real React SVG path clicks reproduce the circular fiber reference. Controls now explicitly invoke zero-argument actions; the remote/jam boundary constructs a data-only allowlisted payload. Guests retain next/previous permission, conflict refresh/retry, and bounded output-grant waiting.
- **BUG-022 and overlapping BUG-007 source lifecycle fix:** ordinary playlist/radio auto-end and manual-next paths now keep the same audio element. Complete next-body hydration avoids relying on advisory media buffers. Loading retains Media Session play intent; Play is idempotent while loading, Pause cancels loading, and invalid artwork cannot abort playback. Pause-before-source completion cannot later start the prior track. No native app, silent keepalive, speculative tunnel edit or yt-dlp shell rewrite was added. The shell wrapper's existing tests pass unchanged. This is not a claim that the Samsung A07 OS incident is proven resolved: ten locked playlist/radio transitions on both Wi-Fi and mobile data, notification persistence and manual controls still require physical-device acceptance.
- **BUG-023 implemented in source:** user-selected 512 MiB/1 GiB/2 GiB opt-in budget, recent audio cache, explicit personal-playlist pin/update/resume, bounded complete audio-only bodies, atomic owner-scoped admission and oldest-unpinned eviction. Pinned and pending memberships are protected. Offline authenticated reopening, explicit logout purge/pending server logout, same-installation output eligibility, exclusive offline tab ownership and stop-before-reconnect are wired. No offline jams/transfers. An offline installation cannot detect another device's explicit takeover while disconnected, as accepted by the user. Old opaque artwork cache alone is replaced; exact audio usage and approximate total site usage are shown separately.
- **BUG-024 resolved in source:** compact Import pill/short labels/wrapping and removed duplicate padding; retain the existing scrollable mobile Modal. Completed import polling stops. Real narrow-screen/keyboard/focus acceptance remains pending.

Verification: 138 tests, zero failed/skipped; server/web TypeScript, production web/PWA build and server bundle pass. See TEST-RESULTS.md for exact environment, lockfile checks and unperformed device/runtime acceptance. No production deployment or new SQLite schema/endpoint is included.
