import { useState } from "react";
import { useT } from "../i18n";
import { jamAction, playJamHere, useJam } from "../lib/jams";
import { accountRequest, useSession } from "../stores/session";
const input = "h-11 w-full rounded-full bg-surface-1 px-4 text-sm ring-1 ring-line-strong";
export function JamPanel() {
  const c = useT().collaboration; const { view, error } = useJam(); const user = useSession(s => s.user);
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get("jam") ?? ""); const [invite, setInvite] = useState(""); const [failure, setFailure] = useState("");
  const run = (path: string, body?: unknown, method?: string) => { setFailure(""); return jamAction(path, body, method).catch(e => setFailure(e.message)); };
  const host = !!view && (view.host === user?.id || view.owner === user?.id);
  return <section className="flex flex-col gap-3 rounded-[20px] bg-surface-2 p-4"><h2 className="font-semibold">{c.jam}</h2>
    {(failure || error) && <p className="text-sm text-danger" role="alert">{failure || error}</p>}
    {!view ? <><button type="button" className="button-secondary" onClick={() => void run("/api/jams", {})}>{c.createJam}</button><label className="flex flex-col gap-2 text-sm">{c.jamCode}<input className={input} value={code} onChange={e => setCode(e.target.value)} /></label><button type="button" className="button-secondary" disabled={!code} onClick={() => void run("/api/jams/join", { code })}>{c.join}</button></> : <>
      <p className="text-sm text-fg-2">{view.host ? `${c.host}: ${view.members.find(m => m.id === view.host)?.name || c.member}` : c.hostMissing}</p>
      <p className="text-sm">{view.snapshot.queue[view.snapshot.index]?.title ?? c.emptyQueue}</p>
      <p className="text-xs text-fg-2">{c.jamHelp}</p>
      <div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" onClick={() => void playJamHere().catch(e => setFailure(e.message))}>{c.listenHere}</button>
        {!view.host && <button type="button" className="button-secondary" onClick={() => void run(`/api/jams/${view.id}/claim`, {})}>{c.claimHost}</button>}
        <button type="button" className="button-secondary" onClick={() => void run(`/api/jams/${view.id}/leave`, {})}>{c.leave}</button></div>
      {host && <><label className="flex gap-2 text-sm"><input type="checkbox" checked={view.guestControls} onChange={e => void run(`/api/jams/${view.id}`, { guestControls: e.target.checked }, "PATCH")} />{c.guestControls}</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={view.locked} onChange={e => void run(`/api/jams/${view.id}`, { locked: e.target.checked }, "PATCH")} />{c.lockJam}</label>
        <div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" onClick={() => void accountRequest<{ code: string }>(`/api/jams/${view.id}/invite`, {}).then(r => setInvite(`${location.origin}/social?jam=${encodeURIComponent(r.code)}`)).catch(e => setFailure(e.message))}>{c.createInvite}</button>
          <button type="button" className="button-secondary" onClick={() => { setInvite(""); void run(`/api/jams/${view.id}`, { revokeInvites: true }, "PATCH"); }}>{c.revokeInvites}</button></div>
        {invite && <label className="flex flex-col gap-2 text-sm">{c.inviteLink}<input readOnly className={input} value={invite} onFocus={e => e.target.select()} /><span className="text-xs text-fg-2">{c.inviteExpiry}</span></label>}
      </>}
      <ul className="flex flex-col gap-2">{view.members.map(m => <li key={m.id} className="flex items-center justify-between gap-2 text-sm"><span>{m.name || c.member} · {m.online ? c.online : c.offline}</span>{host && m.id !== user?.id && m.id !== view.owner && <button type="button" className="button-secondary" onClick={() => void run(`/api/jams/${view.id}`, { remove: m.id }, "PATCH")}>{c.remove}</button>}</li>)}</ul>
    </>}
  </section>;
}
