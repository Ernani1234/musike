import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { accountRequest } from "../stores/session";
import { useLibrary } from "../stores/library";
import { Modal } from "./Modal";
interface Report { id: string; status: string; destination: string | null; summary: { title: string; processed: number; total: number; added: number; already: number; skipped: number; failed: number; capped: boolean };
  entries: { position: number; title: string; status: string }[]; }
const input = "h-11 w-full rounded-full bg-surface-1 px-4 text-sm ring-1 ring-line-strong";
export function PlaylistImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT(); const c = t.collaboration; const playlists = useLibrary(s => s.playlists);
  const [url, setUrl] = useState(""); const [destination, setDestination] = useState(""); const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!open) return; let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const next = await accountRequest<Report | null>(report ? `/api/playlist-imports/${report.id}?offset=${offset}` : "/api/playlist-imports");
        if (!stopped) { setReport(next); if (next && !["running", "queued"].includes(next.status)) await useLibrary.getState().load(); }
      } catch (e) { if (!stopped) setError((e as Error).message); }
      finally { if (!stopped && (!report || ["running", "queued"].includes(report.status))) timer = setTimeout(() => void poll(), 2000); }
    }; void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [open, report?.id, report?.status, offset]);
  const act = async (path: string, body: unknown) => { setBusy(true); setError(""); try { const result = await accountRequest<{ id?: string }>(path, body); if (result.id) { const next = await accountRequest<Report>(`/api/playlist-imports/${result.id}`); setOffset(0); setReport(next); } } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const active = report && ["running", "queued"].includes(report.status);
  return <Modal open={open} onClose={onClose} title={t.offline.importTitle}><div className="flex min-w-0 flex-col gap-3">
    <label className="flex flex-col gap-2 text-sm">{t.offline.url}<input type="url" className={input} value={url} onChange={e => setUrl(e.target.value)} /></label>
    <label className="flex flex-col gap-2 text-sm">{t.offline.destination}<select className={input} value={destination} onChange={e => setDestination(e.target.value)}><option value="">{t.offline.newPlaylist}</option>{playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <button type="button" className="button-secondary" disabled={busy || !!active || !url} onClick={() => void act("/api/playlist-imports", { url, destination: destination || undefined })}>{t.offline.startImport}</button>
    {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    {report && <><h3 className="font-medium">{report.summary.title}</h3><p className="text-sm" role="status">{c.status[report.status as keyof typeof c.status] ?? report.status} · {report.summary.processed}/{report.summary.total}</p>
      <p className="text-sm text-fg-2">{t.features.imported}: {report.summary.added} · {t.features.already}: {report.summary.already} · {c.skipped}: {report.summary.skipped} · {c.failed}: {report.summary.failed}</p>
      {report.summary.capped && <p className="text-sm text-fg-2">{c.importCapped}</p>}
      <ul className="scroll-area max-h-64 overflow-auto text-sm">{report.entries.map(e => <li key={e.position} className="flex flex-wrap justify-between gap-2 border-b border-line py-2 break-words"><span>{e.position + 1}. {e.title}</span><span className="text-fg-2">{c.status[e.status as keyof typeof c.status] ?? e.status}</span></li>)}</ul>
      <div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 100))}>{c.previous}</button><button type="button" className="button-secondary" disabled={offset + 100 >= report.summary.total} onClick={() => setOffset(offset + 100)}>{c.next}</button>
        <button type="button" className="button-secondary" disabled={busy} onClick={() => void act(`/api/playlist-imports/${report.id}/${active ? "cancel" : "resume"}`, {})}>{active ? t.common.cancel : c.resume}</button></div>
    </>}
  </div></Modal>;
}
