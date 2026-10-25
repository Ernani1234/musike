import { useEffect, useLayoutEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from "react-router";
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
import { getT } from "./i18n";
import { capabilities } from "./lib/api";
import { cn } from "./lib/format";
import { legacyRedirect, NOW_PLAYING_HASH, paths } from "./lib/routes";
import { usePlayer } from "./player/player";
import { useLibrary } from "./stores/library";
import { useOffline } from "./stores/offline";
import { openSettings, useSystem } from "./stores/system";
import { toast, useUi } from "./stores/ui";
import { TvDock } from "./tv/TvDock";
import { TvRail } from "./tv/TvRail";
import { useTvMode } from "./tv/useTv";
import Album from "./views/Album";
import Artist from "./views/Artist";
import BatchSearch from "./views/BatchSearch";
import Collection from "./views/Collection";
import Genre from "./views/Genre";
import Home from "./views/Home";
import Library from "./views/Library";
import Search from "./views/Search";

const SHEET_HASH = `#${NOW_PLAYING_HASH}`;

export default function App() {
  const location = useLocation();
  const legacy = legacyRedirect(location.pathname, location.search, location.hash);
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const isMd = useMediaQuery(MD);
  const tv = useTvMode();
  const panelOpen = useUi((s) => s.panelOpen);
  const hasTrack = usePlayer((s) => s.queue.length > 0);
  const loadLibrary = useLibrary((s) => s.load);
  const loadOffline = useOffline((s) => s.init);
  const loadSystem = useSystem((s) => s.load);
  const main = useRef<HTMLElement>(null);

  useShortcuts();

  useEffect(() => {
    void loadLibrary();
    // What is already saved on the device, so those tracks play without a lookup (and the UI knows what it has).
    void loadOffline();
  }, [loadLibrary, loadOffline]);

  // Check yt-dlp shortly after start and say so once if something needs doing (not on Android: no yt-dlp there).
  useEffect(() => {
    if (!capabilities.engineSettings) return;
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

  // Where each history entry was scrolled to, so Back returns to the same spot (say, deep in a genre's artists).
  const scrollMemo = useRef(new Map<string, number>());
  const entryKey = useRef(location.key);
  useEffect(() => {
    const el = main.current;
    if (!el) return;
    const onScroll = () => scrollMemo.current.set(entryKey.current, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // New page, back to the top; Back and Forward return to where it was (the sheet hash is not a page change).
  // A layout effect, so the scroll the old page's removal causes is already filed under the new entry.
  useLayoutEffect(() => {
    entryKey.current = location.key;
    const saved = navigationType === "POP" ? scrollMemo.current.get(location.key) : undefined;
    main.current?.scrollTo({ top: 0 });
    // Pages that keep their data (genre, artist) render in full right away, so one frame is enough.
    if (saved) requestAnimationFrame(() => main.current?.scrollTo({ top: saved }));
  }, [location.pathname]);

  const sheetOpen = !isMd && location.hash === SHEET_HASH;
  const closeSheet = () => {
    // Pop the history entry the sheet pushed, so Back and the close button behave the same.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate({ hash: "" }, { replace: true });
  };

  return (
    <div className={cn("grain flex h-dvh flex-col bg-bg", tv ? "tv-shell" : "md:gap-2 md:p-2", desktop && "md:pt-0")}>
      {desktop && <TitleBar />}
      <div className={cn("flex min-h-0 flex-1", tv ? "gap-3 p-3" : "md:gap-2")}>
        {tv ? <TvRail /> : <Rail />}
        <main
          ref={main}
          className={cn(
            "scroll-area relative min-w-0 flex-1 overflow-y-auto md:rounded-[1.25rem] md:bg-surface-1 md:ring-1 md:ring-line",
            hasTrack ? "pb-[calc(9.5rem+env(safe-area-inset-bottom))]" : "pb-[calc(5.5rem+env(safe-area-inset-bottom))]",
            "md:pb-0",
            // In TV mode a narrow window gets a player bar along the bottom (web/src/tv/TvCompactPlayer.tsx).
            tv && "tv-scroll",
          )}
        >
          {legacy ? (
            <Navigate to={legacy} replace />
          ) : tv ? (
            <div key={location.pathname} className="tv-page">
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
            </div>
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
        </main>
        {tv ? <TvDock /> : panelOpen && hasTrack && <SidePanel />}
      </div>

      {tv ? null : isMd ? (
        <PlayerBar />
      ) : (
        <>
          <MiniPlayer />
          <TabBar />
        </>
      )}

      {!tv && <PanelDrawer />}
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
