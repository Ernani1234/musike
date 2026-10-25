import { Link } from "react-router";
import { useRemote } from "../hooks/useRemote";
import { useI18n, useT } from "../i18n";
import { api } from "../lib/api";
import { paths } from "../lib/routes";
import type { Genre } from "../lib/types";

/** YouTube Music's genre list as chips; each opens the genre's artists and songs. */
export function GenrePanel({ id }: { id: string }) {
  const lang = useI18n((s) => s.lang);
  const t = useT();
  // Genre names come from YouTube Music in the app language, so each language has its own list.
  const genres = useRemote<Genre[]>(`genres:${lang}`, () => api.genres());

  return (
    <div id={id} className="rounded-[1rem] bg-surface-2 p-3 ring-1 ring-line">
      <p className="mb-2.5 px-1 text-xs font-medium text-fg-2">{t.search.exploreGenres}</p>

      {genres.status === "loading" && (
        <div aria-label={t.common.loading} className="flex flex-wrap gap-2">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} className="skeleton h-9 rounded-full" style={{ width: `${64 + ((i * 23) % 56)}px` }} />
          ))}
        </div>
      )}

      {genres.status === "error" && (
        <p className="px-1 text-sm text-fg-2">
          {genres.message}{" "}
          <button type="button" onClick={genres.retry} className="font-medium text-fg underline-offset-2 hover:underline">
            {t.common.retry}
          </button>
        </p>
      )}

      {genres.status === "ok" && (
        <ul className="flex flex-wrap gap-2">
          {genres.data.map((g) => (
            <li key={g.id}>
              <Link
                to={paths.genre(g.id)}
                state={{ name: g.name }}
                className="block h-9 rounded-full bg-surface-3 px-4 text-sm leading-9 transition-colors hover:bg-surface-4"
              >
                {g.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
