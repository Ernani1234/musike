# Documentation sync snippets — 19 November 2026

The full updated HERMES_FOUND_BUGS.md and ARCHITECTURE.md are included as drop-in files. BUGFIXES.patch contains the exact diffs. Original Hermes report bodies remain unchanged; the current index and appended follow-up carry the disposition.

## HERMES_FOUND_BUGS.md — current disposition index

```markdown
| ID      | Title                                                              | Status                | Found      |
|---------|--------------------------------------------------------------------|-----------------------|------------|
| BUG-001 | yt-dlp stream URLs expire ~3-4s after issuance — proxied streams 403 (upstream #28) | MITIGATED (wrapper) | 2026-11-17 |
| BUG-002 | Takeout import: 387 not-found (no fuzzy matching) + no live per-item progress | RESOLVED in source; demo rerun pending | 2026-11-18 |
| BUG-003 | Look-ahead prep not guaranteed on every playback path; cold path stalls | RESOLVED in source; latency demo pending | 2026-11-18 |
| BUG-004 | Radio sometimes stalls advancing to next song or errors server unreachable | MITIGATED + INSTRUMENTED; incident verification pending | 2026-11-18 |
| BUG-005 | yt-dlp wrapper needs whole-file fix beyond BUG-001 mitigation | RESOLVED in wrapper source; deployment check pending | 2026-11-18 |
| BUG-006 | Cloudflare Tunnel Optimization Findings for Codex Evaluation | Browser mitigation implemented; edge/device cause unverified | 2026-11-19 |
```

BUG-004 and BUG-006 are intentionally not marked fully resolved: the live incident and physical-device/edge hypotheses have not been verified. The appended dated follow-up records implementation, tests and pending evidence for each item.

## ARCHITECTURE.md — changed HTTP contracts

```markdown
| Method and path | Query/body | Success response; implementation/caller |
| --- | --- | --- |
| GET /api/stream/:id/audio | Optional Range; trace UUID; probe=1 returns owner/trace/video-scoped recent error JSON or {ok:true} without resolving | Cached local or first-byte-raced media; proxyStream; audio source |
| GET /api/stream/:id/video | q=hd for HD, otherwise SD/fallback; optional Range, trace UUID, probe=1 diagnostic JSON | Proxied or cached media bytes; player video |
| GET /api/playback/settings | None | {lookahead,audioQuality,videoQuality,diagnostics}; initial player defaults and opt-in timing mode |
| POST /api/queue/prepare | {clientId,currentId,upcomingIds,revision?}; ID patterns/100 upcoming input cap, depth clipped 0..10 | {accepted:true,lookahead,readyIds}; per-user/client window; older revisions ignored |
| POST /api/playback/events | {events:[{traceId,stage,at,videoId?,ms?,status?,reason?,visibility?,edgeRay?}]}; max 40/16 KiB; normal auth/CSRF wall | 204; enabled diagnostics accept max 240 events/min per user or resolved IP, 128 active keys; 429 on overflow; disabled drops valid batches |
| GET /api/google/status | Logged in owner; after? integer 0..100000, runId? max 80 chars | {connected,autoSync,lastSync,runId,status,report,itemOffset,itemTotal}; after returns at most 100 new items, cursor belongs only to that owner; never tokens |
```

## ARCHITECTURE.md — schema / state / hooks

```markdown
No SQLite table/column/index migration is introduced. Existing import_runs.report JSON gains reviewNeeded, optional candidates/reasons and progress {phase,processed,total,current?,lastCompleted?,pending?,startedAt,updatedAt}. Active status belongs to the authenticated owner and reports bounded cursor deltas; checkpoints are persisted every 20 completed report items and at terminal state. Restart recovery retains completed checkpoints.

Cold audio and warming share first-usable-byte primary/direct selection with bounded admission/deadlines. Ready browser media may buffer before handoff. Existing queue/index/repeat subscriptions plus visibility/online/pageshow recovery and capped retry preserve manual intent. No new DOM ID, CSS variable, inline styling system or innerHTML renderer is added.

Timing uses x-musike-trace / x-musike-request-id and a UUID trace media query. Detailed logging is opt-in; browser rings and recent owner-scoped failure probes are bounded. Authenticated APIs/media remain no-store and the PWA artwork-only cache is unchanged. The only approved deployment-file exception is deploy/ytdlp-wrap.sh.
```
