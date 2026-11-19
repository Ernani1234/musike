import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { accountRequest } from "../stores/session";

export function DiscordSection() {
  const f = useT().features; const [status, setStatus] = useState<{ configured: boolean; connected: boolean; ready: boolean } | null>(null); const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    const load = () => void accountRequest<NonNullable<typeof status>>("/api/discord/status").then((data) => { if (!stopped) setStatus(data); }).catch(() => {});
    load(); const timer = setInterval(load, 10000); return () => { stopped = true; clearInterval(timer); };
  }, []);
  if (!status?.configured) return null;
  return <section className="flex flex-col gap-3 border-t border-line pt-4">
    <h3 className="text-sm font-semibold">{f.discord}</h3>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {status.connected ? <>
      <p className="text-sm text-fg-2">{status.ready ? f.discordLinked : f.discordPending}</p>
      <button className="button-secondary" type="button" onClick={() => void accountRequest("/api/discord/disconnect", {}).then(() => setStatus({ ...status, connected: false, ready: false })).catch((e) => setError(e.message))}>{f.discordDisconnect}</button>
    </> : <button className="button-secondary" type="button" onClick={() => void accountRequest<{ url: string }>("/api/discord/connect", {}).then((data) => location.assign(data.url)).catch((e) => setError(e.message))}>{f.discordConnect}</button>}
  </section>;
}
