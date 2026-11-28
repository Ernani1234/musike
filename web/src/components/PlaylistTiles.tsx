import { Link } from "react-router";
import { paths } from "../lib/routes";
import type { PlaylistCard } from "../lib/types";
import { Artwork } from "./Artwork";

/** A curated playlist's cover with its title; opens the read-only preview. Mirrors AlbumTile's look. */
export function PlaylistTile({ playlist }: { playlist: PlaylistCard }) {
  return (
    <Link to={paths.browsePlaylist(playlist.id)} state={{ name: playlist.title }} className="group flex flex-col gap-2">
      <span className="block overflow-hidden rounded-[14px]">
        <Artwork
          src={playlist.art}
          fallback={playlist.thumb}
          className="aspect-square w-full transition-transform duration-300 ease-out-expo group-hover:scale-[1.04]"
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{playlist.title}</span>
        {playlist.subtitle && <span className="block truncate text-xs text-fg-2">{playlist.subtitle}</span>}
      </span>
    </Link>
  );
}

/** A titled, horizontally scrolling row of curated playlists (home feed, charts). */
export function PlaylistRow({ title, playlists }: { title: string; playlists: PlaylistCard[] }) {
  return (
    <section className="flex flex-col gap-3 pt-6">
      <h2 className="px-4 text-xl font-semibold tracking-tight md:px-6">{title}</h2>
      <ul className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 md:scroll-px-6 md:px-6">
        {playlists.map((p) => (
          <li key={p.id} className="w-36 shrink-0 snap-start md:w-44">
            <PlaylistTile playlist={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}
