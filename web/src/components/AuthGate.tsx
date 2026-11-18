import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { accountRequest, useSession, type SessionInfo } from "../stores/session";

const inputClass = "h-11 w-full rounded-full bg-surface-2 px-5 text-fg ring-1 ring-line-strong";
export function AuthGate({ children }: { children: ReactNode }) {
  const t = useT(); const f = t.features;
  const info = useSession();
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState(""); const [invite, setInvite] = useState(""); const [code, setCode] = useState("");
  const [remember, setRemember] = useState(false); const [challenge, setChallenge] = useState("");
  const [cooldown, setCooldown] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    if (import.meta.env.MODE === "native") { setReady(true); return; }
    accountRequest<SessionInfo>("/api/auth/me").then((data) => { if (alive) { if (data.enabled && data.user) sessionStorage.setItem("musike:user", data.user.id); else sessionStorage.removeItem("musike:user"); useSession.setState(data); setReady(true); } },
      () => { if (alive) { setError(f.connectionFailed); setReady(true); useSession.setState({ enabled: true, user: null }); } });
    const expired = () => useSession.setState({ user: null, enabled: true });
    window.addEventListener("musike:unauthorized", expired);
    return () => { alive = false; window.removeEventListener("musike:unauthorized", expired); };
  }, []);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown((n) => Math.max(0, n - 1)), 1000); return () => clearTimeout(timer); }, [cooldown]);
  useEffect(() => {
    if (!info.enabled || !info.user) return;
    const clientId = sessionStorage.getItem("musike:client") ?? crypto.randomUUID(); sessionStorage.setItem("musike:client", clientId);
    const ping = () => accountRequest<{ user: SessionInfo["user"] }>("/api/presence", { clientId }).then((r) => { if (r.user) useSession.setState({ user: r.user }); }).catch(() => {});
    void ping(); const timer = setInterval(ping, 15_000); return () => clearInterval(timer);
  }, [info.enabled, info.user?.id]);
  if (!ready) return <p className="p-6 text-fg-2">{t.common.loading}</p>;
  if (!info.enabled || info.user) return children;
  const send = async () => {
    setBusy(true); setError("");
    try { const data = await accountRequest<{ challengeId: string; cooldown: number; delivery: string }>("/api/auth/request", { phone, invite, remember });
      setChallenge(data.challengeId); setCooldown(data.cooldown); if (data.delivery === "uncertain") setError(f.deliveryUncertain);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setError("");
    try { const data = await accountRequest<{ user: SessionInfo["user"] }>("/api/auth/verify", { challengeId: challenge, code });
      sessionStorage.setItem("musike:user", data.user!.id); location.reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <main className="grid min-h-dvh place-items-center bg-bg p-4 text-fg">
    <section className="island w-full max-w-md"><div className="island-core flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{f.login}</h1><p className="text-sm text-fg-2">{f.inviteOnly}</p>
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void (challenge ? verify() : send()); }}>
        <label className="flex flex-col gap-2">{f.phone}<input className={inputClass} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required disabled={!!challenge} /></label>
        {!challenge && <><label className="flex flex-col gap-2">{f.invite}<input className={inputClass} value={invite} onChange={(e) => setInvite(e.target.value)} autoComplete="off" /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />{f.remember}</label></>}
        {challenge && <label className="flex flex-col gap-2">{f.otp}<input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /></label>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button className="button-secondary disabled:opacity-40" disabled={busy} type="submit">{busy ? t.common.loading : challenge ? f.verify : f.sendCode}</button>
        {challenge && <><button type="button" className="button-secondary disabled:opacity-40" disabled={busy || cooldown > 0} onClick={() => void send()}>{f.resend} {cooldown || ""}</button>
          <button type="button" className="button-secondary" onClick={() => { setChallenge(""); setCode(""); }}>{f.changePhone}</button></>}
      </form>
    </div></section>
  </main>;
}
