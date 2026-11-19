# Demo verification and incident interpretation

This package was tested with fixtures/builds, not the operator's live tunnel, Google/WhatsApp credentials, Android phone or Docker deployment. Use this checklist to close the remaining external acceptance items; never paste cookies, OTPs, provider keys or raw request headers into logs/reports.

## Install and rollback

1. Preserve the current source revision and a consistent backup of persistent data; no DB migration is introduced by this patch. Apply the changed/new-file ZIP directly into the uploaded fork root. Keep operator environment/compose/mount files.
2. The only approved deployment-file change is deploy/ytdlp-wrap.sh. Preserve its executable bit and existing mount. The real yt-dlp default path is unchanged. Keep a copy of the old wrapper/source for demo rollback.
3. Use the normal operator build pipeline. Leave auth/provider settings as configured. Turn on MUSIKE_PLAYBACK_DIAGNOSTICS=true on demo, restart, then reload the client so settings enable its diagnostics. Disable detailed logging after the incident capture if desired.
4. If an explicit legacy YTDLP_DELAY exists, test it first. Separately compare YTDLP_WRAP_SUCCESS_DELAY=0 on demo; an unset legacy variable now has no implicit four-second sleep. Do not change production mitigation based only on mocked timings.

## Import reproduction

- The supplied repository contains Google OAuth import and no Takeout upload/parser. Supply the actual failed-item export and production adapter before claiming the reported 387 failures were reproduced.
- Use a small mixed-language library with known playable original IDs, typo/artist variants, live/remix/cover variants, an unavailable video and an ambiguous replacement. Verify original IDs import directly, confident replacements are correct and uncertain/provider-failed items stay reviewable.
- While a run is active, confirm phase/current/last-completed item and processed/total update. Saved imported counts can lag matching while a small batch is pending; the UI labels pending work. Review lists should remain navigable and bounded to 100 rows.
- Re-run top-ups. Existing mapping hits should not resolve again or duplicate tracks/playlists. New collections preserve accepted source order; top-ups append missing items and retain user edits.
- Interrupt/restart a demo run. The last completed report checkpoint is retained; rerun safely. Verify a second account cannot see the first account's report/probe/library. A lower not-found count alone is not acceptance if wrong recordings were imported.

## Playback matrix

For audio mode test playlist, album, imported playlist, manual play-now/play-next/add/remove, queue jump, shuffle, repeat-all/one and radio. Include cold and warm caches, budget pressure and rapid skips. Test video mode for regressions; this patch does not promise full video-byte precaching.

- Measure the interval from advance/load to first audible playback and compare a warm local Range response against cold primary/direct paths. Record device/network and whether the server logged cache_hit or stream.cold; no universal zero-network-latency threshold is asserted.
- Verify readyIds only trigger spare-element preload after the server has a complete cached body. A buffered handoff should not need a fresh next-media URL; autoplay rejection must fall back gracefully.
- Verify Range seeking, 206/416, position-preserving transient retry and no automatic retry of an authentication/challenge loop. Deliberate pause must stay paused on visibility/online changes.
- Force a failed source or temporary network outage. Error probes should log stream.probe and not start a second cold resolver. Export playback diagnostics from the error toast when needed; the export contains only the bounded diagnostic ring, not library/account tokens.

## Android PWA locked-screen reproduction

On the reported phone/browser configuration, repeat each of: screen stays on; lock 30 seconds before ending; lock immediately after starting; manual next while locked if available; unlock after failure; network loss/recovery; deliberate pause; app restart. Run at least ten successive transitions in audio/radio and playlist modes. Record whether the PWA process remained alive and whether a spare element had buffered the next track.

Synthetic hidden-state tests cannot emulate Android terminating or suspending the process. A browser buffer/server header cannot guarantee continued playback after process death. Do not add Background Sync, public caching or WAF exceptions as a substitute for the trace.

## Correlating the failure

Use the non-secret UUID trace in the media URL/x-musike-trace, the x-musike-request-id response header and available Cloudflare Ray ID. Client events are self-reported; server security audit attribution still uses the authenticated owner/resolved trusted-proxy IP.

| Evidence | Interpretation / next check |
| --- | --- |
| Client advance/load but no origin http.start for that trace | Request did not reach the app or client execution was interrupted; inspect device/network and Access/WAF/tunnel records. This alone does not prove Cloudflare caused it. |
| Opaque redirect/authentication or edge_challenge classification | Reauthenticate/verify in a foreground navigation; inspect Access/challenge policy. Avoid automatic login retries. |
| Unexpected 200 HTML without redirect evidence | Check proxy routing/login interception; do not assume an origin crash. |
| source.queued/start with a large wait | Admission/load pressure; preserve queue bounds and inspect active work. |
| resolve.queued/start/complete or source.resolve/resolved with long duration | Metadata/tool/direct-client resolution is the wait; compare explicit wrapper delay and source branch. |
| source.open but delayed source.first_byte | Upstream first-byte wait, not library SQL; bounded selection should end or choose a usable alternative. |
| cache_hit with quick origin bytes, delayed player.playing | Investigate browser buffering/decoder/OS/edge delivery rather than extraction. |
| http.disconnected or stream.disconnected before finish | Client/connection cancelled; correlate a skip/lock/network event rather than categorically calling it server death. |
| No later client events and no new requests until unlock | Possible suspended client; confirm with device tooling, not service-worker assumptions. |

Client JSON/probe fetches do not follow redirects blindly. Some network/CORS failures expose neither response status nor Ray ID to JavaScript; preserve browser Network/edge records for those cases. Compare direct origin and public-path behavior using the operator's existing authenticated tooling. Keep credentials out of shared command history/log output.

## Cloudflare settings: evaluate, do not assume

The source ZIP cannot verify current Access/WAF/geo rules or tunnel settings. Check the actual request's Ray ID and rule action. Only make a targeted deployment change when those records support it. Documented connector settings include keepAliveTimeout, keepAliveConnections and tcpKeepAlive; no custom Cloudflare-Tunnel-Keep-Alive header was added. Retain no-store for authenticated API/media responses and the existing artwork-only PWA runtime cache.

Primary references: [Cloudflare origin parameters](https://developers.cloudflare.com/tunnel/reference/origin-parameters/), [Cloudflare cache control](https://developers.cloudflare.com/cache/concepts/cache-control/), [Chrome Background Sync runtime limits](https://developer.chrome.com/blog/background-sync/). These explain platform controls; they do not establish this incident's root cause.

## Closeout

Attach sanitized traces, latency measurements, import review results and deployment/device versions to the append-only Hermes follow-up. Mark BUG-004/006 fully resolved only after the original symptoms are reproduced/verified absent or a demonstrated deployment/device cause is corrected. Keep BUG-001's mitigation status until real provider/wrapper evidence supports changing it.
