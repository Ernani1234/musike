import { MagnifyingGlassIcon, MusicNotesIcon, RadioIcon, VideoCameraSlashIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { Artwork } from "../components/Artwork";
import { FavoriteButton, ModeSwitch, Scrubber, Transport } from "../components/Controls";
import { QueueList } from "../components/Queue";
import { SLOT, VideoSlot } from "../components/Video";
import { useT } from "../i18n";
import { cn, formatTime } from "../lib/format";
import { paths } from "../lib/routes";
import type { Track } from "../lib/types";
import { selectCurrent, usePlayer, useStatusText } from "../player/player";
import { useUi, type PanelTab } from "../stores/ui";

/**
 * What the TV player shows, independent of how it is presented: the docked column on a wide screen and the
 * sheet in a narrow one share these pieces, so the two never drift apart.
 */

/** Cover art (or the live video) with a soft glow of itself behind it. */
function Stage({ track }: { track: Track }) {
  const t = useT();
  const showsVideo = usePlayer((s) => s.mediaKind === "video");
  const aspect = usePlayer((s) => s.videoAspect);
  const note = usePlayer((s) =>
    s.preferVideo ? (s.videoNote ?? (s.statusText === "findingClip" ? s.statusText : null)) : null,
  );

  if (showsVideo) {
    const portrait = aspect < 1;
    return (
      <div className="flex justify-center">
        <VideoSlot
          priority={SLOT.panel}
          expandable
          className={cn("rounded-[1rem]", portrait ? "h-[min(40dvh,26rem)]" : "w-full")}
          style={{ aspectRatio: Math.min(16 / 9, Math.max(9 / 16, aspect)) }}
        />
      </div>
    );
  }
  return (
    <div className="relative mx-auto aspect-square w-[min(100%,26rem,30dvh)]">
      <img
        src={track.thumb}
        alt=""
        aria-hidden="true"
        className="absolute inset-[8%] h-[84%] w-[84%] scale-110 rounded-full object-cover opacity-45 blur-3xl"
      />
      <Artwork
        src={track.art}
        fallback={track.thumb}
        alt={t.nowPlaying.coverOf(track.title)}
        iconSize={56}
        className="relative size-full rounded-[1.125rem] shadow-[0_1.5rem_3.5rem_rgb(0_0_0/0.45)]"
      />
      {note && (
        <span className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-full bg-black/70 px-4 py-2.5 text-center text-[0.9375rem] font-medium text-white backdrop-blur-md">
          <VideoCameraSlashIcon size={18} className="shrink-0" />
          {note === "findingClip" ? t.player.status.findingClip : t.player.noClip}
        </span>
      )}
    </div>
  );
}

function Tab({ id, label, active, onSelect }: { id: PanelTab; label: string; active: boolean; onSelect: (t: PanelTab) => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(id)}
      className={cn(
        "h-[2.75rem] rounded-full px-5 text-[1rem] font-medium transition-colors duration-150",
        active ? "bg-surface-4 text-fg" : "text-fg-2 hover:text-fg",
      )}
    >
      {label}
    </button>
  );
}

function UpNext({ from }: { from: number }) {
  const t = useT();
  const queue = usePlayer((s) => s.queue);
  const jumpTo = usePlayer((s) => s.jumpTo);
  const rows = queue.slice(from + 1, from + 3);
  if (!rows.length) return null;
  return (
    <section className="flex flex-col gap-1">
      <h3 className="px-1 pb-1 text-[0.8125rem] font-semibold tracking-wide text-fg-3 uppercase">{t.queue.upNext}</h3>
      {rows.map((track, k) => (
        <button
          key={`${track.id}-${k}`}
          type="button"
          onClick={() => jumpTo(from + 1 + k)}
          title={t.common.playX(track.title)}
          className="flex h-[3.5rem] items-center gap-3 rounded-[0.75rem] px-1.5 text-left transition-colors duration-150 hover:bg-surface-3"
        >
          <Artwork src={track.thumb} className="size-[2.5rem] shrink-0 rounded-[0.5rem]" iconSize={16} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.9375rem] font-medium">{track.title}</span>
            <span className="block truncate text-[0.8125rem] text-fg-2">{track.artist}</span>
          </span>
          <span className="shrink-0 font-mono text-[0.8125rem] text-fg-3 tabular-nums">
            {track.duration ? formatTime(track.duration) : ""}
          </span>
        </button>
      ))}
    </section>
  );
}

function Player({ track }: { track: Track }) {
  const t = useT();
  const statusText = useStatusText();
  const status = usePlayer((s) => s.status);
  const index = usePlayer((s) => s.index);
  const startRadio = usePlayer((s) => s.startRadio);

  return (
    <div className="flex flex-col gap-4 px-1 pb-2">
      <Stage track={track} />

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[1.375rem] leading-tight font-semibold tracking-tight">{track.title}</h2>
          <p className={cn("truncate text-[0.9375rem]", status === "error" ? "text-danger" : "text-fg-2")}>
            {statusText ?? [track.artist, track.album].filter(Boolean).join(" · ")}
          </p>
        </div>
        <FavoriteButton track={track} size="lg" />
      </div>

      <Scrubber />

      <div className="tv-transport">
        <Transport big disc="4.25rem" icon={28} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <ModeSwitch />
        <button
          type="button"
          onClick={() => void startRadio(track)}
          aria-label={t.nowPlaying.startRadio}
          title={t.nowPlaying.startRadio}
          className="grid size-[2.5rem] shrink-0 place-items-center rounded-full bg-surface-1 text-fg-2 ring-1 ring-line transition-colors hover:bg-surface-3 hover:text-fg"
        >
          <RadioIcon size={19} />
        </button>
      </div>

      <div className="h-px bg-line" />

      <UpNext from={index} />
    </div>
  );
}

function Nothing() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid size-[4.5rem] place-items-center rounded-[1.25rem] bg-surface-3 text-fg-3">
        <MusicNotesIcon size={34} />
      </span>
      <p className="max-w-[24ch] text-[1.0625rem] text-fg-2">{t.nowPlaying.playSomething}</p>
      <button
        type="button"
        onClick={() => navigate(paths.search)}
        className="flex h-[3rem] items-center gap-2 rounded-full bg-accent pr-6 pl-5 font-semibold text-accent-ink transition-transform active:scale-[0.97]"
      >
        <MagnifyingGlassIcon size={20} weight="bold" /> {t.common.searchMusic}
      </button>
    </div>
  );
}
/** The Playing / Queue switch at the top of both presentations. */
export function DockTabs() {
  const t = useT();
  const tab = useUi((s) => s.panelTab);
  // Always docked: switching tabs swaps the body, it never opens the tablet drawer.
  const selectTab = (next: PanelTab) => useUi.setState({ panelTab: next });
  return (
    <div role="tablist" aria-label={t.nowPlaying.title} className="flex shrink-0 items-center gap-1 px-3 pt-3 pb-1">
      <Tab id="playing" label={t.nowPlaying.tabPlaying} active={tab === "playing"} onSelect={selectTab} />
      <Tab id="queue" label={t.nowPlaying.tabQueue} active={tab === "queue"} onSelect={selectTab} />
      <span className="flex-1" />
    </div>
  );
}

/** The body under those tabs: the current track, or the queue. */
export function DockBody() {
  const track = usePlayer(selectCurrent);
  const tab = useUi((s) => s.panelTab);
  return tab === "queue" ? <QueueList /> : track ? <Player track={track} /> : <Nothing />;
}
