import { playbackStage } from "./playbackDiagnostics.js";
import { mkdir, rename, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { ensureComponent } from "./bootstrap.js";
import { config } from "./config.js";
import { DEFAULT_CLIENTS, directAudio, fetchRemoteClients } from "./directAudio.js";
import { tools } from "./tools.js";
import { msg } from "./i18n.js";
import { HttpError } from "./types.js";
import { trimCache, mutateCache } from "./cacheBudget.js";
import { ProcessError, runProcess, stopProcesses } from "./process.js";
import { QueueError, TaskQueue, waitForSignal } from "./taskQueue.js";

export interface StreamFormat {
  formatId: string;
  url: string;
  headers: Record<string, string>;
  mime: string;
}

export interface Resolved {
  id: string;
  title: string;
  duration: number;
  audio: StreamFormat;
  video?: StreamFormat;
  expiresAt: number;
}

interface RawFormat {
  format_id: string;
  url?: string;
  ext: string;
  acodec?: string;
  vcodec?: string;
  height?: number;
  abr?: number;
  protocol?: string;
  http_headers?: Record<string, string>;
}

const RESOLVE_TIMEOUT_MS = 45_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const processes = new TaskQueue(3, 32, 30_000);
const hdJobs = new TaskQueue(2, 8, 30_000);
let closing = false;

let maintenance: Promise<unknown> | null = null;

/** While yt-dlp is being updated or installed, new runs wait instead of racing the executable swap. */
export function holdDuring<T>(job: Promise<T>): Promise<T> {
  const p = job.finally(() => {
    if (maintenance === p) maintenance = null;
  });
  maintenance = p;
  return p;
}

async function run(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const queued = Date.now(); playbackStage("resolve.queued");
  try {
    return await processes.run(async () => {
      playbackStage("resolve.start", { ms: Date.now() - queued });
      if (maintenance) await maintenance.catch(() => {});
      if (closing) throw new QueueError("closed");
      const { ytdlp, env } = tools();
      if (!ytdlp) throw new HttpError(503, msg("ytdlpMissing"), "tool_missing");
      const result = await runProcess(ytdlp, [...config.ytdlpExtraArgs, ...args], env, timeoutMs, undefined, signal);
      playbackStage("resolve.complete", { ms: Date.now() - queued, status: result.code ?? 1 });
      if (result.code !== 0) throw toHttpError(result.stderr);
      return result.stdout;
    }, signal);
  } catch (err) {
    if (signal?.aborted || err instanceof ProcessError && err.reason === "cancelled") throw new DOMException("Aborted", "AbortError");
    if (err instanceof QueueError || (err instanceof ProcessError && err.reason === "shutdown")) {
      throw new HttpError(503, msg("serverBusy"), "server_busy");
    }
    if (err instanceof ProcessError) {
      if (err.reason === "timeout") throw new HttpError(504, msg("ytdlpTimeout"));
      if (err.reason === "output") throw new HttpError(502, msg("ytdlpOutputLimit"));
      throw new HttpError(503, msg("ytdlpCantRun", { error: err.message }), "tool_missing");
    }
    throw err;
  }
}

export function shutdownMedia() {
  closing = true;
  hdJobs.close();
  processes.close();
  stopProcesses();
}

// Failures that usually mean YouTube changed and yt-dlp needs an update.
const OUTDATED = /nsig|signature|n challenge|JavaScript runtime|Unable to extract|Failed to extract|player response|Requested format is not available|HTTP Error 403/i;

function toHttpError(stderr: string): HttpError {
  const line = stderr.split("\n").find((l) => l.includes("ERROR")) ?? stderr.trim().split("\n").pop() ?? "";
  if (/confirm you.re not a bot|Sign in to confirm/i.test(line)) {
    return new HttpError(503, msg("botCheck"), "bot_check");
  }
  if (/Video unavailable|video is unavailable|Private video|removed/i.test(line)) {
    return new HttpError(404, msg("videoUnavailable"));
  }
  if (/age-restricted|inappropriate|confirm your age/i.test(line)) {
    return new HttpError(403, msg("ageRestricted"));
  }
  // yt-dlp's own words stay as they are (English); only the advice around them is translated.
  const detail = line.replace(/^ERROR:\s*/, "").slice(0, 240);
  if (!detail) return new HttpError(502, msg("ytdlpFailed"), "maybe_outdated");
  if (OUTDATED.test(stderr)) return new HttpError(502, msg("ytdlpOutdated", { detail }), "maybe_outdated");
  return new HttpError(502, detail, "maybe_outdated");
}

/** Forget resolved stream URLs, e.g. after updating yt-dlp so the next play uses the new version. */
export function clearResolved() {
  resolvedAt.clear();
}

const isAudioOnly = (f: RawFormat) => !!f.url && f.vcodec === "none" && !!f.acodec && f.acodec !== "none";
const isMuxed = (f: RawFormat) => !!f.url && !!f.vcodec && f.vcodec !== "none" && !!f.acodec && f.acodec !== "none";
const isHttps = (f: RawFormat) => !f.protocol || f.protocol === "https";

function toStream(f: RawFormat, kind: "audio" | "video"): StreamFormat {
  const mime = kind === "audio" ? (f.ext === "webm" ? "audio/webm" : "audio/mp4") : "video/mp4";
  return { formatId: f.format_id, url: f.url!, headers: f.http_headers ?? {}, mime };
}

function pickAudio(formats: RawFormat[]): RawFormat | undefined {
  const audio = formats.filter((f) => isAudioOnly(f) && isHttps(f));
  // AAC in MP4 plays everywhere, including iOS Safari. Opus/WebM is the fallback.
  if (config.audioQuality === "high") return audio.filter((f) => f.ext === "m4a").sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))[0] ?? audio.sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))[0];
  return (
    audio.find((f) => f.format_id === "140") ??
    audio.filter((f) => f.ext === "m4a").sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))[0] ??
    audio.sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))[0]
  );
}

function pickVideo(formats: RawFormat[]): RawFormat | undefined {
  const muxed = formats.filter((f) => isMuxed(f) && isHttps(f) && f.ext === "mp4");
  return muxed.find((f) => f.format_id === "18") ?? muxed.sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
}

function expiryOf(url: string): number {
  const expire = Number(new URL(url).searchParams.get("expire"));
  const fallback = Date.now() + 4 * 3600_000;
  // Refresh 10 minutes before googlevideo URLs expire.
  return Number.isFinite(expire) && expire > 0 ? expire * 1000 - 10 * 60_000 : fallback;
}

const cache = new Map<string, { work: Promise<Resolved>; controller: AbortController; consumers: Set<symbol> }>();
const resolvedAt = new Map<string, Resolved>();
const RESOLVED_LIMIT = 200;

// When yt-dlp fails, the clients to ask YouTube directly (see directAudio.ts), refreshed from the repository.
// Read lazily: directAudio.ts and this module import each other through search.ts.
let directClients: string[] | null = null;
let directClientsAt = 0;

let clientsRefresh: Promise<void> | null = null;
export async function clientsForDirect(): Promise<string[]> {
  // The published client list is advisory. A cold song must not wait for its network refresh.
  if (Date.now() - directClientsAt > 6 * 3600_000 && !clientsRefresh) {
    directClientsAt = Date.now();
    clientsRefresh = fetchRemoteClients().then((clients) => { directClients = clients ?? directClients; }).finally(() => { clientsRefresh = null; });
  }
  return directClients ?? DEFAULT_CLIENTS;
}

/** Try immediately; if a stale/default client fails, wait for the one coalesced advisory refresh and retry changed clients once. */
export async function resolveDirectAudio(id: string, signal?: AbortSignal, resolver = directAudio) {
  const clients = await clientsForDirect();
  try { return await resolver(id, clients, undefined, signal); }
  catch (error) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (clientsRefresh) await (signal ? waitForSignal(clientsRefresh, signal) : clientsRefresh);
    const fresh = directClients ?? DEFAULT_CLIENTS;
    if (fresh.join("|") === clients.join("|")) throw error;
    return resolver(id, fresh, undefined, signal);
  }
}

/**
 * Plan B for audio: YouTube's bot check stops yt-dlp on some connections (VPNs, shared networks), and a YouTube
 * change can break it until it's updated. Asking YouTube for the audio directly often still works. Video stays
 * yt-dlp's job.
 */
async function resolveDirect(id: string, ytdlpError: unknown, signal?: AbortSignal): Promise<Resolved> {
  if (ytdlpError instanceof HttpError && ytdlpError.code === "server_busy") throw ytdlpError;
  // Removed, private or age-restricted videos won't play any other way either.
  if (ytdlpError instanceof HttpError && (ytdlpError.status === 403 || ytdlpError.status === 404)) throw ytdlpError;
  try {
    const direct = await resolveDirectAudio(id, signal);
    return {
      id,
      title: direct.title,
      duration: direct.duration,
      audio: { formatId: "direct", url: direct.url, headers: {}, mime: direct.mime },
      expiresAt: direct.expiresAt - 10 * 60_000,
    };
  } catch {
    throw ytdlpError; // yt-dlp's error says more, and may offer the update
  }
}

export async function resolveStreams(id: string, signal?: AbortSignal): Promise<Resolved> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const done = resolvedAt.get(id);
  if (done && done.expiresAt > Date.now()) return Promise.resolve(done);
  let inflight = cache.get(id);
  if (inflight?.controller.signal.aborted) { await inflight.work.catch(() => {}); return resolveStreams(id, signal); }
  if (!inflight) {
  const controller = new AbortController();
  const job = run(["-J", "--no-playlist", "--no-warnings", `https://www.youtube.com/watch?v=${id}`], RESOLVE_TIMEOUT_MS, controller.signal)
    .then((stdout): Resolved => {
      const info = JSON.parse(stdout) as { title: string; duration?: number; formats: RawFormat[] };
      const audio = pickAudio(info.formats);
      if (!audio) throw new HttpError(404, msg("noAudio"));
      const video = pickVideo(info.formats);
      return {
        id,
        title: info.title,
        duration: info.duration ?? 0,
        audio: toStream(audio, "audio"),
        video: video ? toStream(video, "video") : undefined,
        expiresAt: expiryOf(audio.url!),
      };
    })
    .catch((err) => { if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError"); return resolveDirect(id, err, controller.signal); })
    .then((resolved) => {
      for (const [key, value] of resolvedAt) if (value.expiresAt <= Date.now()) resolvedAt.delete(key);
      if (resolvedAt.size >= RESOLVED_LIMIT) resolvedAt.delete(resolvedAt.keys().next().value!);
      resolvedAt.set(id, resolved);
      return resolved;
    })
    .finally(() => { if (cache.get(id)?.controller === controller) cache.delete(id); });
  inflight = { work: job, controller, consumers: new Set() }; cache.set(id, inflight);
  }
  const consumer = Symbol(); inflight.consumers.add(consumer);
  try { return await (signal ? waitForSignal(inflight.work, signal) : inflight.work); }
  finally { inflight.consumers.delete(consumer); if (!inflight.consumers.size) inflight.controller.abort(); }
}

export function invalidate(id: string) {
  resolvedAt.delete(id);
}

const downloads = new Map<string, Promise<string>>();

let pruning: Promise<void> | null = null;
/** Shared audio/video budget and active-playback leases. */
export function pruneCache(): Promise<void> {
  pruning ??= trimCache().finally(() => { pruning = null; });
  return pruning;
}

/** Downloads and merges a 720p H.264 + AAC MP4 into the cache, for HD video playback with seeking. */
export function downloadHd(id: string): Promise<string> {
  const file = path.join(config.cacheDir, `${id}.720.mp4`);
  const inflight = downloads.get(id);
  if (inflight) return inflight;

  const tmp = path.join(config.cacheDir, `${id}.720.part.mp4`);
  // Merging video + audio needs FFmpeg; the desktop app fetches it on first use if it isn't there yet.
  const fetchFile = () => (tools().ffmpeg || !config.binDir ? Promise.resolve() : ensureComponent("ffmpeg"))
    .then(() => mkdir(config.cacheDir, { recursive: true }))
    .then(() =>
      run(
        [
          "--no-playlist",
          "--no-warnings",
          "--no-part",
          "-N", "4",
          "-f", "bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4][height<=720]/bv*[height<=720]+ba",
          "--merge-output-format", "mp4",
          "-o", tmp,
          `https://www.youtube.com/watch?v=${id}`,
        ],
        DOWNLOAD_TIMEOUT_MS,
      ),
    )
    .then(async () => {
      await mutateCache(() => rename(tmp, file));
      pruneCache().catch(() => {});
      return file;
    })
    .catch(async (err) => {
      await rm(tmp, { force: true });
      throw err;
    });

  const job = (async () => {
    try {
      await stat(file);
      const now = new Date();
      await utimes(file, now, now).catch(() => {});
      return file;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    try { return await hdJobs.run(fetchFile); }
    catch (err) {
      if (err instanceof QueueError) throw new HttpError(503, msg("serverBusy"), "server_busy");
      throw err;
    }
  })().finally(() => downloads.delete(id));

  downloads.set(id, job);
  return job;
}

export async function ytdlpSearch(query: string, limit = 20, signal?: AbortSignal) {
  const stdout = await run(["-J", "--flat-playlist", "--no-warnings", `ytsearch${limit}:${query}`], RESOLVE_TIMEOUT_MS, signal);
  const data = JSON.parse(stdout) as {
    entries: { id: string; title: string; duration?: number; channel?: string; uploader?: string }[];
  };
  return data.entries ?? [];
}
