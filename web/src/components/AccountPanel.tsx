import { lazy, Suspense, useEffect, useState } from "react";
import { useT } from "../i18n";
import { useListPage } from "../hooks/useListPage";
import { ListPager } from "./ListPager";
import { useLibrary } from "../stores/library";
import { accountRequest, useSession } from "../stores/session";
const AdminPanel = lazy(() => import("./AdminPanel"));

export function AccountPanel() {
  const session = useSession(); const t = useT(); const [admin, setAdmin] = useState(false); const [error, setError] = useState("");
  if (!session.enabled || !session.user) return null;
  return <section className="flex flex-col gap-3">
    <h3 className="text-sm font-semibold">{t.features.account}</h3>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <p className="text-sm text-fg-2">{session.user.name || session.user.phone}</p>
    <button type="button" className="button-secondary" onClick={() => void accountRequest("/api/auth/logout", {}).then(() => location.reload()).catch((e) => setError(e.message))}>{t.features.logout}</button>
    {session.user.role === "admin" && <><button type="button" className="button-secondary" onClick={() => setAdmin((value) => !value)}>{t.features.admin}</button>
      {admin && <Suspense fallback={null}><AdminPanel /></Suspense>}</>}
    {session.google && <GooglePanel />}
  </section>;
}
interface ImportReportData { items: { sourceId: string; title: string; kind: string; status: string }[]; unavailable: string[]; imported?: number; alreadyPresent?: number; notFound?: number; }
function ImportReport({ report, identity }: { report: ImportReportData; identity: string }) {
  const f = useT().features; const page = useListPage(report.items, `import:${identity}`);
  const status = (value: string) => value === "imported" ? f.imported : value === "already-present" ? f.already : f.notFound;
  return <section className="flex flex-col gap-2"><h4 className="text-sm font-medium">{f.importReport}</h4>
    <p className="text-sm text-fg-2">{f.imported}: {report.imported ?? 0} · {f.already}: {report.alreadyPresent ?? 0} · {f.notFound}: {report.notFound ?? 0}</p>
    {report.unavailable.length > 0 && <p className="break-words text-xs text-fg-2">{f.unavailable}: {report.unavailable.join("; ")}</p>}
    <ul className="scroll-area max-h-64 overflow-auto text-sm">{page.items.map((item, index) => <li key={`${item.sourceId}:${item.kind}:${index}`} className="flex flex-wrap justify-between gap-2 border-b border-line py-2"><span className="break-words">{item.title}</span><span className="text-fg-2">{status(item.status)}</span></li>)}</ul>
    <ListPager {...page} total={report.items.length} />
  </section>;
}
function GooglePanel() {
  const t = useT(); const [data, setData] = useState<{ connected: boolean; autoSync: boolean; runId?: string; status?: string; report?: ImportReportData } | null>(null); const [error, setError] = useState("");
  const load = () => accountRequest<typeof data>("/api/google/status").then(setData).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (data?.runId && ["done", "partial"].includes(data.status ?? "")) void useLibrary.getState().load(); }, [data?.runId, data?.status]);
  useEffect(() => { if (data?.status !== "running") return; const timer = setInterval(() => void load(), 3000); return () => clearInterval(timer); }, [data?.status]);
  const action = (url: string, body: unknown) => accountRequest(url, body).then(load).catch((e) => setError(e.message));
  return <section className="flex flex-col gap-3 border-t border-line pt-4"><h3 className="text-sm font-semibold">{t.features.google}</h3>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <button type="button" className="button-secondary" onClick={() => void load()}>{t.features.refresh}</button>
    {!data?.connected ? <button type="button" className="button-secondary" onClick={() => void accountRequest<{ url: string }>("/api/google/connect", {}).then((r) => location.assign(r.url)).catch((e) => setError(e.message))}>{t.features.connectGoogle}</button> : <>
      <button type="button" className="button-secondary" onClick={() => void action("/api/google/import", {})}>{t.features.importNow}</button>
      <label className="flex items-center gap-2"><input type="checkbox" checked={data.autoSync} onChange={(e) => void action("/api/google/sync", { enabled: e.target.checked })} />{t.features.dailySync}</label>
      <button type="button" className="button-secondary" onClick={() => void action("/api/google/disconnect", {})}>{t.features.disconnectGoogle}</button>
    </>}
    {data?.status === "running" && <p role="status" className="text-sm text-fg-2">{t.features.importing}</p>}
    {data?.report && <ImportReport report={data.report} identity={data.runId ?? "latest"} />}
  </section>;
}
