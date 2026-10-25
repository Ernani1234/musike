import { Link } from "react-router";
import { cn } from "../lib/format";
import { paths } from "../lib/routes";
import type { AlbumCard } from "../lib/types";
import { Artwork } from "./Artwork";

/** An album cover with its title; opens the album. */
export function AlbumTile({ album, className }: { album: AlbumCard; className?: string }) {
  const sub = [album.artist, album.year].filter(Boolean).join(" · ");
  return (
    <Link to={paths.album(album.id)} state={{ name: album.title }} className={cn("group flex flex-col gap-2", className)}>
      <span className="block overflow-hidden rounded-[0.875rem]">
        <Artwork
          src={album.art}
          fallback={album.thumb}
          className="aspect-square w-full transition-transform duration-300 ease-out-expo group-hover:scale-[1.04]"
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{album.title}</span>
        {sub && <span className="block truncate text-xs text-fg-2">{sub}</span>}
      </span>
    </Link>
  );
}

/** A titled, horizontally scrolling row of albums (an artist's albums or singles). */
export function AlbumRow({ title, albums }: { title: string; albums: AlbumCard[] }) {
  return (
    <section className="flex flex-col gap-3 pt-6">
      <h2 className="px-4 text-xl font-semibold tracking-tight md:px-6">{title}</h2>
      <ul className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 md:scroll-px-6 md:px-6">
        {albums.map((a) => (
          <li key={a.id} className="w-36 shrink-0 snap-start md:w-44">
            <AlbumTile album={a} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Albums as a responsive grid (search results). */
export function AlbumGrid({ albums }: { albums: AlbumCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-2 sm:grid-cols-3 md:px-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {albums.map((a) => (
        <li key={a.id}>
          <AlbumTile album={a} />
        </li>
      ))}
    </ul>
  );
}
