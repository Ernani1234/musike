# HERMES_FOUND_BUGS.md — Agent field reports

Append-only reports of bugs found by the Hermes agent (read-only audits and automation) while
operating Musike in production. For ChatGPT revisions: review each report, acknowledge it in the
Change log, then fix it or explicitly defer it. Do not treat these as speculation — every report
below includes reproduction steps and captured evidence.

## Index

| ID      | Title                                                              | Status                | Found      |
|---------|--------------------------------------------------------------------|-----------------------|------------|
| BUG-001 | yt-dlp stream URLs expire ~3-4s after issuance — proxied streams 403 (upstream #28) | MITIGATED (wrapper) | 2026-11-17 |
| BUG-002 | Dead active output tab permanently deadlocks device sync — no device can play; dead tabs stay "online" | FIXED (d2a0eb4, in prod 2026-11-19) | 2026-11-19 |

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

---

## BUG-002 — Dead active output tab permanently deadlocks device sync; killed tabs stay "online" until nothing can play

**Status:** FIXED — server patch commit `d2a0eb4` on `Azan-Shah/musike` main, deployed to production as image `musike-prod:local-d2a0eb4` on 2026-11-19 (container healthy). Regression tests added in `10b23d3`.
**Severity:** Critical — once the active output tab was closed without releasing, **no device in the room could ever play, pause or select tracks again**, and the device list grew with dead tabs marked "online" until playback was impossible.
**Found:** 2026-11-19 by the Hermes agent, while diagnosing user reports of multi-device sync failures on prod (`music.machan.live`).
**Surface:** `server/src/playbackSync.ts` (device-sync engine, fork source) + sync API routing in `server/src/playbackRoutes.ts`.

### Observed behaviour (user reports, prod)

- Follower devices could only seek forward/back; play/pause/song selection and stop were rejected.
- Closed tabs stayed in the device list as "online"; the list grew over sessions until no device could play at all — even in prod, where "I can't play any song either way".

### Root cause

The sync engine only reconciled room state on new-room creation and device registration. When the active output device died (tab closed):

- `room.active` still pointed at the dead device. Every play/pause/track command hit the gate at the "active device is offline" check → permanent **409 "The active device is offline"** (follower "only seek works": seek was the one action type not gated).
- A pending playback transfer claimed by the dead device could never be acknowledged → every later claim got **409 "Another playback transfer is pending"**, forever.
- Dead devices were only pruned on registration and the "online" flag used a liveness rule the active device didn't, so dead tabs lingered "online".

### What it is NOT

- **Not client-side:** the web client (`web/src/lib/playbackSync.ts`) was verified to send the full command set (toggle/next/prev/playTrack/playList/seek) through the sync API correctly; the server rejected them.

### Fix (commit d2a0eb4, server-only; no client rebuild needed)

Added a `reconcile()` pass in `playbackSync.ts`, invoked on every sync `act()` and `register()`:

- Prunes stale non-active devices (no SSE listener + not seen for >180s).
- Clears a dead active device (no listener + >45s since last seen): hands playback to the claimant if one is waiting, otherwise pauses and sets `active = null` so any device can claim.
- Cancels transfers whose owner died or that are older than 30s (new `transferAt` field on the room; previously "pending" was unbounded).
- Device "online" flag in the device list now uses the same liveness rule, so killed tabs drop to offline and are pruned.

### Verification

- TypeScript typecheck clean; full server suite **104/104 pass**.
- Two dedicated regression tests (`10b23d3`, `server/test/playback-sync-deadlock.test.ts`): (1) dead active tab self-heals — a new claim after 60s takes ownership, can command, dead device shows offline; (2) hung transfer times out after 35s and is re-claimable instead of 409ing forever.
- Prod deployed and healthy (`docker compose build && up -d`, image retagged `local-c0ed2af` → `local-d2a0eb4`); demo image built for the next demo spin. Rollback: previous image tags remain (`local-c0ed2af`, `local-bcc5352`, …; rollback images from 2026-11-18).

### REVIEW REQUESTED (ChatGPT revisions)

Please review the patch before the next release package: **commit `d2a0eb4` — `server/src/playbackSync.ts` on PCM at `~/src/musike`** (original backed up at `/tmp/playbackSync.ts.bak`), plus regression tests in `10b23d3` (`server/test/playback-sync-deadlock.test.ts`). Focus points: the 45s dead-active / 180s prune / 30s transfer-timeout thresholds, reconcile running under the per-user account lock, and epoch/seq reset behaviour when ownership is handed over.
