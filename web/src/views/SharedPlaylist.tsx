import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { PageHeader } from "../components/Page";
import { TrackList } from "../components/TrackList";
import { sharedPlaylist, type SharedPlaylistView } from "../lib/social";
import { accountRequest, useSession } from "../stores/session";
import { useLibrary } from "../stores/library";
import { usePlayer } from "../player/player";
import { useT } from "../i18n";
import type { Playlist, Track } from "../lib/types";
const input = "h-11 w-full rounded-full bg-surface-1 px-4 text-sm ring-1 ring-line-strong";
export default function SharedPlaylist() {
  const owner = useSession(s => s.user?.id);
  const { id = "" } = useParams(); const navigate = useNavigate(); const t = useT(); const c = t.collaboration;
  const [view, setView] = useState<SharedPlaylistView | null>(null); const [error, setError] = useState(""); const [editing, setEditing] = useState(false);
  const [editRevision, setEditRevision] = useState(0);
  const [name, setName] = useState(""); const [tracks, setTracks] = useState<Track[]>([]); const [source, setSource] = useState(""); const [offset, setOffset] = useState(0);
  const playlists = useLibrary(s => s.playlists);
  useEffect(() => { setView(null); setEditing(false); let stopped = false; let timer: ReturnType<typeof setTimeout>; const load = async () => { try { const next = await sharedPlaylist(id); if (!stopped) { setView(next); setError(""); } } catch (e) { if (!stopped) { setView(null); setError((e as Error).message); } } finally { if (!stopped) timer = setTimeout(() => void load(), 5000); } }; void load(); return () => { stopped = true; clearTimeout(timer); }; }, [id, owner]);
  const move = (index: number, delta: number) => setTracks(old => { const next = old.slice(); [next[index], next[index + delta]] = [next[index + delta]!, next[index]!]; return next; });
  return <><PageHeader title={view?.playlist.name || c.sharedPlaylist} /><div className="flex flex-col gap-4 p-4 md:p-6">
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {view && <><p className="text-sm text-fg-2">{view.owner.name || c.member} · {view.permission === "viewer" ? c.viewer : c.editor}</p>
      <div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" disabled={!view.playlist.tracks.length} onClick={() => usePlayer.getState().playList(view.playlist.tracks)}>{t.common.playAll}</button>
        <button type="button" className="button-secondary" onClick={() => void accountRequest<Playlist>(`/api/shared-playlists/${id}/copy`, {}).then(async p => { await useLibrary.getState().load(); navigate(`/playlist/${p.id}`); }).catch(e => setError(e.message))}>{c.saveCopy}</button>
        {view.permission !== "viewer" && <button type="button" className="button-secondary" onClick={() => { setEditRevision(view.playlist.updatedAt); setName(view.playlist.name); setTracks(view.playlist.tracks.slice()); setEditing(true); setOffset(0); }}>{c.editShared}</button>}</div>
      {editing ? <div className="flex flex-col gap-3"><p className="text-xs text-fg-2">{c.editHelp}</p><label className="flex flex-col gap-2 text-sm">{t.features.name}<input className={input} value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
        <label className="flex flex-col gap-2 text-sm">{c.addFromPlaylist}<select className={input} value={source} onChange={e => setSource(e.target.value)}><option value="">{c.selectPlaylist}</option>{playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <button type="button" className="button-secondary" disabled={!source} onClick={() => setTracks(old => { const have = new Set(old.map(t => t.id)); return [...old, ...(playlists.find(p => p.id === source)?.tracks ?? []).filter(t => !have.has(t.id) && !!have.add(t.id))].slice(0, 5000); })}>{c.add}</button>
        <ul>{tracks.slice(offset, offset + 50).map((track, n) => { const index = offset + n; return <li key={`${track.id}:${index}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm"><span>{index + 1}. {track.title}</span><span className="flex gap-2"><button type="button" className="button-secondary" disabled={!index} aria-label={c.moveUp} onClick={() => move(index, -1)}>↑</button><button type="button" className="button-secondary" disabled={index + 1 >= tracks.length} aria-label={c.moveDown} onClick={() => move(index, 1)}>↓</button><button type="button" className="button-secondary" onClick={() => setTracks(old => old.filter((_, i) => i !== index))}>{c.remove}</button></span></li>; })}</ul>
        <div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>{c.previous}</button><button type="button" className="button-secondary" disabled={offset + 50 >= tracks.length} onClick={() => setOffset(offset + 50)}>{c.next}</button>
          <button type="button" className="button-secondary" onClick={() => void accountRequest<SharedPlaylistView>(`/api/shared-playlists/${id}`, { revision: editRevision, name, tracks }, "PATCH").then(next => { setView(next); setEditing(false); }).catch(e => setError(e.message))}>{t.features.save}</button><button type="button" className="button-secondary" onClick={() => setEditing(false)}>{t.common.cancel}</button></div>
      </div> : <TrackList tracks={view.playlist.tracks} listKey={`shared:${id}`} />}
    </>}
  </div></>;
}
