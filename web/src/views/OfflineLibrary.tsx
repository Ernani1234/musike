import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Transport, Scrubber, Volume } from "../components/Controls";
import { OfflinePlaylistButton, OfflineStorage } from "../components/OfflineStorage";
import { useT } from "../i18n";
import { cancelOfflineDownloads, logoutOfflineData, offlineOwner, refreshOffline } from "../lib/offlineDownloads";
import { offlineSummary } from "../lib/offlineStore";
import { setOfflineOutput } from "../lib/playbackSync";
import { paths } from "../lib/routes";
import type { Track } from "../lib/types";
import { usePlayer } from "../player/player";
import { useOffline } from "../stores/offline";
import { accountRequest, useSession, type SessionInfo } from "../stores/session";

export default function OfflineLibrary({ canPlay = true }: { canPlay?: boolean }) {
  const t = useT(); const summary = useOffline(s => s.summary); const offline = useSession(s => !!s.offline);
  const [page, setPage] = useState(0);
  useEffect(() => { void refreshOffline(); }, []);
  const entries = summary?.entries ?? []; const ids = new Set(entries.map(e => e.id));
  const play = (tracks: Track[], index = 0) => {
    const p = usePlayer.getState(); p.setPreferVideo(false); p.setAutoRadio(false); p.playList(tracks, index);
  };
  return <div className="mx-auto max-w-3xl p-4 md:p-6">
    <h1 className="text-2xl font-semibold">{t.offline.title}</h1>
    {!offline && <Link className="text-accent-text" to={paths.library}>{t.nav.library}</Link>}
    <OfflineStorage />
    <ul className="flex flex-col gap-4">{summary?.pins.map(pin => {
      const playlist = pin.pending ?? pin.playlist; const available = pin.playlist.tracks.filter(track => ids.has(track.id));
      return <li className="rounded-2xl bg-surface-2 p-4" key={pin.id}><h2 className="mb-3 break-words font-semibold">{playlist.name}</h2>
        <OfflinePlaylistButton playlist={playlist} />
        <button type="button" className="button-secondary mt-3" disabled={!canPlay || !available.length} onClick={() => play(available)}>{t.common.play} · {available.length}</button>
      </li>;
    })}</ul>
    <h2 className="py-4 font-semibold">{t.offline.recent}</h2>
    {!entries.length && <p className="text-fg-2">{t.offline.empty}</p>}
    <ul>{entries.slice(page * 60, page * 60 + 60).map(entry => <li key={entry.id}><button type="button" disabled={!canPlay} className="flex min-h-12 w-full flex-col rounded-xl p-3 text-left hover:bg-surface-2" onClick={() => play(entries.map(e => e.track), entries.indexOf(entry))}><span className="break-words">{entry.track.title}</span><span className="text-sm text-fg-2">{entry.track.artist}</span></button></li>)}</ul>
    {entries.length > 60 && <div className="flex gap-2"><button type="button" className="button-secondary" disabled={!page} onClick={() => setPage(page - 1)}>{t.collaboration.previous}</button><button type="button" className="button-secondary" disabled={(page + 1) * 60 >= entries.length} onClick={() => setPage(page + 1)}>{t.collaboration.next}</button></div>}
  </div>;
}
export function OfflineExperience() {
  const t = useT(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [canPlay, setCanPlay] = useState(false);
  const title = usePlayer(s => s.queue[s.index]?.title ?? "");
  const note = usePlayer(s => typeof s.statusText === "object" ? s.statusText?.error : null);
  useEffect(() => {
    let stopped = false; let unlock: (() => void) | undefined;
    cancelOfflineDownloads(); setOfflineOutput(false); usePlayer.getState().suspendOutput();
    const owner = offlineOwner();
    if (owner) void offlineSummary(owner).then(async data => {
      if (stopped) return;
      if (!data.settings.eligible) { setError(t.offline.outputBlocked); return; }
      if (!navigator.locks) { setError(t.offline.tabBlocked); return; }
      await navigator.locks.request(`musike-offline-output:${owner}`, { ifAvailable: true }, async lock => {
        if (stopped) return;
        if (!lock) { setError(t.offline.tabBlocked); return; }
        setOfflineOutput(true); setCanPlay(true);
        await new Promise<void>(resolve => { unlock = resolve; });
      });
    }).catch(() => setError(t.offline.storageUnavailable));
    return () => { stopped = true; setOfflineOutput(false); usePlayer.getState().suspendOutput(); unlock?.(); };
  }, []);
  const reconnect = async () => {
    if (busy) return;
    const wasAllowed = canPlay;
    setBusy(true); setOfflineOutput(false); usePlayer.getState().suspendOutput(); setCanPlay(false);
    try {
      const info = await accountRequest<SessionInfo>("/api/auth/me");
      // Reload after authentication: module-level queue keys and the online output grant must be fresh.
      if (!info.enabled || info.user?.id !== offlineOwner()) sessionStorage.removeItem("musike:user");
      location.reload();
    } catch { setError(t.offline.onlineRequired); setBusy(false); setOfflineOutput(wasAllowed); setCanPlay(wasAllowed); }
  };
  useEffect(() => { const online = () => void reconnect(); addEventListener("online", online); return () => removeEventListener("online", online); }, [busy]);
  return <main className="scroll-area min-h-dvh overflow-y-auto bg-bg pb-10 text-fg">
    <section className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 p-4"><p className="font-semibold">{t.offline.mode}</p>
      <button type="button" className="button-secondary" disabled={busy} onClick={() => void reconnect()}>{t.offline.reconnect}</button>
      <button type="button" className="button-secondary" onClick={() => { localStorage.setItem("musike:logout-pending", "1"); setOfflineOutput(false); usePlayer.getState().stopSession(); void logoutOfflineData().then(() => location.reload()).catch(() => setError(t.offline.storageUnavailable)); }}>{t.features.logout}</button>
      {error && <p role="alert" className="w-full text-sm text-danger">{error}</p>}
    </section>
    <OfflineLibrary canPlay={canPlay} />
    {canPlay && <section className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-2xl bg-surface-2 p-4"><p className="max-w-full truncate">{title}</p>{note && <p role="alert" className="text-sm text-danger">{note}</p>}<Transport /><Scrubber className="w-full" /><Volume /></section>}
  </main>;
}
