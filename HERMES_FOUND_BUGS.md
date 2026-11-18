# HERMES_FOUND_BUGS.md — Agent field reports

Append-only reports of bugs found by the Hermes agent (read-only audits and automation) while
operating Musike in production. For ChatGPT revisions: review each report, acknowledge it in the
Change log, then fix it or explicitly defer it. Do not treat these as speculation — every report
below includes reproduction steps and captured evidence.

## Index

| ID      | Title                                                              | Status                | Found      |
|---------|--------------------------------------------------------------------|-----------------------|------------|
| BUG-001 | yt-dlp stream URLs expire ~3-4s after issuance — proxied streams 403 (upstream #28) | MITIGATED (wrapper) | 2026-11-17 |
| BUG-002 | Takeout import: 387 not-found (no fuzzy matching) + no live per-item progress | OPEN (Codex) | 2026-11-18 |
| BUG-003 | Look-ahead prep not guaranteed on every playback path; cold path stalls | OPEN (Codex) | 2026-11-18 |
| BUG-004 | Radio sometimes stalls advancing to next song or errors server unreachable | OPEN (Codex) | 2026-11-18 |
| BUG-005 | yt-dlp wrapper needs whole-file fix beyond BUG-001 mitigation | OPEN (Codex) | 2026-11-18 |

---

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

