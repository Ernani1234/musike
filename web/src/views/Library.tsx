import { PlaylistImportDialog } from "../components/PlaylistImportDialog";
import { socialState, type SocialState } from "../lib/social";
import { useSession } from "../stores/session";
import { PlusIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Cover, type CoverKind } from "../components/Cover";
import { NamePlaylistDialog } from "../components/Dialogs";
import { PageHeader } from "../components/Page";
import { useT } from "../i18n";
import { paths } from "../lib/routes";
import type { Track } from "../lib/types";
import { useLibrary } from "../stores/library";

function Entry({ to, name, kind, tracks, sub }: { to: string; name: string; kind: CoverKind; tracks: Track[]; sub: string }) {
  return (
    <li>
      <Link
        to={to}
        className="group flex items-center gap-3 rounded-[16px] p-2 transition-colors hover:bg-surface-2 md:flex-col md:items-stretch md:gap-3 md:p-3"
      >
        <Cover
          kind={kind}
          tracks={tracks}
          iconSize={26}
          className="size-16 shrink-0 rounded-[12px] md:aspect-square md:size-auto md:w-full md:rounded-[14px] md:shadow-[0_12px_32px_rgb(0_0_0/0.3)]"
        />
        <span className="min-w-0">
          <span className="block truncate font-medium">{name}</span>
          <span className="block truncate text-sm text-fg-2">{sub}</span>
        </span>
      </Link>
    </li>
  );
}

export default function Library() {
  const user = useSession(s => s.user);
  const [importing, setImporting] = useState(false);
  const [shares, setShares] = useState<SocialState["shares"]>([]);
  useEffect(() => { let stopped = false; setShares([]); if (user) void socialState().then(s => { if (!stopped) setShares(s.shares); }).catch(() => {}); return () => { stopped = true; }; }, [user?.id]);
  const favorites = useLibrary((s) => s.favorites);
  const playlists = useLibrary((s) => s.playlists);
  const history = useLibrary((s) => s.history);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const t = useT();

  return (
    <div className="pb-8">
      <PageHeader
        title={t.nav.library}
        actions={
          <>
          {user && <button type="button" className="button-secondary text-xs" onClick={() => setImporting(true)}>{t.collaboration.importPlaylist}</button>}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-10 items-center gap-1.5 rounded-full bg-accent pr-4 pl-3 text-sm font-semibold text-accent-ink transition-transform active:scale-[0.97]"
          >
            <PlusIcon size={18} weight="bold" /> <span className="hidden sm:inline">{t.nav.newPlaylist}</span>
            <span className="sm:hidden">{t.library.newShort}</span>
          </button>
          </>
        }
      />

      <ul className="grid grid-cols-1 gap-1 px-2 pt-2 md:grid-cols-3 md:gap-2 md:px-4 lg:grid-cols-4 2xl:grid-cols-6">
        <Entry to={paths.favorites} name={t.nav.favorites} kind="favorites" tracks={favorites} sub={t.common.tracks(favorites.length)} />
        <Entry to={paths.history} name={t.nav.recentlyPlayed} kind="history" tracks={history} sub={t.common.tracks(history.length)} />
        {playlists.map((p) => (
          <Entry
            key={p.id}
            to={paths.playlist(p.id)}
            name={p.name}
            kind="playlist"
            tracks={p.tracks}
            sub={`${t.library.playlistSub(p.tracks.length)}${p.origin ? ` · ${p.origin.provider === "youtube" ? t.collaboration.youtubePlaylist : p.origin.kind === "album" ? t.features.albumOrigin : t.features.playlistOrigin}` : ""}`}
          />
        ))}
      </ul>

      {playlists.length === 0 && (
        <p className="px-4 pt-6 text-sm text-fg-2 md:px-6">
          {t.library.noPlaylists}
        </p>
      )}

      {user && <PlaylistImportDialog open={importing} onClose={() => setImporting(false)} />}
      {shares.length > 0 && <section className="px-4 pt-4 md:px-6"><h2 className="font-semibold">{t.collaboration.sharedWithMe}</h2><ul className="flex flex-col gap-2 pt-3">{shares.map(s => <li key={s.id}><Link className="text-sm text-accent-text" to={`/shared/${s.id}`}>{s.name} · {s.owner.name || t.collaboration.member} · {t.common.tracks(s.tracks)}</Link></li>)}</ul></section>}
      <NamePlaylistDialog
        open={creating}
        title={t.nav.newPlaylist}
        action={t.library.create}
        onClose={() => setCreating(false)}
        onSubmit={async (name) => {
          const p = await createPlaylist(name);
          setCreating(false);
          if (p) navigate(paths.playlist(p.id));
        }}
      />
    </div>
  );
}
