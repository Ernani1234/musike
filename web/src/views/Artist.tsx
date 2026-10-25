import { MusicNotesIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useLocation, useParams } from "react-router";
import { AlbumRow } from "../components/AlbumTiles";
import { Artwork } from "../components/Artwork";
import { BackButton, EmptyState, PageHeader } from "../components/Page";
import { SelectableTrackList } from "../components/Selection";
import { TrackListSkeleton } from "../components/TrackList";
import { useRemote } from "../hooks/useRemote";
import { useI18n, useT } from "../i18n";
import { api } from "../lib/api";
import { paths } from "../lib/routes";
import { cn } from "../lib/format";
import type { ArtistPage } from "../lib/types";

/** An artist's greatest hits, ready to pick from. */
export default function Artist() {
  const { id = "" } = useParams();
  const location = useLocation();
  const lang = useI18n((s) => s.lang);
  const t = useT();
  // The bio comes from YouTube Music in the app language.
  const page = useRemote<ArtistPage>(`artist:${lang}:${id}`, (signal) => api.artist(id, signal));
  const [fullBio, setFullBio] = useState(false);
  const name = (page.status === "ok" && page.data.name) || (location.state as { name?: string } | null)?.name || t.artist.fallbackName;

  return (
    <div className="pb-8">
      <PageHeader title={name} actions={<BackButton fallback={paths.search} />} />

      <div className="relative mx-4 overflow-hidden rounded-[1.25rem] bg-surface-2 ring-1 ring-line md:mx-6">
        {page.status === "ok" && page.data.banner && (
          <div className="absolute inset-0">
            <Artwork src={page.data.banner} className="size-full" />
          </div>
        )}
        {page.status === "loading" && <div className="skeleton absolute inset-0" />}
        <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/80 via-black/25 to-transparent" />
        <div className="relative flex min-h-44 flex-col justify-end gap-1 p-5 md:min-h-60 md:p-8">
          <span className="text-xs font-medium text-white/75">{t.artist.label}</span>
          <h1 className="text-[1.75rem] leading-[1.1] font-bold tracking-tight break-words text-white md:text-5xl">{name}</h1>
        </div>
      </div>

      {page.status === "ok" && page.data.description && (
        <button
          type="button"
          onClick={() => setFullBio((v) => !v)}
          aria-expanded={fullBio}
          className={cn("mx-4 mt-4 max-w-[75ch] text-left text-sm text-fg-2 hover:text-fg md:mx-6", !fullBio && "line-clamp-3")}
        >
          {page.data.description}
        </button>
      )}

      {page.status === "ok" && page.data.albums.length > 0 && <AlbumRow title={t.artist.albums} albums={page.data.albums} />}
      {page.status === "ok" && page.data.singles.length > 0 && <AlbumRow title={t.artist.singles} albums={page.data.singles} />}

      <h2 className="px-4 pt-6 pb-1 text-xl font-semibold tracking-tight md:px-6">{t.artist.hits}</h2>

      {page.status === "loading" && <TrackListSkeleton />}

      {page.status === "error" && (
        <EmptyState
          icon={<WarningCircleIcon size={28} />}
          title={t.artist.openFailed}
          body={page.message}
          action={
            <button
              type="button"
              onClick={page.retry}
              className="mt-2 h-11 rounded-full bg-surface-3 px-6 text-sm font-medium hover:bg-surface-4"
            >
              {t.common.retry}
            </button>
          }
        />
      )}

      {page.status === "ok" &&
        (page.data.tracks.length ? (
          <SelectableTrackList key={id} tracks={page.data.tracks} numbered />
        ) : (
          <EmptyState icon={<MusicNotesIcon size={28} />} title={t.artist.noHits} body={t.artist.noHitsBody} />
        ))}
    </div>
  );
}
