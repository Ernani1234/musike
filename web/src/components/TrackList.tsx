import { ClockIcon, DotsThreeIcon, HeartIcon, VideoCameraIcon } from "@phosphor-icons/react";
import { memo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { TOUCH, useMediaQuery } from "../hooks/useMediaQuery";
import { useT } from "../i18n";
import { cn, formatTime } from "../lib/format";
import type { Track } from "../lib/types";
import { selectCurrent, usePlayer } from "../player/player";
import { useAppearance } from "../stores/appearance";
import { useLibrary } from "../stores/library";
import { useUi } from "../stores/ui";
import { Artwork } from "./Artwork";
import { Equalizer } from "./Brand";
import { Check, pressedOn, SelectedCount, SelectionBar, Short } from "./Selection";

interface RowProps {
  track: Track;
  position: number;
  onPlay: () => void;
  playlistId?: string;
  showAlbum: boolean;
  /** Lists you can pick tracks from (see TrackList). */
  selectable?: boolean;
  selected?: boolean;
  /** Something is picked: taps pick instead of playing (and on a touch screen, the checkboxes show). */
  selecting?: boolean;
  onToggle?: () => void;
  /** A touch screen rather than a mouse (see TrackList). */
  touch?: boolean;
}

const TrackRow = memo(function TrackRow({
  track,
  position,
  onPlay,
  playlistId,
  showAlbum,
  selectable,
  selected,
  selecting,
  onToggle,
  touch,
}: RowProps) {
  const isCurrent = usePlayer((s) => selectCurrent(s)?.id === track.id);
  const isPlaying = usePlayer((s) => s.status === "playing" || s.status === "loading");
  const isFavorite = useLibrary((s) => s.favorites.some((t) => t.id === track.id));
  const toggleFavorite = useLibrary((s) => s.toggleFavorite);
  const openMenu = useUi((s) => s.openMenu);
  const art = useRef<HTMLDivElement>(null);
  const t = useT();
  const checks = !!(selectable && (selecting || !touch));

  const menuAt = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const fromButton = e.type === "click";
    openMenu({
      track,
      playlistId,
      x: fromButton ? r.right - 256 : e.clientX,
      y: fromButton ? r.bottom + 6 : e.clientY,
      select: touch && selectable && onToggle ? { selected: !!selected, toggle: onToggle } : undefined,
    });
  };

  return (
    <li
      onContextMenu={(e) => {
        // On a touch screen, in a list you can pick from, a long press on the artwork picks the track; anywhere else
        // it opens the menu, which has "Select" too. A right click always opens the menu.
        if (touch && selectable && onToggle && pressedOn(art.current, e)) {
          e.preventDefault();
          onToggle();
          return;
        }
        menuAt(e);
      }}
      className={cn(
        "group relative grid items-center gap-3 rounded-xl px-2 py-1.5 transition-colors duration-150 select-none hover:bg-surface-2 md:px-3 [-webkit-touch-callout:none]",
        checks
          ? showAlbum
            ? "grid-cols-[auto_auto_1fr_auto] md:grid-cols-[auto_28px_auto_1fr_auto_auto] lg:grid-cols-[auto_28px_auto_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]"
            : "grid-cols-[auto_auto_1fr_auto] md:grid-cols-[auto_28px_auto_1fr_auto_auto]"
          : showAlbum
            ? "grid-cols-[auto_1fr_auto] md:grid-cols-[28px_auto_1fr_auto_auto] lg:grid-cols-[28px_auto_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]"
            : "grid-cols-[auto_1fr_auto] md:grid-cols-[28px_auto_1fr_auto_auto]",
      )}
    >
      <button
        type="button"
        onClick={selecting && onToggle ? onToggle : onPlay}
        aria-label={t.common.playX(track.title)}
        className="absolute inset-0 rounded-xl focus-visible:outline-offset-[-2px]"
      />

      {checks && (
        <button
          type="button"
          role="checkbox"
          aria-checked={!!selected}
          aria-label={t.selection.select(track.title)}
          onClick={onToggle}
          className="relative z-10 -my-1.5 -ml-2 flex h-14 w-10 items-center justify-center"
        >
          <Check on={!!selected} />
        </button>
      )}

      <span className="pointer-events-none hidden justify-center font-mono text-[13px] text-fg-3 tabular-nums md:flex">
        {isCurrent ? <Equalizer live={isPlaying} /> : position + 1}
      </span>

      <div ref={art} className="pointer-events-none relative">
        <Artwork src={track.thumb} className="size-11 rounded-[10px]" />
        {isCurrent && (
          <span className="absolute inset-0 grid place-items-center rounded-[10px] bg-black/45 md:hidden">
            <Equalizer live={isPlaying} />
          </span>
        )}
      </div>

      <div className="pointer-events-none min-w-0">
        <p className={cn("truncate text-[15px] leading-tight font-medium", isCurrent ? "text-accent-text" : "text-fg")}>
          {track.title}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-fg-2">
          {track.kind === "video" && <VideoCameraIcon size={13} className="shrink-0 text-fg-3" aria-label={t.common.video} />}
          <span className="truncate">{track.artist || t.common.youtube}</span>
        </p>
      </div>

      {showAlbum && <p className="pointer-events-none hidden truncate text-sm text-fg-2 lg:block">{track.album ?? ""}</p>}

      <div className="relative z-10 hidden items-center gap-1 md:flex">
        <button
          type="button"
          onClick={() => void toggleFavorite(track)}
          aria-label={isFavorite ? t.common.removeFromFavorites : t.common.addToFavorites}
          title={isFavorite ? t.common.removeFromFavorites : t.common.addToFavorites}
          className={cn(
            "grid size-8 place-items-center rounded-full transition-[opacity,transform] active:scale-90",
            isFavorite ? "text-accent-text" : "text-fg-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-fg",
          )}
        >
          <HeartIcon size={17} weight={isFavorite ? "fill" : "regular"} />
        </button>
        <span className="pointer-events-none w-11 text-right font-mono text-[13px] text-fg-3 tabular-nums">
          {track.duration ? formatTime(track.duration) : ""}
        </span>
      </div>

      <button
        type="button"
        onClick={menuAt}
        aria-label={t.trackList.moreFor(track.title)}
        title={t.trackList.more}
        className="relative z-10 grid size-9 place-items-center rounded-full text-fg-2 transition-[opacity,background-color] hover:bg-surface-3 hover:text-fg md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
      >
        <DotsThreeIcon size={22} weight="bold" />
      </button>
    </li>
  );
});

/** Picking tracks from a list (Favorites, your playlists, history): the selection bar's extras. */
export interface ListSelection {
  /** More actions for the picked tracks, e.g. removing them; `done` clears the selection. */
  extra?: (chosen: Track[], done: () => void) => ReactNode;
  /** No "Favorite" action (the Favorites page itself). */
  noFavorite?: boolean;
}

interface ListProps {
  tracks: Track[];
  /** Full list to queue when a row is played, if `tracks` is only a preview of it. */
  context?: Track[];
  playlistId?: string;
  showAlbum?: boolean;
  header?: boolean;
  /**
   * Tracks can be picked, Spotify-style: with nothing picked, tapping a row plays it; while picking, taps pick. With a
   * mouse every row has a checkbox. On a touch screen there are none until something is picked: a long press on the
   * artwork picks a track, and so does "Select" in the row's menu. A selection bar plays, favorites or adds them.
   */
  selection?: ListSelection;
}

export function TrackList({ tracks, context, playlistId, showAlbum: albumWanted = true, header = true, selection }: ListProps) {
  const playList = usePlayer((s) => s.playList);
  const t = useT();
  // Pages ask for the album column where it makes sense; Settings can turn it off everywhere.
  const showAlbum = useAppearance((s) => s.albumColumn) && albumWanted;
  const touch = useMediaQuery(TOUCH);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const chosen = selection ? tracks.filter((x) => picked.has(x.id)) : [];
  const allSelected = tracks.length > 0 && chosen.length === tracks.length;
  const checks = !!selection && (chosen.length > 0 || !touch);
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <div>
      {selection && (
        <SelectionBar
          className="-mx-2 mb-2 md:-mx-3"
          chosen={chosen}
          all={tracks}
          allSelected={allSelected}
          onToggleAll={() => setPicked(allSelected ? new Set() : new Set(tracks.map((x) => x.id)))}
          label={chosen.length ? <SelectedCount n={chosen.length} total={tracks.length} /> : <Short phone={t.selection.all} wide={t.selection.selectAll} />}
          noFavorite={selection.noFavorite}
          extra={selection.extra?.(chosen, () => setPicked(new Set()))}
        />
      )}
      {header && (
        <div
          className={cn(
            "mb-1 hidden items-center gap-3 border-b border-line px-3 pb-2 text-xs font-medium tracking-wide text-fg-3 md:grid",
            checks
              ? showAlbum
                ? "md:grid-cols-[32px_28px_44px_1fr_auto_auto] lg:grid-cols-[32px_28px_44px_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]"
                : "md:grid-cols-[32px_28px_44px_1fr_auto_auto]"
              : showAlbum
                ? "md:grid-cols-[28px_44px_1fr_auto_auto] lg:grid-cols-[28px_44px_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]"
                : "md:grid-cols-[28px_44px_1fr_auto_auto]",
          )}
        >
          {checks && <span />}
          <span className="text-center font-mono">#</span>
          <span />
          <span>{t.trackList.title}</span>
          {showAlbum && <span className="hidden lg:block">{t.trackList.album}</span>}
          <span className="flex w-[84px] justify-end pr-0.5">
            <ClockIcon size={15} aria-label={t.trackList.duration} />
          </span>
          <span className="w-9" />
        </div>
      )}
      <ul className="flex flex-col">
        {tracks.map((t, i) => (
          <TrackRow
            key={`${t.id}-${i}`}
            track={t}
            position={i}
            playlistId={playlistId}
            showAlbum={showAlbum}
            onPlay={() => playList(context ?? tracks, i)}
            selectable={!!selection}
            selected={picked.has(t.id)}
            selecting={chosen.length > 0}
            onToggle={selection ? () => toggle(t.id) : undefined}
            touch={touch}
          />
        ))}
      </ul>
    </div>
  );
}

export function TrackListSkeleton({ rows = 8 }: { rows?: number }) {
  const t = useT();
  return (
    <ul aria-label={t.common.loading} className="flex flex-col gap-1">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-2 py-1.5 md:px-3">
          <span className="hidden w-7 md:block" />
          <span className="skeleton size-11 rounded-[10px]" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="skeleton h-3.5 rounded-full" style={{ width: `${46 + ((i * 17) % 38)}%` }} />
            <span className="skeleton h-3 rounded-full" style={{ width: `${22 + ((i * 11) % 20)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
