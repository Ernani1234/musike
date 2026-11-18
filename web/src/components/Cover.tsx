import { ClockCounterClockwiseIcon, HeartIcon } from "@phosphor-icons/react";
import { cn } from "../lib/format";
import type { Track } from "../lib/types";
import { Artwork } from "./Artwork";

export type CoverKind = "playlist" | "favorites" | "history";

/** Playlist cover: a 2x2 mosaic from the first distinct covers, or a single cover / icon tile. */
export function Cover({ kind, tracks, className, iconSize = 40 }: { kind: CoverKind; tracks: Track[]; className?: string; iconSize?: number }) {
  if (kind === "favorites") {
    return (
      <span className={cn("grid place-items-center bg-accent text-accent-ink", className)}>
        <HeartIcon size={iconSize} weight="fill" />
      </span>
    );
  }
  if (kind === "history") {
    return (
      <span className={cn("grid place-items-center bg-surface-4 text-fg", className)}>
        <ClockCounterClockwiseIcon size={iconSize} />
      </span>
    );
  }
  const arts: Track[] = [];
  const seen = new Set<string>();
  for (const track of tracks) {
    if (seen.has(track.thumb)) continue;
    seen.add(track.thumb);
    arts.push(track);
    if (arts.length === 4) break;
  }
  if (arts.length < 4) {
    return <Artwork src={arts[0]?.art} fallback={arts[0]?.thumb} className={className} iconSize={iconSize} />;
  }
  return (
    <span className={cn("grid grid-cols-2 grid-rows-2 overflow-hidden", className)}>
      {arts.map((t) => (
        <Artwork key={t.id} src={t.thumb} className="size-full" />
      ))}
    </span>
  );
}
