import { Link } from "react-router";
import { paths } from "../lib/routes";
import type { GenreArtist } from "../lib/types";
import { Artwork } from "./Artwork";

/** An artist's cover with their name; opens their page. Same look as a genre's artist grid. */
function ArtistTile({ artist }: { artist: GenreArtist }) {
  return (
    <Link to={paths.artist(artist.id)} state={{ name: artist.name }} className="group flex flex-col gap-2">
      <span className="block overflow-hidden rounded-[14px]">
        <Artwork
          src={artist.art}
          fallback={artist.thumb}
          className="aspect-square w-full transition-transform duration-300 ease-out-expo group-hover:scale-[1.04]"
        />
      </span>
      <span className="block truncate text-sm font-semibold">{artist.name}</span>
    </Link>
  );
}

/** Artists as a responsive grid (a chart's full list, opened from its one Home tile). */
export function ArtistGrid({ artists }: { artists: GenreArtist[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-2 sm:grid-cols-3 md:px-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {artists.map((a) => (
        <li key={a.id}>
          <ArtistTile artist={a} />
        </li>
      ))}
    </ul>
  );
}
