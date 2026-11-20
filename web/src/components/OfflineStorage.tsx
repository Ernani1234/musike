import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useOffline } from "../stores/offline";
import { useSession } from "../stores/session";
import { BUDGETS, MIB } from "../lib/offlineStore";
import { cancelOfflineDownloads, clearOfflineRecents, pinOfflinePlaylist, playlistRevision, refreshOffline, setOfflineBudget, unpinOfflinePlaylist } from "../lib/offlineDownloads";
import type { Playlist } from "../lib/types";

const size = (bytes: number) => `${(bytes / MIB).toFixed(1)} MiB`;
export function OfflineStorage() {
  const t = useT(); const f = t.offline; const state = useOffline(); const offline = useSession(s => !!s.offline);
  const [budget, setBudget] = useState(1024); const [working, setWorking] = useState(false);
  useEffect(() => { void refreshOffline(); const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("musike-offline") : null;
    if (channel) channel.onmessage = () => void refreshOffline();
    return () => channel?.close();
  }, []);
  useEffect(() => { if (state.summary) setBudget(state.summary.settings.budget / MIB); }, [state.summary?.settings.budget]);
  const run = async (work: () => Promise<unknown>) => { setWorking(true); try { await work(); } catch { useOffline.setState({ error: f.storageUnavailable }); } finally { setWorking(false); } };
  return <section className="my-4 flex flex-col gap-3 rounded-2xl bg-surface-2 p-4 text-sm" aria-label={f.title}>
    <h2 className="font-semibold">{f.title}</h2>
    <p className="text-fg-2">{f.notice}</p>
    <label className="flex flex-wrap items-center gap-3">{f.budget}<select className="h-11 rounded-full bg-surface-1 px-4 ring-1 ring-line-strong" value={budget} disabled={working || offline} onChange={e => {
      const mib = Number(e.target.value); setBudget(mib); if (state.summary?.settings.enabled) void run(() => setOfflineBudget(mib, true));
    }}>{BUDGETS.map(n => <option value={n} key={n}>{n === 512 ? "512 MiB" : `${n / 1024} GiB`}</option>)}</select></label>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="button-secondary" disabled={working || offline} onClick={() => void run(() => setOfflineBudget(budget, !state.summary?.settings.enabled))}>{state.summary?.settings.enabled ? f.disable : f.enable}</button>
      <button type="button" className="button-secondary" disabled={working} onClick={() => void run(clearOfflineRecents)}>{f.clear}</button>
      {state.busy && <button type="button" className="button-secondary" onClick={() => cancelOfflineDownloads()}>{f.cancel}</button>}
    </div>
    <p>{f.audioUsage}: {size(state.summary?.bytes ?? 0)} / {size(state.summary?.settings.budget ?? budget * MIB)}</p>
    <p>{f.siteUsage}: {state.siteUsage === null ? "—" : size(state.siteUsage)}</p><p className="text-xs text-fg-2">{f.siteNote}</p>
    {state.summary?.settings.enabled && <p className="text-xs text-fg-2">{state.persistent ? f.persistence : f.temporary}</p>}
    {state.error && <p role="alert" className="text-danger">{state.error}</p>}
  </section>;
}
export function OfflinePlaylistButton({ playlist }: { playlist: Playlist }) {
  const f = useT().offline; const state = useOffline(); const offline = useSession(s => !!s.offline); const [working, setWorking] = useState(false);
  useEffect(() => { void refreshOffline(); }, [playlist.id]);
  const pin = state.summary?.pins.find(p => p.id === playlist.id);
  const ids = new Set(state.summary?.entries.map(e => e.id));
  const target = pin?.pending ?? playlist;
  const count = target.tracks.filter(t => ids.has(t.id)).length;
  const updated = pin && !pin.pending && playlistRevision(pin.playlist) !== playlistRevision(playlist);
  const ready = pin && !pin.pending && count === target.tracks.length;
  const run = async (work: () => Promise<void>) => { setWorking(true); try { await work(); } catch { useOffline.setState({ error: f.incomplete }); } finally { setWorking(false); } };
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <button type="button" className="button-secondary" disabled={working || state.busy || offline || !playlist.tracks.length} onClick={() => void run(() => pinOfflinePlaylist(playlist))}>
      {updated ? f.update : pin?.pending ? f.resume : ready ? f.ready : f.download}
    </button>
    {pin && <><span className="text-fg-2" role="status">{updated ? f.updatesAvailable : ready ? f.ready : f.pending} · {count}/{target.tracks.length}</span>
      <button type="button" className="button-secondary" disabled={working} onClick={() => void run(() => unpinOfflinePlaylist(playlist.id))}>{f.remove}</button></>}
  </div>;
}
