# HERMES_FOUND_BUGS.md — Agent field reports

Append-only reports of bugs found by the Hermes agent (read-only audits and automation) while
operating Musike in production. For ChatGPT revisions: review each report, acknowledge it in the
Change log, then fix it or explicitly defer it. Do not treat these as speculation — every report
below includes reproduction steps and captured evidence.

## Index

| ID      | Title                                                              | Status                | Found      |
|---------|--------------------------------------------------------------------|-----------------------|------------|
| BUG-001 | yt-dlp stream URLs expire ~3-4s after issuance — proxied streams 403 (upstream #28) | MITIGATED (wrapper) | 2026-11-17 |

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
