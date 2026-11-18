import { spawn } from "node:child_process";
import { downloads, ensureEssentials } from "./bootstrap.js";
import { config } from "./config.js";
import { refreshTools, tools } from "./tools.js";
import { msg, tr, type Lang, type Text } from "./i18n.js";
import { HttpError } from "./types.js";
import { clearResolved, holdDuring } from "./ytdlp.js";

export type Channel = "stable" | "nightly";

export interface Job {
  kind: "update" | "install";
  channel: Channel;
  status: "running" | "done" | "error";
  startedAt: number;
  finishedAt?: number;
  from: string | null;
  to: string | null;
  message: Text;
  /** Tool output as it came, plus Musike's own lines (translated when sent). */
  log: Text[];
}

const RELEASES: Record<Channel, string> = {
  stable: "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest",
  nightly: "https://api.github.com/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest",
};

let version: string | null | undefined;
let job: Job | null = null;
const latest = new Map<Channel, { tag: string | null; at: number }>();

/** Runs a command and streams its output lines into `onLine`. Resolves with the exit code. */
function stream(cmd: string, args: string[], onLine: (line: string) => void, timeoutMs: number): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, env: tools().env });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const feed = (chunk: Buffer) =>
      chunk
        .toString()
        .split(/\r?\n|\r/)
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach(onLine);
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("error", (err) => {
      clearTimeout(timer);
      onLine(err.message);
      resolve(-1);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? -1);
    });
  });
}

async function readVersion(): Promise<string | null> {
  const { ytdlp } = tools();
  if (!ytdlp) return null;
  let out = "";
  const code = await stream(ytdlp, ["--version"], (l) => (out ||= l), 20_000);
  return code === 0 && out ? out : null;
}

async function latestTag(channel: Channel): Promise<string | null> {
  const cached = latest.get(channel);
  if (cached && Date.now() - cached.at < 30 * 60_000) return cached.tag;
  try {
    const res = await fetch(RELEASES[channel], {
      headers: { "user-agent": "musike", accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000),
    });
    const tag = res.ok ? (((await res.json()) as { tag_name?: string }).tag_name ?? null) : null;
    latest.set(channel, { tag, at: Date.now() });
    return tag;
  } catch {
    return cached?.tag ?? null;
  }
}

/** Compares dotted numeric versions like 2026.08.19 and 2026.10.10.232345. */
function newer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

/** A job as the app shows it: its messages in `lang`. */
export function presentJob(job: Job, lang: Lang) {
  return { ...job, message: tr(lang, job.message), log: job.log.map((line) => tr(lang, line)) };
}

export async function systemInfo(lang: Lang) {
  const t = tools();
  // Re-read when yt-dlp showed up since the last check (e.g. downloaded on first launch).
  if (version === undefined || (version === null && t.ytdlp)) version = await readVersion();
  const channel: Channel = version && version.split(".").length > 3 ? "nightly" : "stable";
  const [stable, nightly] = await Promise.all([latestTag("stable"), latestTag("nightly")]);
  const target = channel === "nightly" ? nightly : stable;
  return {
    ytdlp: {
      path: t.ytdlp,
      version,
      channel,
      latest: { stable, nightly },
      updateAvailable: !!(version && target && newer(target, version)),
    },
    deno: t.deno,
    ffmpeg: t.ffmpeg,
    canInstall: !!t.winget || !!config.binDir,
    downloads: downloads(lang),
    job: job && presentJob(job, lang),
  };
}

export function startJob(channel: Channel) {
  if (job?.status === "running") return job;
  const t = tools();
  const kind: Job["kind"] = t.ytdlp ? "update" : "install";
  if (kind === "install" && !t.winget && !config.binDir) {
    throw new HttpError(400, msg("noWinget"));
  }

  const current: Job = {
    kind,
    channel,
    status: "running",
    startedAt: Date.now(),
    from: version ?? null,
    to: null,
    message: msg(kind === "install" ? "installingYtdlp" : "updatingYtdlp"),
    log: [],
  };
  job = current;
  const log = (line: Text) => {
    current.log = [...current.log, line].slice(-40);
  };

  const work = async () => {
    let code: number;
    if (kind === "update") {
      code = await stream(t.ytdlp!, ["--update-to", channel], log, 5 * 60_000);
      // Builds that can't self-update (e.g. installed by a package manager) fall back to winget.
      if (code !== 0 && t.winget) {
        log(msg("directUpdateFailed"));
        code = await stream(t.winget, wingetArgs("upgrade"), log, 10 * 60_000);
      }
    } else if (config.binDir) {
      // Desktop app: download the official builds into Musike's own folder (no admin, no winget).
      log(msg("downloadingTools"));
      code = await ensureEssentials().then(
        () => 0,
        (err: Error) => (log(err instanceof HttpError ? err.text : err.message), 1),
      );
    } else {
      code = await stream(t.winget!, wingetArgs("install"), log, 10 * 60_000);
    }

    await refreshTools();
    version = await readVersion();
    clearResolved();
    current.to = version;
    current.finishedAt = Date.now();
    if (version && (code === 0 || current.from !== version)) {
      current.status = "done";
      current.message = msg(current.from === version ? "alreadyLatest" : "ytdlpReady", { version });
    } else {
      current.status = "error";
      // The tool's own error line says the most; Musike's lines are never errors.
      current.message = current.log.findLast((l) => typeof l === "string" && /error|failed/i.test(l)) ?? msg("updateFailed");
    }
  };

  void holdDuring(work().catch((err: Error) => {
    current.status = "error";
    current.finishedAt = Date.now();
    current.message = err instanceof HttpError ? err.text : err.message;
  }));
  return current;
}

/**
 * YTDLP_CHANNEL: yt-dlp on that channel, updated now and then every `everyMs`. Logs only what changed or failed.
 * Returns a function that stops it.
 */
export function keepChannel(channel: Channel, everyMs = 24 * 60 * 60_000, firstDelayMs = 5_000): () => void {
  const run = async () => {
    try {
      // Known before the job starts, so an update that changes nothing logs nothing.
      if (version === undefined || (version === null && tools().ytdlp)) version = await readVersion();
      const current = startJob(channel);
      while (current.status === "running") await new Promise((r) => setTimeout(r, 1000));
      if (current.status === "error") console.warn(`  yt-dlp: couldn't update to ${channel}: ${tr("en", current.message)}`);
      else if (current.from !== current.to) console.log(`  yt-dlp: ${current.from ?? "none"} -> ${current.to} (${channel})`);
    } catch (err) {
      console.warn(`  yt-dlp: couldn't update to ${channel}: ${err instanceof HttpError ? tr("en", err.text) : (err as Error).message}`);
    }
  };
  const first = setTimeout(run, firstDelayMs);
  const daily = setInterval(run, everyMs);
  first.unref();
  daily.unref();
  return () => {
    clearTimeout(first);
    clearInterval(daily);
  };
}

const wingetArgs = (verb: "install" | "upgrade") => [
  verb,
  "--id",
  "yt-dlp.yt-dlp",
  "--exact",
  "--silent",
  "--accept-source-agreements",
  "--accept-package-agreements",
  "--disable-interactivity",
];
