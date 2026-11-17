import { Link } from "react-router";
import { paths } from "../lib/routes";
import type { ArtistCard } from "../lib/types";
import { Artwork } from "./Artwork";

/** Artists as a responsive grid of round photos (search results); each opens the artist's page. */
export function ArtistGrid({ artists }: { artists: ArtistCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-2 sm:grid-cols-3 md:px-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {artists.map((a) => (
        <li key={a.id}>
          <Link to={paths.artist(a.id)} state={{ name: a.name }} className="group flex flex-col items-center gap-2 text-center">
            <span className="block w-full overflow-hidden rounded-full">
              <Artwork
                src={a.art}
                fallback={a.thumb}
                className="aspect-square w-full rounded-full transition-transform duration-300 ease-out-expo group-hover:scale-[1.04]"
              />
            </span>
            <span className="w-full min-w-0">
              <span className="block truncate text-sm font-semibold">{a.name}</span>
              {a.info && <span className="block truncate text-xs text-fg-2">{a.info}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
