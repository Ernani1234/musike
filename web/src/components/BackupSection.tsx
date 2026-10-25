import { ArrowsMergeIcon, DownloadSimpleIcon, SwapIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { createBackup, downloadBackup, readBackup, restoreBackup, summarize, type Backup } from "../lib/backup";
import { useT } from "../i18n";
import { cn } from "../lib/format";
import { toast } from "../stores/ui";

type Mode = "merge" | "replace";

/** Export the library to a file and import it in any other Musike (web, desktop, another computer). */
export function BackupSection() {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: Backup; file: string } | null>(null);
  const [mode, setMode] = useState<Mode>("merge");
  const [withSettings, setWithSettings] = useState(true);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const t = useT();

  const onExport = async () => {
    setBusy("export");
    try {
      const backup = await createBackup();
      await downloadBackup(backup);
      const s = summarize(backup);
      toast(t.backup.created(s.playlists, s.favorites));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPending({ backup: await readBackup(file), file: file.name });
      setMode("merge");
      setConfirmReplace(false);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const onImport = async () => {
    if (!pending) return;
    if (mode === "replace" && !confirmReplace) return setConfirmReplace(true);
    setBusy("import");
    try {
      const r = await restoreBackup(pending.backup, mode, withSettings);
      const parts = [
        r.playlistsAdded && t.backup.newPlaylists(r.playlistsAdded),
        r.playlistsMerged && t.backup.updatedPlaylists(r.playlistsMerged),
        r.tracksAdded && t.backup.addedTracks(r.tracksAdded),
        r.favoritesAdded && t.backup.addedFavorites(r.favoritesAdded),
      ].filter((p): p is string => !!p);
      toast(parts.length ? t.backup.imported(parts) : t.backup.nothingNew);
      setPending(null);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const s = pending && summarize(pending.backup);
  const action = "flex h-11 items-center justify-center gap-2 rounded-full text-sm font-medium transition-[transform,background-color] active:scale-[0.98] disabled:opacity-50";

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium text-fg-3">{t.backup.yourData}</h3>
      <p className="text-sm text-fg-2">{t.backup.body}</p>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onExport} disabled={!!busy} className={cn(action, "bg-surface-1 ring-1 ring-line hover:bg-surface-3")}>
          <DownloadSimpleIcon size={18} /> {busy === "export" ? t.backup.exporting : t.backup.export}
        </button>
        <button type="button" onClick={() => input.current?.click()} disabled={!!busy} className={cn(action, "bg-surface-1 ring-1 ring-line hover:bg-surface-3")}>
          <UploadSimpleIcon size={18} /> {t.backup.import}
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label={t.backup.pickFile}
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
      </div>

      {pending && s && (
        <div className="flex flex-col gap-3 rounded-[1rem] bg-surface-1 p-4 ring-1 ring-line">
          <div>
            <p className="truncate text-sm font-medium" title={pending.file}>
              {pending.file}
            </p>
            <p className="text-xs text-fg-2">
              {t.backup.exportedAt(
                s.exportedAt.toLocaleDateString(t.locale),
                s.exportedAt.toLocaleTimeString(t.locale, { hour: "2-digit", minute: "2-digit" }),
              )}
            </p>
          </div>

          <ul className="grid grid-cols-3 gap-2 text-center">
            {[
              ["playlists", s.playlists, t.backup.playlistsWord(s.playlists), t.backup.tracksIn(s.playlistTracks)],
              ["favorites", s.favorites, t.backup.favoritesWord(s.favorites), null],
              ["history", s.history, t.backup.inHistory, null],
            ].map(([key, n, label, sub]) => (
              <li key={key} className="rounded-[0.75rem] bg-surface-2 px-2 py-2.5">
                <span className="block font-mono text-lg font-semibold tabular-nums">{n}</span>
                <span className="block text-xs text-fg-2">{label}</span>
                {sub && <span className="block text-[0.6875rem] text-fg-3">{sub}</span>}
              </li>
            ))}
          </ul>

          <div role="radiogroup" aria-label={t.backup.howToImport} className="grid gap-2">
            {(
              [
                ["merge", ArrowsMergeIcon, t.backup.mergeTitle, t.backup.mergeBody],
                ["replace", SwapIcon, t.backup.replaceTitle, t.backup.replaceBody],
              ] as const
            ).map(([value, Icon, title, body]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => {
                  setMode(value);
                  setConfirmReplace(false);
                }}
                className={cn(
                  "flex items-start gap-3 rounded-[0.75rem] p-3 text-left ring-1 transition-colors",
                  mode === value ? "bg-accent-soft ring-accent/50" : "ring-line hover:bg-surface-2",
                )}
              >
                <Icon size={20} className={cn("mt-0.5 shrink-0", mode === value ? "text-accent-text" : "text-fg-2")} />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs text-fg-2">{body}</span>
                </span>
              </button>
            ))}
          </div>

          {pending.backup.settings && (
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-fg-2">
              <input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} className="size-4 accent-[var(--accent)]" />
              {t.backup.applySettings}
            </label>
          )}

          {confirmReplace && (
            <p role="alert" className="text-sm text-danger">
              {t.backup.confirmReplace}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPending(null)} className="h-11 rounded-full px-5 text-sm font-medium text-fg-2 hover:text-fg">
              {t.common.cancel}
            </button>
            <button
              type="button"
              disabled={busy === "import"}
              onClick={() => void onImport()}
              className={cn(
                "h-11 rounded-full px-6 text-sm font-semibold transition-transform active:scale-[0.97] disabled:opacity-50",
                mode === "replace" ? "bg-danger text-white" : "bg-accent text-accent-ink",
              )}
            >
              {busy === "import" ? t.backup.importing : mode === "replace" ? (confirmReplace ? t.backup.replaceNow : t.backup.replace) : t.backup.import}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
