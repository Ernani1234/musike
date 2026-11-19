# Prompt for Hermes — Musike Cloudflare and tunnel audit

You are auditing the existing production Musike deployment for Azan. Start **read-only**. Discover the current host/container/connector/domain topology instead of copying historical hostnames or IPs. Inspect current Musike guardrails, architecture and HERMES_FOUND_BUGS.md. The original incident affects Samsung A07 PWA playlist and radio transitions on both Wi-Fi and mobile data. Source changes alone do not prove an edge cause.

## Approval boundary

Collect evidence and prepare findings plus exact proposed changes and rollback instructions. **Stop for Azan's approval before changing Cloudflare, Access, WAF, caching, DNS, tunnel protocol/settings, operator environment or deployment configuration.** His approval of source fixes is not approval of these live changes. Do not disable authentication, geo restrictions or WAF globally to make a test pass.

## Evidence to collect

1. Map the actual public hostname, Access application/policies/session settings, zone/rulesets, tunnel mode/version/protocol/replicas, connector host, ingress origin URL and application container/image. Record the immediate proxy peer and configured MUSIKE_TRUST_PROXY; never assume a Docker subnet. Redact tokens, tunnel credentials, cookies and OTP/provider secrets.
2. Read retained application `docker logs` for 2026-11-19 05:01–05:05 UTC and trace d28b418d-5564-4c33-b720-8f409d014316. The source trace includes hidden player.playing at 05:03:49.368, waiting at 05:03:51.179, failures at about 05:04:17 and visible at 05:04:19.230. If unavailable, capture a new approved demo reproduction with diagnostics enabled.
3. Correlate operation/request/trace/Ray identifiers across browser export, Musike stdout, connector logs and Access/WAF events. The old export's unlabeled http.start events cannot establish that those were media requests. Missing Ray IDs do not establish where a request stopped. Successful small API responses do not prove the media connection remained usable.
4. Compare direct-origin and public-tunnel behavior using the operator's existing authenticated tools. Test cold/warm audio, Range/206/416, a sustained stream across idle periods, queue preparation, OAuth callbacks, session refresh and the new authenticated playback event stream. Record time-to-first-byte and sustained read progress. Keep credentials out of commands/history and reports.
5. Inspect rules matching /api/stream/*, /api/prepare/*, /api/queue/*, /api/playback/*, /api/auth/* and OAuth callbacks. Identify actual rule IDs/actions rather than proposing blanket exemptions. Check whether Access redirects/challenges appear on media, JSON or event streams.
6. Inspect cache rules, transformations and service-worker behavior. Authenticated API/media and playback event streams retain Cache-Control:no-store. Fingerprinted static assets keep immutable caching; HTML/service worker use revalidation; PWA runtime caches artwork only. Do not use Cache Everything, public media/API caching or stale authenticated responses.
7. Read the connector's actual origin settings: connectTimeout, keepAliveTimeout, keepAliveConnections, tcpKeepAlive, HTTP Host/TLS settings, chunking and HTTP/2 origin options if relevant. Distinguish connector-to-origin settings from Cloudflare edge/CDN limits. Do not invent Cloudflare-Tunnel-Keep-Alive headers or treat TCP keepalives as a browser background scheduler.
8. Check connector restarts/errors, outbound connectivity, host CPU/memory/file-descriptor pressure, Docker health/restarts and application/source admission timing. Evaluate QUIC/http2 changes only against observed transport evidence, with an immediate rollback path.
9. Repeat locked/unlocked playlist/radio tests on the actual Samsung with Wi-Fi and mobile data. Check OS background data/battery/doze/process state. A terminated or suspended PWA is a separate cause from a tunnel failure; do not claim Cloudflare fixes browser lifecycle.

## Required report before approval

Provide a compact table: finding; evidence/timestamps/IDs; current setting; exact proposed setting/rule expression and scope; expected effect; risk; rollback; verification. Classify each conclusion as observed or hypothesis. A correct "no change indicated" is acceptable.

After Azan approves specific changes, apply only those changes one at a time, record old/new values and re-run the same direct/public/device matrix. Verify authentication, cross-user isolation and no-store remain intact. If evidence regresses, roll back the individual change and report it. Never claim vendor or device acceptance from mocked source tests.

Use current primary documentation while auditing:
- https://developers.cloudflare.com/tunnel/reference/origin-parameters/
- https://developers.cloudflare.com/tunnel/configuration/
- https://developers.cloudflare.com/fundamentals/reference/connection-limits/
- https://developers.cloudflare.com/cache/concepts/cache-control/
- https://developers.cloudflare.com/cloudflare-one/access-controls/

Deliver the findings/proposed-changes report for approval, then a separate applied-change/verification report only after approved execution.
