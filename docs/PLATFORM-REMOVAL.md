# Web/PWA-only retirement — executed in source

The user approved Codex execution of BUG-008 in the expanded 19 November 2026 package based on upload `79958c4d54b9173ce2d80182973c6dce80e208be`. Hermes no longer needs to perform the source deletion separately. Production image promotion remains an operator action.

Removed `desktop/`, `mobile/`, `web/src/native/`, `web/tsconfig.native.json`, `web/src/lib/desktop.ts`, `web/src/components/TitleBar.tsx`, and native-only `.github/workflows/release.yml`. Removed Electron/Capacitor package entries, dependencies, native build scripts, Vite substitutions and native bridge wiring. The source Dockerfile no longer copies deleted package manifests. pnpm 10.14.0 regenerated the lockfile: 810 → 436 package entries; no new package versions or direct dependency upgrades.

Preserved browser/PWA startup, artwork-only service worker policy, icons, responsive phone layouts, TV browser navigation, streaming and Range support, auth-off JSON libraries, private accounts and optional server-side Discord infrastructure. `server/src/directAudio.ts` intentionally still fetches the upstream repository's remote `mobile/streaming.json`; it never reads the deleted local path.

Validation commands are `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm --filter @musike/server bundle` and `docker build -t <operator-image> .`. Exact results and environment limitations are recorded in TEST-RESULTS.md. Inspect executable references to retired paths; historical reports/patches and responsive "desktop/mobile" terms are retained as evidence, not active targets.

Apply the complete new source tree to a clean checkout or use the supplied patch against the matching upload. Extracting a ZIP over an old tree does not delete retired files. Preserve operator environment/compose files and persistent data. Do not apply the archived older patches after this revision.

Rollback platform removal together with manifests, lockfile, Vite configuration and Docker inputs from the original upload. Rolling back the whole expanded release also requires the matching pre-migration data backup; do not remove user data as a platform cleanup step.
