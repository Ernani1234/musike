import { desktop } from "../lib/desktop";
import { cn } from "../lib/format";
import { selectCurrent, usePlayer } from "../player/player";
import { Equalizer, LogoMark } from "./Brand";

/**
 * Title bar for the desktop app. The window is frameless; Windows and Linux draw their native buttons over the
 * right end (the "titlebar area" env variables tell us how much room they take), macOS its traffic lights
 * over the left end.
 */
export function TitleBar() {
  const track = usePlayer(selectCurrent);
  const live = usePlayer((s) => s.status === "playing");

  return (
    <div
      className={cn("app-drag flex shrink-0 items-center gap-2.5 select-none", desktop?.platform === "darwin" ? "pl-[5.25rem]" : "pl-3.5")}
      style={{
        height: "env(titlebar-area-height, 40px)",
        paddingRight: "calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + 12px)",
      }}
    >
      <LogoMark className="size-[1.125rem] shrink-0 text-accent-text" />
      <span className="shrink-0 text-[0.8125rem] font-semibold tracking-tight">musike</span>
      {track && (
        <span className="flex min-w-0 items-center gap-2 pl-2 text-xs text-fg-3">
          <Equalizer live={live} className="h-3 shrink-0" />
          <span className="truncate">
            {track.title}
            {track.artist && <span className="text-fg-3/70"> - {track.artist}</span>}
          </span>
        </span>
      )}
    </div>
  );
}
