import { lazy, Suspense, useEffect, useState, useRef, useMemo } from "react";
import { useT } from "../i18n";
import { useListPage } from "../hooks/useListPage";
import { ListPager } from "./ListPager";
import { useLibrary } from "../stores/library";
import { accountRequest, useSession } from "../stores/session";
import { DiscordSection } from "./DiscordSection";
import { releasePlayback } from "../lib/playbackSync";
import { PlaybackDevices } from "./PlaybackDevices";
const AdminPanel = lazy(() => import("./AdminPanel"));

export function AccountPanel() {
  const session = useSession(); const t = useT(); const [admin, setAdmin] = useState(false); const [error, setError] = useState("");
  if (!session.enabled || !session.user) return null;
  return <section className="flex flex-col gap-3">
    <h3 className="text-sm font-semibold">{t.features.account}</h3>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <p className="text-sm text-fg-2">{session.user.name || session.user.phone}</p>
    <button type="button" className="button-secondary" onClick={() => void releasePlayback().then(() => accountRequest("/api/auth/logout", {})).then(() => location.reload()).catch((e) => setError(e.message))}>{t.features.logout}</button>
    {session.user.role === "admin" && <><button type="button" className="button-secondary" onClick={() => setAdmin((value) => !value)}>{t.features.admin}</button>
      {admin && <Suspense fallback={null}><AdminPanel /></Suspense>}</>}
    {session.google && <GooglePanel />}
    <DiscordSection />
    <PlaybackDevices />
  </section>;
}
interface ImportReportData { items: { sourceId: string; title: string; kind: string; status: string; reason?: string; candidates?: { id: string; title: string; score: number; reason: string }[] }[]; unavailable: string[]; imported?: number; alreadyPresent?: number; notFound?: number; reviewNeeded?: number; progress?: { phase: string; processed: number; total: number | null; current?: string; lastCompleted?: { title: string; status: string }; pending?: number }; }
function ImportReport({ report, identity }: { report: ImportReportData; identity: string }) {
  const f = useT().features; const [unresolved, setUnresolved] = useState(false);
  const shown = useMemo(() => unresolved ? report.items.filter((item) => ["not-found", "needs-review"].includes(item.status)) : report.items, [report.items, unresolved]);
  const page = useListPage(shown, `import:${identity}:${unresolved}`);
  const status = (value: string) => value === "imported" ? f.imported : value === "already-present" ? f.already : value === "needs-review" ? f.reviewNeeded : f.notFound;
  return <section className="flex flex-col gap-2"><h4 className="text-sm font-medium">{f.importReport}</h4>
    <p className="text-sm text-fg-2">{f.imported}: {report.imported ?? 0} · {f.already}: {report.alreadyPresent ?? 0} · {f.notFound}: {report.notFound ?? 0} · {f.reviewNeeded}: {report.reviewNeeded ?? 0}</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unresolved} onChange={(event) => setUnresolved(event.target.checked)} />{f.reviewItems}</label>
    {report.unavailable.length > 0 && <p className="break-words text-xs text-fg-2">{f.unavailable}: {report.unavailable.join("; ")}</p>}
    <ul className="scroll-area max-h-64 overflow-auto text-sm">{page.items.map((item, index) => <li key={`${item.sourceId}:${item.kind}:${index}`} className="flex flex-col gap-2 border-b border-line py-2">
      <div className="flex flex-wrap justify-between gap-2"><span className="break-words">{item.title}</span><span className="text-fg-2">{status(item.status)}</span></div>
      {item.candidates?.map((candidate) => <a key={candidate.id} className="break-words text-xs text-accent-text" href={`https://www.youtube.com/watch?v=${encodeURIComponent(candidate.id)}`} target="_blank" rel="noreferrer">
        {f.candidate}: {candidate.title} · {f.confidence}: {Math.round(candidate.score * 100)}%</a>)}
      {["needs-review", "not-found"].includes(item.status) && !item.candidates?.length && <span className="text-xs text-fg-2">{item.reason === "provider-unavailable" ? f.originFailure : f.noCandidates}</span>}
    </li>)}</ul>
    <ListPager {...page} total={shown.length} />
  </section>;
}
function GooglePanel() {
  const t = useT(); const [data, setData] = useState<{ connected: boolean; autoSync: boolean; runId?: string; status?: string; report?: ImportReportData; itemOffset?: number; itemTotal?: number } | null>(null); const [error, setError] = useState("");
  const cursor = useRef<{ runId: string; items: ImportReportData["items"] }>({ runId: "", items: [] }); const loading = useRef(false);
  const load = async () => {
    if (loading.current) return; loading.current = true;
    try {
      const result = await accountRequest<NonNullable<typeof data>>(`/api/google/status?after=${cursor.current.items.length}&runId=${encodeURIComponent(cursor.current.runId)}`);
      if (result.report) {
        const old = cursor.current;
        const items = result.runId === old.runId && result.itemOffset === old.items.length ? result.report.items.length ? [...old.items, ...result.report.items] : old.items : result.report.items;
        cursor.current = { runId: result.runId ?? "", items }; result.report = { ...result.report, items };
      }
      setData(result); setError("");
    } catch (error) { setError((error as Error).message); } finally { loading.current = false; }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (data?.runId && ["done", "partial"].includes(data.status ?? "")) void useLibrary.getState().load(); }, [data?.runId, data?.status]);
  useEffect(() => {
    const backlog = (data?.itemTotal ?? 0) > (data?.report?.items.length ?? 0);
    if (data?.status !== "running" && !backlog) return;
    const timer = setInterval(() => void load(), backlog ? 250 : 1000); return () => clearInterval(timer);
  }, [data?.status, data?.itemTotal, data?.report?.items.length]);
  const action = (url: string, body: unknown) => accountRequest(url, body).then(load).catch((e) => setError(e.message));
  return <section className="flex flex-col gap-3 border-t border-line pt-4"><h3 className="text-sm font-semibold">{t.features.google}</h3>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <button type="button" className="button-secondary" onClick={() => void load()}>{t.features.refresh}</button>
    {!data?.connected ? <button type="button" className="button-secondary" onClick={() => void accountRequest<{ url: string }>("/api/google/connect", {}).then((r) => location.assign(r.url)).catch((e) => setError(e.message))}>{t.features.connectGoogle}</button> : <>
      <button type="button" className="button-secondary" onClick={() => void action("/api/google/import", {})}>{data?.report && ["partial", "error"].includes(data.status ?? "") ? t.features.retryImport : t.features.importNow}</button>
      <label className="flex items-center gap-2"><input type="checkbox" checked={data.autoSync} onChange={(e) => void action("/api/google/sync", { enabled: e.target.checked })} />{t.features.dailySync}</label>
      <button type="button" className="button-secondary" onClick={() => void action("/api/google/disconnect", {})}>{t.features.disconnectGoogle}</button>
    </>}
    {data?.status === "running" && <div role="status" className="flex flex-col gap-2 text-sm text-fg-2">
      <p>{data.report?.progress?.phase === "fetching" ? t.features.fetchingLibrary : t.features.matchingTracks}</p>
      <p>{t.features.progress}: {data.report?.progress?.processed ?? 0} / {data.report?.progress?.total ?? "—"}</p>
      {data.report?.progress?.lastCompleted && <p className="break-words">{data.report.progress.lastCompleted.status === "matched" ? t.features.matchPending : data.report.progress.lastCompleted.status === "needs-review" ? t.features.reviewNeeded : data.report.progress.lastCompleted.status === "not-found" ? t.features.notFound : data.report.progress.lastCompleted.status === "already-present" ? t.features.already : t.features.imported}: {data.report.progress.lastCompleted.title}</p>}
      {data.report?.progress?.current && <p className="break-words">{data.report.progress.current}</p>}
    </div>}
    {data?.report && <ImportReport report={data.report} identity={data.runId ?? "latest"} />}
  </section>;
}
