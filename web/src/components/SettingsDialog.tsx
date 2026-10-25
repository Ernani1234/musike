import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  DownloadSimpleIcon,
  MoonIcon,
  SunIcon,
  TranslateIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LANGUAGES, useI18n, useT, type Lang } from "../i18n";
import { capabilities, type Channel } from "../lib/api";
import { cn } from "../lib/format";
import { useSystem } from "../stores/system";
import { useUi } from "../stores/ui";
import { BackupSection } from "./BackupSection";
import { AccentPicker, LayoutSection } from "./CustomizeSection";
import { Modal } from "./Modal";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, ReactNode][];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-surface-1 p-1 ring-1 ring-line">
      {options.map(([v, content]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium transition-colors duration-200",
            value === v ? "bg-surface-4 text-fg shadow-[inset_0_1px_0_var(--highlight)]" : "text-fg-2 hover:text-fg",
          )}
        >
          {content}
        </button>
      ))}
    </div>
  );
}

function Dependency({ name, role, path, fix }: { name: string; role: string; path: string | null; fix: string }) {
  const t = useT();
  return (
    <li className="flex items-center gap-3 py-2.5" title={path ?? undefined}>
      {path ? (
        <CheckCircleIcon size={20} weight="fill" className="shrink-0 text-accent-text" />
      ) : (
        <WarningCircleIcon size={20} weight="fill" className="shrink-0 text-danger" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{name}</span>
        <span className="block text-xs text-fg-2">
          {path ? (
            role
          ) : (
            <>
              {t.settings.depMissingBefore} <code className="font-mono text-fg">{fix}</code> {t.settings.depMissingAfter}
            </>
          )}
        </span>
      </span>
    </li>
  );
}

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const { info, status, load, update } = useSystem();
  const [channel, setChannel] = useState<Channel>("stable");
  const logBox = useRef<HTMLPreElement>(null);
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (info) setChannel(info.ytdlp.channel);
  }, [info?.ytdlp.channel]);

  const job = info?.job;
  const running = job?.status === "running";

  useEffect(() => {
    logBox.current?.scrollTo({ top: logBox.current.scrollHeight });
  }, [job?.log.length]);

  const y = info?.ytdlp;
  const missing = !!info && !y?.path;
  const switching = !!y?.version && channel !== y.channel;
  const target = y?.latest[channel];

  let action: string;
  if (running) action = job?.kind === "install" ? t.settings.installing : t.settings.updating;
  else if (missing) action = t.settings.install;
  else if (switching) action = channel === "nightly" ? t.settings.toNightly : t.settings.toStable;
  else if (y?.updateAvailable && target) action = t.settings.updateTo(target);
  else action = t.settings.check;

  const chip = !info ? null : missing ? (
    <span className="rounded-full bg-danger/15 px-2.5 py-1 text-xs font-medium text-danger">{t.settings.chipMissing}</span>
  ) : y?.updateAvailable ? (
    <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-text">{t.settings.chipUpdate}</span>
  ) : (
    <span className="rounded-full bg-surface-3 px-2.5 py-1 text-xs font-medium text-fg-2">{t.settings.chipOk}</span>
  );

  return (
    <Modal open={open} onClose={() => setOpen(false)} title={t.settings.title}>
      {/* Side padding keeps outset rings and the scrollbar from clipping the cards' edges. */}
      <div className="scroll-area -mx-2 flex max-h-[70dvh] flex-col gap-5 overflow-y-auto px-2 pb-1">

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-fg-3">{t.settings.appearance}</h3>
          <Segmented
            label={t.settings.theme}
            value={theme}
            onChange={setTheme}
            options={[
              ["dark", <><MoonIcon size={15} /> {t.settings.dark}</>],
              ["light", <><SunIcon size={15} /> {t.settings.light}</>],
            ]}
          />
          <AccentPicker />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-fg-3">
            <TranslateIcon size={14} /> {t.settings.language}
          </h3>
          <Segmented
            label={t.settings.language}
            value={lang}
            onChange={setLang}
            options={LANGUAGES.map(({ id, name }): [Lang, ReactNode] => [id, <span lang={id}>{name}</span>])}
          />
        </section>

        <LayoutSection />

        <BackupSection />

        {capabilities.engineSettings && (
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-medium text-fg-3">{t.settings.engine}</h3>

          <div className="flex flex-col gap-4 rounded-[1rem] bg-surface-1 p-4 ring-1 ring-line">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold tracking-tight">yt-dlp</p>
                <p className="font-mono text-[0.8125rem] text-fg-2 tabular-nums">
                  {status === "loading" && !info ? t.settings.checking : y?.version ?? t.settings.noVersion}
                  {y?.version && <span className="text-fg-3"> · {y.channel === "nightly" ? t.settings.nightly : t.settings.stable}</span>}
                </p>
              </div>
              {chip}
            </div>

            <p className="text-sm text-fg-2">
              {t.settings.engineBody}
            </p>

            {!missing && (
              <div className="flex flex-col gap-1.5">
                <Segmented
                  label={t.settings.channel}
                  value={channel}
                  onChange={setChannel}
                  options={[
                    ["stable", t.settings.stableOption],
                    ["nightly", t.settings.nightlyOption],
                  ]}
                />
                <p className="px-1 text-xs text-fg-3">
                  {channel === "nightly"
                    ? t.settings.nightlyBody + (y?.latest.nightly ? t.settings.latest(y.latest.nightly) : "")
                    : t.settings.stableBody + (y?.latest.stable ? t.settings.latest(y.latest.stable) : "")}
                </p>
              </div>
            )}

            <button
              type="button"
              disabled={running || !info || (missing && !info.canInstall)}
              onClick={() => void update(channel)}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 font-semibold text-accent-ink transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {running ? (
                <ArrowsClockwiseIcon size={20} weight="bold" className="animate-spin" />
              ) : missing ? (
                <DownloadSimpleIcon size={20} weight="bold" />
              ) : (
                <ArrowsClockwiseIcon size={20} weight="bold" />
              )}
              {action}
            </button>

            {missing && info && !info.canInstall && (
              <p className="text-sm text-danger">
                {t.settings.noWinget}
              </p>
            )}

            {job && (job.status === "running" || Date.now() - (job.finishedAt ?? 0) < 5 * 60_000) && (
              <div className="flex flex-col gap-2">
                {job.status !== "running" && (
                  <p className={cn("text-sm font-medium", job.status === "error" ? "text-danger" : "text-accent-text")}>
                    {job.message}
                  </p>
                )}
                <pre
                  ref={logBox}
                  aria-live="polite"
                  className="max-h-36 overflow-y-auto rounded-[0.625rem] bg-bg p-3 font-mono text-[0.6875rem] leading-relaxed whitespace-pre-wrap text-fg-2 scroll-area"
                >
                  {job.log.length ? job.log.join("\n") : t.settings.starting}
                </pre>
              </div>
            )}
          </div>

          {info && (
            <ul className="divide-y divide-line px-1">
              <Dependency name="Deno" role={t.settings.denoRole} path={info.deno} fix="winget install DenoLand.Deno" />
              <Dependency name="FFmpeg" role={t.settings.ffmpegRole} path={info.ffmpeg} fix="winget install yt-dlp.FFmpeg" />
            </ul>
          )}
        </section>
        )}
      </div>
    </Modal>
  );
}
