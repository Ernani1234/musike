import { KeyboardIcon, QueueIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { cn } from "../lib/format";
import { useT } from "../i18n";
import { selectCurrent, usePlayer, useStatusText } from "../player/player";
import { useUi } from "../stores/ui";
import { Artwork } from "./Artwork";
import { FavoriteButton, ModeSwitch, Scrubber, Transport, Volume } from "./Controls";
import { IconButton } from "./IconButton";
import { LyricsButton, useLyricsNavigation } from "./Lyrics";

/** Desktop and tablet player: a floating island under the content. */
export function PlayerBar() {
  const track = usePlayer(selectCurrent);
  const statusText = useStatusText();
  const t = useT();
  const status = usePlayer((s) => s.status);
  const panelOpen = useUi((s) => s.panelOpen || s.drawerOpen);
  const storeTab = useUi((s) => s.panelTab);
  // On the lyrics page the panel hides its Lyrics tab and shows Playing instead.
  const panelTab = useLyricsNavigation().atLyrics && storeTab === "lyrics" ? "playing" : storeTab;
  const togglePanel = useUi((s) => s.togglePanel);
  const setShortcutsOpen = useUi((s) => s.setShortcutsOpen);

  return (
    <div className="island shrink-0">
      <div className="island-core grid h-[84px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-3 lg:px-4">
        <div className="flex min-w-0 items-center gap-3">
          {track ? (
            <>
              <button
                type="button"
                onClick={() => togglePanel("playing")}
                aria-label={t.player.showNowPlaying}
                className="group relative shrink-0 rounded-[10px] transition-transform active:scale-[0.96]"
              >
                <Artwork src={track.thumb} className="size-14 rounded-[10px]" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{track.title}</p>
                <p className={cn("truncate text-[13px]", status === "error" ? "text-danger" : "text-fg-2")}>
                  {statusText ?? track.artist}
                </p>
              </div>
              <FavoriteButton track={track} size="sm" />
            </>
          ) : (
            <p className="truncate pl-1 text-sm text-fg-3">{t.player.nothingPlaying}</p>
          )}
        </div>

        <div className="flex w-[min(44vw,560px)] flex-col items-center gap-1">
          <Transport />
          <Scrubber className="w-full" />
        </div>

        <div className="flex items-center justify-end gap-1">
          <ModeSwitch className="max-2xl:hidden" />
          <LyricsButton />
          <IconButton
            label={t.player.queue}
            size="sm"
            active={panelOpen && panelTab === "queue"}
            onClick={() => togglePanel("queue")}
          >
            <QueueIcon size={18} />
          </IconButton>
          <IconButton
            label={t.player.nowPlayingPanel}
            size="sm"
            active={panelOpen && panelTab === "playing"}
            onClick={() => togglePanel("playing")}
          >
            <SidebarSimpleIcon size={18} mirrored />
          </IconButton>
          <Volume className="max-lg:hidden" />
          <IconButton label={t.player.shortcuts} size="sm" onClick={() => setShortcutsOpen(true)} className="max-xl:hidden">
            <KeyboardIcon size={18} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
