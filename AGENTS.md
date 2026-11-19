# Musike repository guardrails

Scope: this fork and the four-phase WIP package described in ARCHITECTURE.md. Read ARCHITECTURE.md, HERMES_FOUND_BUGS.md, DEPLOYMENT-NOTES.md and ACCEPTANCE-CHECKLIST.md before changes. HERMES reports are append-only; acknowledge fixes/deferrals in CHANGELOG.md. The uploaded baseline had no AGENTS.md; these rules formalize this package's boundaries.

- Work from the fork's source; do not rebase onto upstream or replace fork-only fallback/deployment work.
- Operator-owned .env, docker-compose files, deployment scripts and system paths are outside source-overlay changes. The 19 November 2026 BUG-005 overlay has an explicit user-approved exception for deploy/ytdlp-wrap.sh only; this does not authorize other deployment edits. Never commit runtime data, provider tokens, keys, phone numbers or generated secret files.
- Actual stack: Fastify/TypeScript, React/Zustand/Tailwind, Electron/Capacitor. Preserve the auth-off shared JSON path and standalone native substitutions. Do not introduce FastAPI or a new UI/styling system.
- SQL belongs in the SQLite worker boundary through parameterized async RPC. All private library/token/import queries must use the server-authenticated owner. One application process owns cached library snapshots; adding replicas requires a design change.
- Keep shared browser/native library/discovery modules free of Node-only imports. Keep auth, SQL, filesystem secrets and Google authorization server-only. Google import credentials must never be used by yt-dlp, directAudio, shared search or streams.
- Auth defaults off; Google import hides/gracefully degrades when unconfigured. Check roles/status server-side. Preserve HttpOnly Secure cookies, CSRF origin/header checks, once-only bootstrap and last-admin safeguards.
- Forwarded IPs require explicit immediate-peer trust. Rate limits, presence and audit use the same resolved IP. Do not log request queries/headers, OTPs, provider responses or credentials. Admin actions require structured IP-attributed audit logs.
- Reuse existing CSS tokens, semantic Tailwind utilities, component patterns and TV scopes. Add no CSS variables, inline styling system or innerHTML application rendering. Put new labels in the typed i18n catalogs; English fallback is explicit for the new features group.
- Preserve optimistic ordering, localized updates and bounded lists/jobs/caches. Queue warming must cover manual/playlist/radio/repeat paths and cancel stale byte work without evicting active/nearer-needed media.
- Keep migrations transactional, backed up, idempotent and fail-safe. Keep SQLite schema/index docs and endpoint/asset maps factual. Document private Google API limitations instead of claiming unsupported categories succeeded.
- Run pnpm test, pnpm typecheck and affected web/native/server/desktop bundles. Record actual counts and distinguish mocked tests/build checks from live provider/device acceptance. Update CHANGELOG.md, architecture, deployment notes and acceptance checks with behavioral changes.

## Approved 19 November 2026 production revision

The user explicitly approved BUG-007–012 work plus per-account device synchronization and an authenticated Discord Social SDK service. Web/PWA-only is the intended product. Hermes owns platform retirement in a separate commit following docs/PLATFORM-REMOVAL.md; preserve legacy native build wiring until that runbook is executed. The optional server-side SDK adapter does not authorize restoring an end-user desktop/mobile product or editing existing operator compose/environment files.

Keep one audio output per account through pause-confirmed transfer, not a heartbeat-based forced takeover. Browser/OS/network uncertainty must be documented. Malaysian OTP identities use +60 canonical storage, with digits only at the provider boundary; foreign numbers must not be delivered. Existing duplicate/invalid identities require operator resolution, never an automatic merge. Keep all private playback/OAuth SQL within db worker RPC and owner scope. Vendor SDK binaries/credentials must not enter source packages; real Discord/device/tunnel acceptance remains distinct from fixtures.
