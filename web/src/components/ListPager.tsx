import { useT } from "../i18n";
import { ROWS_PER_PAGE } from "../hooks/useListPage";

export function ListPager({ start, end, total, previous, next }: {
  start: number; end: number; total: number; previous: () => void; next: () => void;
}) {
  const t = useT();
  if (total <= ROWS_PER_PAGE) return null;
  return <div className="flex flex-wrap items-center justify-center gap-3 py-4">
    <button type="button" className="button-secondary disabled:opacity-40" disabled={start === 0} onClick={previous}>
      {t.trackList.previous}
    </button>
    <span className="text-sm text-fg-2" role="status">{t.trackList.pageRange(start + 1, end, total)}</span>
    <button type="button" className="button-secondary disabled:opacity-40" disabled={end >= total} onClick={next}>
      {t.trackList.next}
    </button>
  </div>;
}
