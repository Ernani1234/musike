import type { MouseEvent } from "react";
import { Link } from "react-router";
import { useT } from "../i18n";
import { cn } from "../lib/format";
import { paths } from "../lib/routes";
import type { Track } from "../lib/types";

interface Props {
  track: Track;
  className?: string;
  /** Take the place of the current history entry (the phone's Now Playing sheet, so Back doesn't reopen it). */
  replace?: boolean;
}

/** A track's artist line: a link to the artist's page when YouTube Music says who they are, plain text otherwise. */
export function ArtistLink({ track, className, replace }: Props) {
  const t = useT();
  const label = track.artist || t.common.youtube;
  if (!track.artistId) return <span className={className}>{label}</span>;
  // With several credited artists the ID may belong to any of them, so only a single name is a safe placeholder.
  const name = track.artist.includes(",") ? undefined : track.artist;
  return (
    <Link
      to={paths.artist(track.artistId)}
      state={name ? { name } : undefined}
      replace={replace}
      // Rows play on click; following the link must not also start the track.
      onClick={(e: MouseEvent) => e.stopPropagation()}
      className={cn("hover:text-fg hover:underline focus-visible:underline", className)}
    >
      {label}
    </Link>
  );
}
