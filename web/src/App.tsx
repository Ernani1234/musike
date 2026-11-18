import { lazy, Suspense, useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { AddToPlaylistDialog, ShortcutsDialog } from "./components/Dialogs";
import { MiniPlayer, TabBar } from "./components/MobileChrome";
import { NowPlayingSheet, PanelDrawer, SidePanel } from "./components/NowPlaying";
import { PlayerBar } from "./components/PlayerBar";
import { Rail } from "./components/Rail";
import { TitleBar } from "./components/TitleBar";
import { desktop } from "./lib/desktop";
import { SettingsDialog } from "./components/SettingsDialog";
import { Toasts } from "./components/Toasts";
import { TrackMenu } from "./components/TrackMenu";
import { FloatingVideo, Theater } from "./components/Video";
import { MD, useMediaQuery } from "./hooks/useMediaQuery";
import { useShortcuts } from "./hooks/useShortcuts";
import { useRouteScroll } from "./hooks/useRouteScroll";
import { TrackListSkeleton } from "./components/TrackList";
import { getT } from "./i18n";
import { capabilities } from "./lib/api";
import { cn } from "./lib/format";
import { legacyRedirect, NOW_PLAYING_HASH, paths } from "./lib/routes";
import { useSession } from "./stores/session";
import { usePlayer } from "./player/player";
import { useLibrary } from "./stores/library";
import { openSettings, useSystem } from "./stores/system";
import { toast, useUi } from "./stores/ui";
const Album = lazy(() => import("./views/Album"));
const Artist = lazy(() => import("./views/Artist"));
const BatchSearch = lazy(() => import("./views/BatchSearch"));
const Collection = lazy(() => import("./views/Collection"));
const Genre = lazy(() => import("./views/Genre"));
const Home = lazy(() => import("./views/Home"));
const Library = lazy(() => import("./views/Library"));
const Search = lazy(() => import("./views/Search"));

const SHEET_HASH = `#${NOW_PLAYING_HASH}`;

export default function App() {
  const session = useSession();
  const location = useLocation();
  const legacy = legacyRedirect(location.pathname, location.search, location.hash);
  const navigate = useNavigate();
  const isMd = useMediaQuery(MD);
  const panelOpen = useUi((s) => s.panelOpen);
  const hasTrack = usePlayer((s) => s.queue.length > 0);
  const loadLibrary = useLibrary((s) => s.load);
  const loadSystem = useSystem((s) => s.load);
  const main = useRef<HTMLElement>(null);
  useRouteScroll(main);

  useShortcuts();

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  // Check yt-dlp shortly after start and say so once if something needs doing (not on Android: no yt-dlp there).
  useEffect(() => {
    if (!capabilities.engineSettings || (session.enabled && session.user?.role !== "admin")) return;
    const t = setTimeout(async () => {
      await loadSystem();
      const info = useSystem.getState().info;
      if (!info) return;
      const t = getT();
      if (!info.ytdlp.path) {
        toast(t.toasts.ytdlpMissing, "error", { label: t.common.install, run: openSettings });
        return;
      }
      const latest = info.ytdlp.latest[info.ytdlp.channel];
      if (info.ytdlp.updateAvailable && latest) {
        try {
          if (sessionStorage.getItem("musike:update-notice") === latest) return;
          sessionStorage.setItem("musike:update-notice", latest);
        } catch {
          /* private mode */
        }
        toast(t.toasts.ytdlpUpdate(latest), "info", { label: t.common.update, run: openSettings });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [loadSystem]);

  const sheetOpen = !isMd && location.hash === SHEET_HASH;
  const closeSheet = () => {
    // Pop the history entry the sheet pushed, so Back and the close button behave the same.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate({ hash: "" }, { replace: true });
  };

  return (
    <div className={cn("grain flex h-dvh flex-col bg-bg md:gap-2 md:p-2", desktop && "md:pt-0")}>
      {desktop && <TitleBar />}
      <div className="flex min-h-0 flex-1 md:gap-2">
        <Rail />
        <main
          ref={main}
          className={cn(
            "scroll-area relative min-w-0 flex-1 overflow-y-auto md:rounded-[20px] md:bg-surface-1 md:ring-1 md:ring-line",
            hasTrack ? "pb-[calc(152px+env(safe-area-inset-bottom))]" : "pb-[calc(88px+env(safe-area-inset-bottom))]",
            "md:pb-0",
          )}
        >
          <div>
          <Suspense fallback={<TrackListSkeleton />}>
          {legacy ? (
            <Navigate to={legacy} replace />
          ) : (
            <Routes>
              <Route path={paths.home} element={<Home />} />
              <Route path={paths.search} element={<Search />} />
              <Route path={paths.searchList} element={<BatchSearch />} />
              <Route path="/search/genre/:id" element={<Genre />} />
              <Route path="/search/artist/:id" element={<Artist />} />
              <Route path="/search/album/:id" element={<Album />} />
              <Route path={paths.library} element={<Library />} />
              <Route path={paths.favorites} element={<Collection kind="favorites" />} />
              <Route path={paths.history} element={<Collection kind="history" />} />
              <Route path="/playlist/:id" element={<Collection kind="playlist" />} />
              <Route path="*" element={<Home />} />
            </Routes>
          )}
          <span hidden data-route-ready />
          </Suspense>
          </div>
        </main>
        {panelOpen && hasTrack && <SidePanel />}
      </div>

      {isMd ? (
        <PlayerBar />
      ) : (
        <>
          <MiniPlayer />
          <TabBar />
        </>
      )}

      <PanelDrawer />
      <NowPlayingSheet open={sheetOpen} onClose={closeSheet} />
      <FloatingVideo />
      <Theater />
      <TrackMenu />
      <AddToPlaylistDialog />
      <ShortcutsDialog />
      <SettingsDialog />
      <Toasts />
    </div>
  );
}
