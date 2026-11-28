import { PauseIcon, PlayIcon, ShuffleIcon } from "@phosphor-icons/react";
import { Navigate, useLocation } from "react-router";
import { AlbumGrid } from "../components/AlbumTiles";
import { ArtistGrid } from "../components/ArtistTiles";
import { IconButton, PlayDisc } from "../components/IconButton";
import { BackButton, PageHeader } from "../components/Page";
import { SelectableTrackList } from "../components/Selection";
import { useT } from "../i18n";
import { shuffled } from "../lib/format";
import { paths } from "../lib/routes";
import type { HomeSection } from "../lib/types";
import { usePlayer } from "../player/player";

/**
 * The full content of a Home discover section (a chart, a mix, a shelf) — tapped from its one tile on Home.
 * This is not an API resource: the section's items are already in memory from the Home fetch, carried here
 * through the route's `state` rather than refetched, so this view has no loading/error state of its own.
 */
export default function SectionDetail() {
  const location = useLocation();
  const t = useT();
  const section = (location.state as { section?: HomeSection } | null)?.section;
  const playList = usePlayer((s) => s.playList);
  const toggle = usePlayer((s) => s.toggle);
  const queue = usePlayer((s) => s.queue);
  const status = usePlayer((s) => s.status);

  if (!section) return <Navigate to={paths.home} replace />;

  const tracks = section.kind === "tracks" ? section.items : [];
  const isThisPlaying = tracks.length > 0 && queue.length === tracks.length && queue.every((q, i) => q.id === tracks[i]?.id);
  const playing = isThisPlaying && (status === "playing" || status === "loading");

  return (
    <div className="pb-8">
      <PageHeader title={section.title} actions={<BackButton fallback={paths.home} />} />

      {section.kind === "tracks" && tracks.length > 0 && (
        <div className="flex items-center gap-2 px-4 pt-2 pb-4 md:px-6">
          <PlayDisc
            label={playing ? t.common.pause : t.common.playAll}
            px={56}
            onClick={() => (isThisPlaying ? toggle() : playList(tracks, 0))}
          >
            {playing ? <PauseIcon size={24} weight="fill" /> : <PlayIcon size={24} weight="fill" />}
          </PlayDisc>
          <IconButton label={t.album.shuffle} size="lg" onClick={() => playList(shuffled(tracks), 0)}>
            <ShuffleIcon size={24} />
          </IconButton>
        </div>
      )}

      {section.kind === "tracks" && <SelectableTrackList tracks={section.items} numbered />}
      {section.kind === "albums" && <AlbumGrid albums={section.items} />}
      {section.kind === "artists" && <ArtistGrid artists={section.items} />}
    </div>
  );
}
