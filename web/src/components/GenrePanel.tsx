import { Link } from "react-router";
import { useRemote, type Remote } from "../hooks/useRemote";
import { useI18n, useT } from "../i18n";
import { api } from "../lib/api";
import { paths } from "../lib/routes";
import type { Genre } from "../lib/types";

/** A chip row for a genre or mood list; both open the same way (`GENRE_ID`-shaped params on the same page). */
function ChipRow({ label, list }: { label: string; list: Remote<Genre[]> & { retry: () => void } }) {
  const t = useT();
  return (
    <div>
      <p className="mb-2.5 px-1 text-xs font-medium text-fg-2">{label}</p>
      {list.status === "loading" && (
        <div aria-label={t.common.loading} className="flex flex-wrap gap-2">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="skeleton h-9 rounded-full" style={{ width: `${64 + ((i * 23) % 56)}px` }} />
          ))}
        </div>
      )}
      {list.status === "error" && (
        <p className="px-1 text-sm text-fg-2">
          {list.message}{" "}
          <button type="button" onClick={list.retry} className="font-medium text-fg underline-offset-2 hover:underline">
            {t.common.retry}
          </button>
        </p>
      )}
      {list.status === "ok" && (
        <ul className="flex flex-wrap gap-2">
          {list.data.map((g) => (
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

/** YouTube Music's genre and mood lists as chips; each opens the same way (artists and songs for that id). */
export function GenrePanel({ id }: { id: string }) {
  const lang = useI18n((s) => s.lang);
  const t = useT();
  // Both come from YouTube Music in the app language, so each language has its own lists.
  const moods = useRemote<Genre[]>(`moods:${lang}`, () => api.moods());
  const genres = useRemote<Genre[]>(`genres:${lang}`, () => api.genres());

  return (
    <div id={id} className="flex flex-col gap-4 rounded-[16px] bg-surface-2 p-3 ring-1 ring-line">
      <ChipRow label={t.search.exploreMoods} list={moods} />
      <ChipRow label={t.search.exploreGenres} list={genres} />
    </div>
  );
}
