# Impact analysis — BUG-021–024 and BUG-007 — 20 November 2026

Base: `c1293caa1302c779b589289b6ba590c2d43f6caa` from `musike-main (6).zip`. The user approved this scope and the recommended offline policy before implementation. Hermes BUG-018–020 patches are preserved. Source is web/PWA only.

| Exact file(s) | Functions / necessary change |
| --- | --- |
| `web/src/components/Controls.tsx` | `Transport`: explicit zero-argument shuffle/previous/toggle/next/repeat callbacks |
| `web/src/components/MobileChrome.tsx` | `MiniPlayer`: explicit toggle invocation |
| `web/src/components/Queue.tsx` | Queue clear-upcoming callback invokes its action |
| `web/src/lib/playbackCommands.ts` (new) | `playbackCommand`, private track copier: allowlisted data-only command encoding, bounded queues, validated scalar arguments |
| `web/src/lib/playbackSync.ts` | `startPlaybackSync` patched actions and receive: encode remote/jam commands, remember installation output eligibility; `setOfflineOutput` fences offline output |
| `web/src/lib/jams.ts` | `receive` command callback: same encoder before serialized jam requests, preserve generation and conflict retry |
| `web/src/player/player.ts` | `load`, `warmQueue`, `onStarted`, `onEnded`, `onError`, `toggle`, media listeners, output/session shutdown and metadata/state wiring: one audio element, intent-aware lifecycle, local downloaded bodies, source-generation cancellation |
| `web/src/lib/audio.ts` | Retain `createAudio`; remove unused spare-element factory |
| `web/src/lib/mediaSession.ts` (new) | `mediaPlaybackState`, `mediaMetadata`, `registerMediaActions`: coherent loading intent and idempotent lock-screen actions |
| `web/src/lib/playbackPreload.ts` | Complete-body callback and persistent hydration, reject HTTP 206; retain target/attempt/size/deadline/cancellation bounds |
| `web/src/lib/offlineStore.ts` (new) | IndexedDB schema/transactions; settings/summary/read/save/touch/pin/trim/purge functions, atomic owner-scoped budget decisions |
| `web/src/lib/offlineDownloads.ts` (new) | Complete audio admission, one-worker downloads, explicit pin/resume/update/unpin, recent caching, local source lookup, profile/output eligibility, cancellation and owner logout cleanup |
| `web/src/stores/offline.ts` (new) | `useOffline`: bounded summary/job/error/storage-estimate state |
| `web/src/components/OfflineStorage.tsx` (new) | `OfflineStorage`, `OfflinePlaylistButton`: budget/enable/usage/pin/update/resume/unpin UI |
| `web/src/views/OfflineLibrary.tsx` (new) | Downloaded library, existing transport/scrubber/volume; `OfflineExperience` owner eligibility/Web Lock, stop-before-reconnect and offline logout |
| `web/src/components/AuthGate.tsx` | `AuthGate`: verified offline profile, network-only fallback, known-auth invalidation, logout broadcast and pending server logout |
| `web/src/stores/session.ts` | `SessionInfo.offline`; `accountRequest` rejects general offline requests, tags transport errors and handles 401 before body classification |
| `web/src/lib/api.ts` | General request guard for offline mode; known 401 invalidates output/profile even when an intermediary returns HTML |
| `web/src/components/AccountPanel.tsx` | Explicit online logout purges the owner's offline data after server logout |
| `web/src/App.tsx` | `App` separates offline/online trees; `OnlineApp` wires `/offline` |
| `web/src/lib/routes.ts` | `paths.offline` browser route |
| `web/src/views/Library.tsx` | Downloads/storage entry, compact Import pill |
| `web/src/views/Collection.tsx` | Personal playlist pin/download/update action |
| `web/src/components/PlaylistImportDialog.tsx` | Short labels, wrap long rows, remove duplicate padding and stop terminal polling; existing Modal untouched |
| `web/src/i18n/en.ts`, `pt.ts` | Typed `offline` catalog, explicit English fallback |
| `web/src/main.tsx`, `web/vite.config.ts` | Targeted old-artwork cleanup and image-only readable-200 cache, cap 100; preserve app precache and API exclusions |
| `server/package.json`, `pnpm-lock.yaml` | Test-only jsdom/fake-indexeddb and required dependency closure; existing runtime/lock entries unchanged |
| `server/test/player-lifecycle.test.ts`, `playback-sync-client.test.ts`, `playback-preload.test.ts` | Update actual-player/sync fixtures for stable element, loading actions and persistent hydration |
| `server/test/media-session.test.ts`, `offline-auth.test.ts`, `offline-downloads.test.ts`, `offline-store.test.ts`, `playback-controls-dom.test.ts` (new) | Focused regression coverage for Media Session, actual React SVG events, offline auth, body admission, interruption, budget/pins and owner cleanup |

Documentation: `AGENTS.md`, `ARCHITECTURE.md`, `HERMES_FOUND_BUGS.md`, `CHANGELOG.md`, `DEPLOYMENT-NOTES.md`, `ACCEPTANCE-CHECKLIST.md`, `TEST-RESULTS.md`, `PACKAGE-MANIFEST.md`, `SOURCE-SHA256.json`, plus this impact, handoff and documentation snippets. The supplied clean patch contains complete new/changed file content with no replacement placeholders.

No server application module, SQLite query/schema/index, endpoint, CSS file/token, Modal, Dockerfile, operator config, vendor SDK, or deployment script content changed. Original ZIP executable metadata is retained. Old reports/patches remain historical evidence and must not be reapplied.
