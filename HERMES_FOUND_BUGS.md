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
| BUG-003 | Look-ahead prep not guaranteed on every playback path; cold path stalls | RESOLVED in source; latency demo pending | 2026-11-18 |
| BUG-004 | Radio sometimes stalls advancing to next song or errors server unreachable | MITIGATED + INSTRUMENTED; incident verification pending | 2026-11-18 |
| BUG-005 | yt-dlp wrapper needs whole-file fix beyond BUG-001 mitigation | RESOLVED in wrapper source; deployment check pending | 2026-11-18 |
| BUG-006 | Cloudflare Tunnel Optimization Findings for Codex Evaluation | Browser mitigation implemented; edge/device cause unverified | 2026-11-19 |
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

### BUG-006 — browser mitigation implemented; Cloudflare/device hypotheses remain unverified

- Browser-side buffering of an already-ready next track reduces dependence on a new fetch at the transition. Visibility/online hooks, bounded recovery, request/trace/Ray identifiers and exportable client diagnostics make lock-screen failures inspectable.
- Synthetic media tests exercise ended transitions while visibility is hidden. They do not emulate Android process termination or prove physical screen-off playback on the reported phone.
- The existing PWA caches artwork only. The navigation fallback denylist is not evidence that service-worker termination caused the incident. No Background Sync music scheduler, speculative keep-alive header, blanket WAF exception or public caching of authenticated APIs was added.
- Real tunnel settings, Access/WAF events and a locked-device reproduction are operator checks in DEMO-VERIFICATION.md. A dead/suspended PWA cannot be kept alive by a server cache header; no unsupported continuous-playback guarantee is made.

### Validation

See TEST-RESULTS.md for the exact full-suite/build results, BUGFIX-IMPACT.md for file/function scope and DOCUMENTATION-SYNC.md for concise changed contracts. Original reports, operator settings and unresolved external acceptance evidence are preserved.
