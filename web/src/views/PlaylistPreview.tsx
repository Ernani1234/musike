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
import type { PlaylistPreview as PlaylistPreviewPage } from "../lib/types";
import { usePlayer } from "../player/player";
import { useLibrary } from "../stores/library";

/** A curated playlist from the home feed or charts: play it whole, shuffle it or save it into the library. */
export default function PlaylistPreview() {
  const { id = "" } = useParams();
  const location = useLocation();
  const lang = useI18n((s) => s.lang);
  const t = useT();
  const page = useRemote<PlaylistPreviewPage>(`browse-playlist:${lang}:${id}`, (signal) => api.browsePlaylist(id, signal));
  const playList = usePlayer((s) => s.playList);
  const toggle = usePlayer((s) => s.toggle);
  const queue = usePlayer((s) => s.queue);
  const status = usePlayer((s) => s.status);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const playlist = page.status === "ok" ? page.data : null;
  const tracks = playlist?.tracks ?? [];
  const title = playlist?.title || (location.state as { name?: string } | null)?.name || t.playlistPreview.fallbackName;
  const isThisPlaying = tracks.length > 0 && queue.length === tracks.length && queue.every((q, i) => q.id === tracks[i]?.id);
  const playing = isThisPlaying && (status === "playing" || status === "loading");

  const save = async () => {
    if (!playlist) return;
    setSaving(true);
    const p = await createPlaylist(playlist.title, tracks);
    setSaving(false);
    if (p) setSaved(p.id);
  };

  return (
    <div className="pb-8">
      <PageHeader title={title} actions={<BackButton fallback={paths.home} />} />

      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-20 h-72 bg-linear-to-b from-accent-soft to-transparent" />
        <div className="relative flex flex-col items-center gap-5 px-4 pt-2 pb-6 md:flex-row md:items-end md:gap-6 md:px-6 md:pt-6">
          {playlist ? (
            <Artwork
              src={playlist.art}
              fallback={playlist.thumb}
              iconSize={64}
              className="size-44 shrink-0 rounded-[18px] shadow-[0_24px_60px_rgb(0_0_0/0.4)] md:size-52"
            />
          ) : (
            <span className="skeleton size-44 shrink-0 rounded-[18px] md:size-52" />
          )}
          <div className="flex min-w-0 flex-col items-center gap-2 text-center md:items-start md:text-left">
            <h1 className="max-w-full text-[28px] leading-[1.1] font-bold tracking-tight break-words md:text-5xl">{title}</h1>
            {playlist?.subtitle && <p className="font-mono text-[13px] text-fg-2">{playlist.subtitle}</p>}
          </div>
        </div>
      </div>

      {playlist && tracks.length > 0 && (
        <div className="flex items-center gap-2 px-4 pb-4 md:px-6">
          <PlayDisc
            label={playing ? t.common.pause : t.album.play(playlist.title)}
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
          title={t.playlistPreview.openFailed}
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

      {playlist &&
        (tracks.length ? (
          <SelectableTrackList key={id} tracks={tracks} numbered />
        ) : (
          <EmptyState icon={<MusicNotesIcon size={28} />} title={t.playlistPreview.noTracks} body={t.playlistPreview.noTracksBody} />
        ))}
    </div>
  );
}
