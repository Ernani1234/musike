import { DotsThreeIcon, MagnifyingGlassIcon, PauseIcon, PencilSimpleIcon, PlayIcon, ShuffleIcon, TrashIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Cover, type CoverKind } from "../components/Cover";
import { NamePlaylistDialog } from "../components/Dialogs";
import { IconButton, PlayDisc } from "../components/IconButton";
import { Modal } from "../components/Modal";
import { EmptyState, PageHeader } from "../components/Page";
import { TrackList } from "../components/TrackList";
import { useT } from "../i18n";
import { shuffled } from "../lib/format";
import { paths } from "../lib/routes";
import type { Track } from "../lib/types";
import { usePlayer } from "../player/player";
import { useLibrary } from "../stores/library";

interface Props {
  kind: CoverKind;
}
const EMPTY_TRACKS: Track[] = [];

/** Playlist, Favorites and History share one layout. */
export default function Collection({ kind }: Props) {
  const { id } = useParams();
  const navigate = useNavigate();
  const playlist = useLibrary((s) => kind === "playlist" ? s.playlists.find((p) => p.id === id) : undefined);
  const tracks = useLibrary((s) => kind === "favorites" ? s.favorites : kind === "history" ? s.history : playlist?.tracks ?? EMPTY_TRACKS);
  const libraryStatus = useLibrary((s) => s.status);
  const renamePlaylist = useLibrary((s) => s.renamePlaylist);
  const deletePlaylist = useLibrary((s) => s.deletePlaylist);
  const playList = usePlayer((s) => s.playList);
  const toggle = usePlayer((s) => s.toggle);
  const queue = usePlayer((s) => s.queue);
  const status = usePlayer((s) => s.status);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const t = useT();

  const name = kind === "favorites" ? t.nav.favorites : kind === "history" ? t.nav.recentlyPlayed : playlist?.name ?? "";
  const label =
    kind === "playlist" ? t.collection.labelPlaylist : kind === "favorites" ? t.collection.labelFavorites : t.collection.labelHistory;
  const trackIds = useMemo(() => new Set(tracks.map((track) => track.id)), [tracks]);
  const total = useMemo(() => tracks.reduce((sum, track) => sum + (track.duration || 0), 0), [tracks]);

  if (kind === "playlist" && !playlist) {
    if (libraryStatus !== "ready") return <PageHeader />;
    return (
      <>
        <PageHeader />
        <EmptyState
          icon={<MagnifyingGlassIcon size={28} />}
          title={t.collection.notFoundTitle}
          body={t.collection.notFoundBody}
          action={
            <Link to={paths.library} className="mt-2 h-11 rounded-full bg-surface-3 px-6 text-sm leading-[44px] font-medium">
              {t.collection.goToLibrary}
            </Link>
          }
        />
      </>
    );
  }

  // The queue holds exactly these tracks, so this collection is the current playback context.
  const isThisPlaying = tracks.length > 0 && queue.length === tracks.length && queue.every((t) => trackIds.has(t.id));
  const playing = isThisPlaying && (status === "playing" || status === "loading");

  return (
    <div className="pb-8">
      <PageHeader title={name} mobileOnly />

      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-20 h-72 bg-linear-to-b from-accent-soft to-transparent" />
        <div className="relative flex flex-col items-center gap-5 px-4 pt-2 pb-6 md:flex-row md:items-end md:gap-6 md:px-6 md:pt-10">
          <Cover
            kind={kind}
            tracks={tracks}
            iconSize={64}
            className="size-44 shrink-0 rounded-[18px] shadow-[0_24px_60px_rgb(0_0_0/0.4)] md:size-52"
          />
          <div className="flex min-w-0 flex-col items-center gap-2 text-center md:items-start md:text-left">
            <span className="hidden text-xs font-medium text-fg-2 md:block">{label}</span>
            {playlist?.origin && <span className="text-xs text-fg-2">{playlist.origin.kind === "album" ? t.features.albumOrigin : t.features.playlistOrigin}</span>}
            <h1 className="max-w-full text-[28px] leading-[1.1] font-bold tracking-tight break-words md:text-5xl lg:text-6xl">{name}</h1>
            <p className="font-mono text-[13px] text-fg-2">
              {t.common.tracks(tracks.length)}
              {total > 0 && <> · {t.time.total(total)}</>}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 pb-4 md:px-6">
        <PlayDisc
          label={playing ? t.common.pause : t.common.playX(name)}
          px={56}
          disabled={!tracks.length}
          onClick={() => (isThisPlaying ? toggle() : playList(tracks, 0))}
        >
          {playing ? <PauseIcon size={24} weight="fill" /> : <PlayIcon size={24} weight="fill" />}
        </PlayDisc>
        <IconButton
          label={t.collection.shuffle}
          size="lg"
          disabled={!tracks.length}
          onClick={() => {
            const order = shuffled(tracks);
            playList(order, 0);
          }}
        >
          <ShuffleIcon size={24} />
        </IconButton>
        {kind === "playlist" && (
          <IconButton label={t.collection.more} size="lg" onClick={() => setMoreOpen(true)}>
            <DotsThreeIcon size={26} weight="bold" />
          </IconButton>
        )}
      </div>

      <div className="px-2 md:px-3">
        {tracks.length > 0 ? (
          <TrackList tracks={tracks} playlistId={playlist?.id} listKey={`${kind}:${id ?? ""}`} showAlbum />
        ) : (
          <EmptyState
            icon={<MagnifyingGlassIcon size={28} />}
            title={kind === "history" ? t.collection.emptyHistory : t.collection.empty}
            body={
              kind === "favorites"
                ? t.collection.emptyFavoritesBody
                : kind === "history"
                  ? t.collection.emptyHistoryBody
                  : t.collection.emptyPlaylistBody
            }
            action={
              <Link to={paths.search} className="mt-2 h-11 rounded-full bg-accent px-6 text-sm leading-[44px] font-semibold text-accent-ink">
                {t.common.searchMusic}
              </Link>
            }
          />
        )}
      </div>

      {playlist && (
        <>
          <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title={playlist.name}>
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setRenaming(true);
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-3"
              >
                <PencilSimpleIcon size={18} className="text-fg-2" /> {t.collection.rename}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setConfirmDelete(true);
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-danger hover:bg-surface-3"
              >
                <TrashIcon size={18} /> {t.collection.deletePlaylist}
              </button>
            </div>
          </Modal>

          <NamePlaylistDialog
            open={renaming}
            initial={playlist.name}
            title={t.collection.renameTitle}
            action={t.collection.save}
            onClose={() => setRenaming(false)}
            onSubmit={(n) => {
              void renamePlaylist(playlist.id, n);
              setRenaming(false);
            }}
          />

          <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t.collection.deleteTitle}>
            <p className="text-sm text-fg-2">
              {t.collection.deleteBody(playlist.name, playlist.tracks.length)}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-11 rounded-full px-5 text-sm font-medium text-fg-2 hover:text-fg">
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  void deletePlaylist(playlist.id);
                  navigate(paths.library);
                }}
                className="h-11 rounded-full bg-danger px-6 text-sm font-semibold text-white"
              >
                {t.collection.delete}
              </button>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
