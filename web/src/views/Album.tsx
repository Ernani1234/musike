import { ArrowRightIcon, MusicNotesIcon, PauseIcon, PlayIcon, PlaylistIcon, ShuffleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { Artwork } from "../components/Artwork";
import { IconButton, PlayDisc } from "../components/IconButton";
import { BackButton, EmptyState, PageHeader } from "../components/Page";
import { SelectableTrackList } from "../components/Selection";
import { TrackListSkeleton } from "../components/TrackList";
import { useRemote } from "../hooks/useRemote";
import { useI18n, useT } from "../i18n";
import { api } from "../lib/api";
import { shuffled } from "../lib/format";
import { paths } from "../lib/routes";
import type { AlbumPage } from "../lib/types";
import { usePlayer } from "../player/player";
import { useLibrary } from "../stores/library";

/** An album, its tracks in their original order: play it whole, shuffle it, save it or pick from it. */
export default function Album() {
  const { id = "" } = useParams();
  const location = useLocation();
  const lang = useI18n((s) => s.lang);
  const t = useT();
  const page = useRemote<AlbumPage>(`album:${lang}:${id}`, (signal) => api.album(id, signal));
  const playList = usePlayer((s) => s.playList);
  const toggle = usePlayer((s) => s.toggle);
  const queue = usePlayer((s) => s.queue);
  const status = usePlayer((s) => s.status);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const album = page.status === "ok" ? page.data : null;
  const tracks = album?.tracks ?? [];
  const title = album?.title || (location.state as { name?: string } | null)?.name || t.album.fallbackName;
  // The queue holds exactly this album: the big button pauses and resumes instead of starting over.
  const isThisPlaying = tracks.length > 0 && queue.length === tracks.length && queue.every((q, i) => q.id === tracks[i]?.id);
  const playing = isThisPlaying && (status === "playing" || status === "loading");

  const save = async () => {
    if (!album) return;
    setSaving(true);
    const p = await createPlaylist(album.artist ? `${album.title} · ${album.artist}` : album.title, tracks);
    setSaving(false);
    if (p) setSaved(p.id);
  };

  return (
    <div className="pb-8">
      <PageHeader title={title} actions={<BackButton fallback={paths.search} />} />

      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-20 h-72 bg-linear-to-b from-accent-soft to-transparent" />
        <div className="relative flex flex-col items-center gap-5 px-4 pt-2 pb-6 md:flex-row md:items-end md:gap-6 md:px-6 md:pt-6">
          {album ? (
            <Artwork
              src={album.art}
              fallback={album.thumb}
              iconSize={64}
              className="size-44 shrink-0 rounded-[1.125rem] shadow-[0_24px_60px_rgb(0_0_0/0.4)] md:size-52"
            />
          ) : (
            <span className="skeleton size-44 shrink-0 rounded-[1.125rem] md:size-52" />
          )}
          <div className="flex min-w-0 flex-col items-center gap-2 text-center md:items-start md:text-left">
            {album?.kind && <span className="text-xs font-medium text-fg-2">{album.kind}</span>}
            <h1 className="max-w-full text-[1.75rem] leading-[1.1] font-bold tracking-tight break-words md:text-5xl">{title}</h1>
            {album?.artist &&
              (album.artistId ? (
                <Link to={paths.artist(album.artistId)} state={{ name: album.artist }} className="font-medium hover:underline">
                  {album.artist}
                </Link>
              ) : (
                <span className="font-medium">{album.artist}</span>
              ))}
            {album?.info && <p className="font-mono text-[0.8125rem] text-fg-2">{album.info}</p>}
          </div>
        </div>
      </div>

      {album && tracks.length > 0 && (
        <div className="flex items-center gap-2 px-4 pb-4 md:px-6">
          <PlayDisc
            label={playing ? t.common.pause : t.album.play(album.title)}
            px={56}
            onClick={() => (isThisPlaying ? toggle() : playList(tracks, 0))}
          >
            {playing ? <PauseIcon size={24} weight="fill" /> : <PlayIcon size={24} weight="fill" />}
          </PlayDisc>
          <IconButton label={t.album.shuffle} size="lg" onClick={() => playList(shuffled(tracks), 0)}>
            <ShuffleIcon size={24} />
          </IconButton>
          {saved ? (
            <Link
              to={paths.playlist(saved)}
              className="ml-1 flex h-11 items-center gap-2 rounded-full bg-accent-soft px-4 text-sm font-medium text-accent-text"
            >
              {t.album.openPlaylist} <ArrowRightIcon size={16} />
            </Link>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="ml-1 flex h-11 items-center gap-2 rounded-full bg-surface-3 px-4 text-sm font-medium transition-transform hover:bg-surface-4 active:scale-[0.97] disabled:opacity-60"
            >
              <PlaylistIcon size={18} /> {t.album.saveAsPlaylist}
            </button>
          )}
        </div>
      )}

      {page.status === "loading" && <TrackListSkeleton />}

      {page.status === "error" && (
        <EmptyState
          icon={<WarningCircleIcon size={28} />}
          title={t.album.openFailed}
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

      {album &&
        (tracks.length ? (
          <SelectableTrackList key={id} tracks={tracks} numbered />
        ) : (
          <EmptyState icon={<MusicNotesIcon size={28} />} title={t.album.noTracks} body={t.album.noTracksBody} />
        ))}
    </div>
  );
}
