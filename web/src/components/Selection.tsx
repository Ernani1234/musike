import { CheckIcon, HeartIcon, PlayIcon, PlaylistIcon, VideoCameraIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { cn, formatTime } from "../lib/format";
import type { Track } from "../lib/types";
import { selectCurrent, usePlayer } from "../player/player";
import { useLibrary } from "../stores/library";
import { useUi } from "../stores/ui";
import { Artwork } from "./Artwork";
import { Equalizer } from "./Brand";

export function Check({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-md ring-1 transition-colors",
        on ? "bg-accent text-accent-ink ring-accent" : "ring-line-strong",
      )}
    >
      {on && <CheckIcon size={15} weight="bold" />}
    </span>
  );
}

function Action({
  icon,
  label,
  phoneLabel,
  onClick,
  disabled,
  primary,
}: {
  icon: ReactNode;
  label: string;
  phoneLabel?: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium whitespace-nowrap transition-transform active:scale-[0.97] disabled:opacity-40 sm:px-3.5",
        primary ? "bg-accent text-accent-ink" : "bg-surface-3 text-fg hover:bg-surface-4",
      )}
    >
      {icon}
      {/* Phones keep only "Play"; the icons are familiar enough for the rest. */}
      {primary ? <Short phone={phoneLabel ?? label} wide={label} /> : <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

/** Phones get the short text, so the bar keeps its buttons on one line at 320 px. */
export function Short({ phone, wide }: { phone: ReactNode; wide: ReactNode }) {
  return (
    <>
      <span className="sm:hidden">{phone}</span>
      <span className="hidden sm:inline">{wide}</span>
    </>
  );
}

/** "3 of 150 songs", or "3 of 150" on phones. */
export function SelectedCount({ n, total }: { n: number; total: number }) {
  const t = useT();
  return <Short phone={t.selection.countShort(n, total)} wide={t.selection.count(n, total)} />;
}

/**
 * Sticky bar under the page header: select all, then play, favorite or add the selection to a playlist.
 * With nothing selected, "Play all" plays every track.
 */
export function SelectionBar({
  chosen,
  all,
  allSelected,
  onToggleAll,
  label,
  className,
}: {
  chosen: Track[];
  all: Track[];
  allSelected: boolean;
  onToggleAll: () => void;
  label: ReactNode;
  className?: string;
}) {
  const playList = usePlayer((s) => s.playList);
  const addFavorites = useLibrary((s) => s.addFavorites);
  const openAddToPlaylist = useUi((s) => s.openAddToPlaylist);
  const toPlay = chosen.length ? chosen : all;
  const t = useT();

  return (
    <div
      className={cn(
        "sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-[5] border-b border-line bg-bg/80 px-4 py-2.5 backdrop-blur-xl md:top-16 md:bg-surface-1/80 md:px-6",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={allSelected}
          disabled={!all.length}
          onClick={onToggleAll}
          className="flex h-9 min-w-0 items-center gap-2 rounded-full pr-1 pl-1.5 text-sm font-medium text-fg-2 hover:text-fg disabled:opacity-40 sm:pr-3"
        >
          <Check on={allSelected} />
          <span className="truncate">{label}</span>
        </button>
        <span className="flex-1" />
        <Action
          primary
          icon={<PlayIcon size={16} weight="fill" />}
          label={chosen.length ? t.common.play : t.common.playAll}
          phoneLabel={t.common.play}
          disabled={!toPlay.length}
          onClick={() => playList(toPlay, 0)}
        />
        <Action icon={<HeartIcon size={16} />} label={t.common.favorite} disabled={!chosen.length} onClick={() => void addFavorites(chosen)} />
        <Action icon={<PlaylistIcon size={16} />} label={t.common.playlist} disabled={!chosen.length} onClick={() => openAddToPlaylist(chosen)} />
      </div>
    </div>
  );
}

/**
 * A track row with a checkbox. The artwork plays; the title toggles the selection,
 * so picking many songs is a run of taps on the text.
 */
export function SelectableRow({
  track,
  selected,
  onToggle,
  onPlay,
  position,
  note,
  trailing,
}: {
  track: Track;
  selected: boolean;
  onToggle: () => void;
  onPlay: () => void;
  position?: number;
  /** Extra context after the artist, e.g. what was searched. */
  note?: ReactNode;
  trailing?: ReactNode;
}) {
  const isCurrent = usePlayer((s) => selectCurrent(s)?.id === track.id);
  const isPlaying = usePlayer((s) => s.status === "playing" || s.status === "loading");
  const isFavorite = useLibrary((s) => s.favorites.some((f) => f.id === track.id));
  const t = useT();

  return (
    <div className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-2 md:px-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={t.selection.select(track.title)}
        onClick={onToggle}
        className="-m-2 p-2"
      >
        <Check on={selected} />
      </button>

      {position !== undefined && (
        <span className="hidden w-6 shrink-0 text-center font-mono text-[0.8125rem] text-fg-3 tabular-nums md:block">{position}</span>
      )}

      <button type="button" onClick={onPlay} aria-label={t.common.playX(track.title)} className="group/art relative shrink-0">
        <Artwork src={track.thumb} className="size-11 rounded-[0.625rem]" />
        <span
          className={cn(
            "absolute inset-0 grid place-items-center rounded-[0.625rem] bg-black/45 text-white transition-opacity",
            isCurrent ? "opacity-100" : "opacity-0 group-hover/art:opacity-100 group-focus-visible/art:opacity-100",
          )}
        >
          {isCurrent ? <Equalizer live={isPlaying} /> : <PlayIcon size={18} weight="fill" />}
        </span>
      </button>

      <button type="button" onClick={onToggle} className={cn("min-w-0 flex-1 text-left", !selected && "opacity-60")}>
        <span className={cn("block truncate text-[0.9375rem] leading-tight font-medium", isCurrent && "text-accent-text")}>{track.title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem] text-fg-2">
          {track.kind === "video" && <VideoCameraIcon size={13} className="shrink-0 text-fg-3" aria-label={t.common.video} />}
          <span className="truncate">
            {track.artist || t.common.youtube}
            {note}
          </span>
        </span>
      </button>

      {isFavorite && <HeartIcon size={15} weight="fill" className="shrink-0 text-accent-text" aria-label={t.common.inFavorites} />}

      <span className="hidden w-11 shrink-0 text-right font-mono text-[0.8125rem] text-fg-3 tabular-nums md:block">
        {track.duration ? formatTime(track.duration) : ""}
      </span>

      {trailing}
    </div>
  );
}

/** A plain list of tracks to pick from, with its own selection bar. Remount (via `key`) to reset the selection. */
export function SelectableTrackList({ tracks, numbered }: { tracks: Track[]; numbered?: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const playList = usePlayer((s) => s.playList);
  const chosen = tracks.filter((t) => selected.has(t.id));
  const allSelected = tracks.length > 0 && chosen.length === tracks.length;
  const t = useT();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <>
      <SelectionBar
        chosen={chosen}
        all={tracks}
        allSelected={allSelected}
        onToggleAll={() => setSelected(allSelected ? new Set() : new Set(tracks.map((t) => t.id)))}
        label={chosen.length ? <SelectedCount n={chosen.length} total={tracks.length} /> : <Short phone={t.selection.all} wide={t.selection.selectAll} />}
      />
      <ul className="mt-2 flex flex-col px-2 md:px-3">
        {tracks.map((t, i) => (
          <li key={t.id}>
            <SelectableRow
              track={t}
              position={numbered ? i + 1 : undefined}
              selected={selected.has(t.id)}
              onToggle={() => toggle(t.id)}
              onPlay={() => playList(tracks, i)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
