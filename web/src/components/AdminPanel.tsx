import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { accountRequest } from "../stores/session";

interface Settings { media: { cacheMb: number; lookahead: number; audioQuality: string; videoQuality: string; ytdlpArgs: string[] };
  otpEnabled: boolean; otpExpiry: number; otpCooldown: number; }
interface User { id: string; phone: string; name: string; role: string; status: string; last_seen: number | null; }
interface Ops { users: number; connectedUsers: number; cache: { bytes: number; budget: number }; clients: { id: string; name: string; ip: string; last_activity: number }[];
  errors: { at: number; action: string; ip: string; level: string }[]; }
const input = "h-11 w-full rounded-full bg-surface-1 px-4 text-sm ring-1 ring-line-strong";
export default function AdminPanel() {
  const t = useT(); const f = t.features;
  const [settings, setSettings] = useState<Settings | null>(null); const [args, setArgs] = useState("[]");
  const [users, setUsers] = useState<User[]>([]); const [ops, setOps] = useState<Ops | null>(null);
  const [invite, setInvite] = useState(""); const [phone, setPhone] = useState(""); const [error, setError] = useState("");
  const load = async () => {
    try { const [settings, users, ops] = await Promise.all([accountRequest<Settings>("/api/admin/settings"),
      accountRequest<{ users: User[] }>("/api/admin/users"), accountRequest<Ops>("/api/admin/ops")]);
      setSettings(settings); setArgs(JSON.stringify(settings.media.ytdlpArgs)); setUsers(users.users); setOps(ops);
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); const timer = setInterval(() => void accountRequest<Ops>("/api/admin/ops").then(setOps).catch(() => {}), 5000); return () => clearInterval(timer); }, []);
  const patchUser = async (id: string, body: unknown) => {
    try { await accountRequest(`/api/admin/users/${id}`, body, "PATCH"); await load(); } catch (e) { setError((e as Error).message); }
  };
  if (!settings) return <p className="text-sm text-fg-2">{error || t.common.loading}</p>;
  const media = settings.media;
  const number = (label: string, value: number, change: (n: number) => void, min: number, max: number) => <label className="flex flex-col gap-2 text-sm">{label}<input type="number" className={input} min={min} max={max} value={value} onChange={(e) => change(Number(e.target.value))} /></label>;
  return <div className="flex flex-col gap-5 border-t border-line pt-4">
    <h3 className="text-base font-semibold">{f.admin}</h3>{error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <section className="flex flex-col gap-3"><h4 className="font-medium">{f.server}</h4>
      {number(f.cacheBudget, media.cacheMb, (n) => setSettings({ ...settings, media: { ...media, cacheMb: n } }), 1, 102400)}
      {number(f.lookahead, media.lookahead, (n) => setSettings({ ...settings, media: { ...media, lookahead: n } }), 0, 10)}
      <label className="flex flex-col gap-2 text-sm">{f.audioQuality}<select className={input} value={media.audioQuality} onChange={(e) => setSettings({ ...settings, media: { ...media, audioQuality: e.target.value } })}><option value="standard">{f.standard}</option><option value="high">{f.high}</option></select></label>
      <label className="flex flex-col gap-2 text-sm">{f.videoQuality}<select className={input} value={media.videoQuality} onChange={(e) => setSettings({ ...settings, media: { ...media, videoQuality: e.target.value } })}><option value="sd">{f.sd}</option><option value="hd">{f.hd}</option></select></label>
      <label className="flex flex-col gap-2 text-sm">{f.arguments}<input className={input} value={args} onChange={(e) => setArgs(e.target.value)} /></label>
    </section>
    <section className="flex flex-col gap-3"><h4 className="font-medium">{f.otpSettings}</h4>
      <label className="flex items-center gap-2"><input type="checkbox" checked={settings.otpEnabled} onChange={(e) => setSettings({ ...settings, otpEnabled: e.target.checked })} />{f.otpEnabled}</label>
      {number(f.expiry, settings.otpExpiry, (n) => setSettings({ ...settings, otpExpiry: n }), 60, 900)}
      {number(f.cooldown, settings.otpCooldown, (n) => setSettings({ ...settings, otpCooldown: n }), 30, 300)}
      <button className="button-secondary" type="button" onClick={() => { try { const body = { ...settings, media: { ...media, ytdlpArgs: JSON.parse(args) } };
        void accountRequest<Settings>("/api/admin/settings", body, "PATCH").then(setSettings).catch((e) => setError(e.message)); } catch (e) { setError((e as Error).message); } }}>{f.save}</button>
    </section>
    <section className="flex flex-col gap-3"><h4 className="font-medium">{f.users}</h4>
      <label className="flex flex-col gap-2 text-sm">{f.phone}<input className={input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      <button className="button-secondary" type="button" onClick={() => void accountRequest<{ code: string }>("/api/admin/invites", { phone }).then((r) => setInvite(r.code)).catch((e) => setError(e.message))}>{f.inviteCreate}</button>
      {invite && <output className="break-all rounded-xl bg-surface-1 p-3 font-mono text-sm">{invite}</output>}
      {users.map((user) => <div key={user.id} className="flex flex-col gap-2 rounded-xl bg-surface-1 p-3">
        <p className="text-sm">{user.name ? `${user.name} · ${user.phone}` : user.phone}</p><p className="text-xs text-fg-2">{f.lastSeen}: {user.last_seen ? new Date(user.last_seen).toLocaleString() : "—"}</p>
        <label className="text-sm">{f.name}<input className={input} defaultValue={user.name} key={`${user.id}:${user.name}`} onBlur={(e) => { if (e.target.value !== user.name) void patchUser(user.id, { name: e.target.value }); }} /></label>
        <label className="text-sm">{f.role}<select className={input} value={user.role} onChange={(e) => void patchUser(user.id, { role: e.target.value })}><option value="user">{f.user}</option><option value="admin">{f.administrator}</option></select></label>
        <label className="text-sm">{f.status}<select className={input} value={user.status} onChange={(e) => void patchUser(user.id, { status: e.target.value })}><option value="approved">{f.approved}</option><option value="pending">{f.pending}</option><option value="disabled">{f.disabled}</option></select></label>
      </div>)}
    </section>
    {ops && <section className="flex flex-col gap-3"><h4 className="font-medium">{f.ops}</h4><p className="text-sm">{f.users}: {ops.users} · {f.connected}: {ops.connectedUsers} / {ops.clients.length}</p>
      <p className="font-mono text-sm">{f.cacheBudget}: {(ops.cache.bytes / 1048576).toFixed(1)} / {(ops.cache.budget / 1048576).toFixed(0)} MB</p>
      {ops.clients.map((client) => <p key={client.id} className="break-all text-xs">{client.name} · {f.ip}: {client.ip} · {new Date(client.last_activity).toLocaleTimeString()}</p>)}
      <h5 className="text-sm font-medium">{f.errors}</h5><ul className="scroll-area max-h-48 overflow-auto text-xs text-fg-2">{ops.errors.map((event, i) => <li key={i}>{new Date(event.at).toLocaleTimeString()} · {event.action} · {event.ip}</li>)}</ul>
    </section>}
  </div>;
}
