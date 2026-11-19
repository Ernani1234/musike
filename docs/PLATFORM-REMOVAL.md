# Web/PWA-only retirement — Hermes execution plan

Codex evaluated references; Hermes executes the deletion in a **separate commit**, as approved. The delivered source still includes the old targets so this code revision can be validated against the current workspace. Do not just delete the two directories: Docker currently COPYs their manifests and Release builds both products.

## Preconditions

Use a clean clone of this fork with the approved fixes applied. Record the source SHA, ensure `git status --porcelain` is empty and create a rollback tag/branch using the operator's conventions. Do not rebase to upstream. Preserve provider config, shared search/discovery, artwork/TV/mobile responsive layouts, server tooling and backups.

## Exact deletion paths

Delete `desktop/`, `mobile/`, `web/src/native/`, `web/tsconfig.native.json`, `web/src/lib/desktop.ts`, and `web/src/components/TitleBar.tsx`. Remove `.github/workflows/release.yml`, which exclusively builds native installers and attaches them to a draft release. Keep `.github/workflows/docker.yml` and its Docker releases. Keep `web/public` PWA icons and all responsive/TV components.

## Required source/config edits in the same retirement commit

| File | Exact edit |
| --- | --- |
| package.json | Remove scripts `desktop` and `installer`. Keep server/web/test/typecheck scripts. |
| pnpm-workspace.yaml | Remove package entries desktop/mobile and the electron-only allowed build entry. Keep server/web and esbuild. |
| web/package.json | Remove `build:native`; make `typecheck` exactly `tsc --noEmit`; remove @capacitor/app, @capacitor/core, @capacitor/filesystem, @capacitor/share. Keep the UI/PWA dependencies. |
| web/tsconfig.json | Remove the now-unnecessary `exclude:[src/native]`; keep include/compiler options. |
| web/vite.config.ts | Remove `nativeBackend()`, `src/server/same/here` helpers used only by it, native mode/outDir/proxy conditionals and unused path/fileURLToPath/Plugin imports. Keep react(), tailwindcss(), the existing VitePWA settings and /api proxy unchanged. Use an unconditional normal defineConfig object. |
| web/src/main.tsx | Remove desktop import and guard; always registerSW({immediate:true}). Keep AuthGate, StrictMode, router and TV mode. |
| web/src/App.tsx | Remove desktop/TitleBar imports and conditional TitleBar; remove desktop-dependent md:pt-0 class. Preserve the new playback-sync effect. |
| web/src/stores/ui.ts | Remove desktop import and desktop?.setTheme(theme), retaining browser theme behavior. |
| web/src/i18n/index.ts | Remove desktop import and desktop?.setLanguage?.(lang); retain browser language persistence. |
| web/src/lib/audio.ts | Remove the Swift NativeAudio/bridge types and class. Keep createAudio() as a browser Audio element with preload=auto. Keep createUpcomingAudio() for HTTP(S) supported browsers, preserving the existing iPhone/iPad/iPod/single-player exclusions; remove only nativeBridge checks. This preserves the approved stall recovery/handoff behavior. |
| README.md | Replace logo path desktop/build/icon.png with web/public/icon-192.png. Remove installer/native download/build sections and obsolete desktop/mobile roadmap claims. Describe web/PWA support and the new account-level sync separately from library backup. |
| web/src/i18n/en.ts, pt.ts | Remove desktop-app wording from backup.body, preserving equivalent browser-to-browser backup guidance. New feature keys retain the existing English fallback. |
| web/src/lib/api.ts, apiTypes.ts, backup.ts; components/BackupSection.tsx | Remove obsolete comments describing build swaps/desktop save dialogs/native share sheets. Keep browser HTTP facade, exports and backup contracts used by the live app. Unused native-only types may be removed only after a reference sweep. |
| ARCHITECTURE.md, AGENTS.md, DEPLOYMENT-NOTES.md, ACCEPTANCE-CHECKLIST.md, PACKAGE-MANIFEST.md | Make current supported-platform descriptions/build commands factual. Record historical native validation as historical; do not rewrite append-only Hermes reports. Remove native entries from current directory/dependency maps. Keep optional services/discord-presence infrastructure: it is not an end-user desktop app. |
| pnpm-lock.yaml | Regenerate from the edited workspace with pnpm 10.14.0; do not hand-delete dependency snapshots or change unrelated versions. |

`server/src/directAudio.ts` still fetches the **upstream repository's** `mobile/streaming.json`, not the local file being deleted. Keep that external URL and the default-client fallback; a string match is not a broken local import. Relocating ownership of that remote config is a separate design decision.

## Commands and acceptance

After the above edits run:

```sh
pnpm install --lockfile-only
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm --filter @musike/server bundle
```

Sweep executable wiring with `rg -n 'musike-desktop|@musike/mobile|desktop/package|mobile/package|build:native|src/native|lib/desktop|TitleBar|@capacitor' package.json pnpm-workspace.yaml pnpm-lock.yaml Dockerfile .github web server`. Inspect every match. No functional local reference to a deleted path may remain. Historical reports, responsive "desktop/mobile" terminology and the intentional external upstream streaming URL are not dangling imports. Do not falsify a grep-clean claim by deleting historical evidence.

Build the actual Docker image after removing **only** `COPY desktop/package.json desktop/` and `COPY mobile/package.json mobile/` from Dockerfile; update its adjacent comment. Preserve runtime tools/env/paths. This exact Dockerfile adjustment is part of the retirement instructions, not an applied deployment mutation in the source-fix package. Operator compose and deployment scripts remain untouched.

Verify login, library/backup, search, streaming, Range seeking, device sync, Discord optional configuration, phone-size PWA installation/background playback and TV browser navigation. Check the repository tree contains none of the deletion paths. Commit just retirement changes and documentation. Send Azan the diff/test/image results before any production promotion. Update BUG-008 with the executed SHA and acceptance evidence.

Rollback by reverting the retirement commit and rebuilding the old source; dependency/workspace/lockfile/native wiring must roll back together. Do not touch persistent application data for this platform-only retirement.
