import { mkdir, open, readFile, rename, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { playbackStage } from "./playbackDiagnostics.js";
import { HttpError } from "./types.js";
import { msg } from "./i18n.js";
import { config } from "./config.js";
import { resolveDirectAudio, invalidate, resolveStreams, type StreamFormat } from "./ytdlp.js";
import { TaskQueue, QueueError } from "./taskQueue.js";
import { needWindow, releaseWindow, reserveBytes, releaseBytes, consumeBytes, leaseFile, mutateCache } from "./cacheBudget.js";

type CachedAudio = { file: string; mime: string };
export class BudgetFull extends Error {}
const aborted = () => new DOMException("Aborted", "AbortError");
const check = (signal: AbortSignal) => { if (signal.aborted) throw aborted(); };
export function cancellable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void work.catch(() => {}); return Promise.reject(aborted()); }
  return new Promise((resolve, reject) => {
    const cancel = () => reject(aborted());
    signal.addEventListener("abort", cancel, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

/** Primary and direct fallback are resolved ahead of playback; only a successful complete body is published. */
export type CandidateProvider = (id: string, signal: AbortSignal) => Promise<Iterable<StreamFormat>> | AsyncIterable<StreamFormat>;
export async function* readyCandidates(jobs: Promise<StreamFormat>[], signal: AbortSignal): AsyncGenerator<StreamFormat> {
  const pending = new Map(jobs.map((job, i) => [i, job.then((value) => ({ i, value }), () => ({ i, value: null }))]));
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(45_000)]);
  while (pending.size) {
    const next = await cancellable(Promise.race(pending.values()), deadline); pending.delete(next.i);
    if (next.value) yield next.value;
  }
}
export async function* audioCandidates(id: string, signal: AbortSignal): AsyncGenerator<StreamFormat> {
  const resolve = async (source: "primary" | "direct", work: () => Promise<StreamFormat>) => {
    const started = Date.now(); playbackStage("source.resolve", { videoId: id, source });
    try { const format = await work(); playbackStage("source.resolved", { videoId: id, source, ms: Date.now() - started }); return format; }
    catch (error) { playbackStage("source.resolve_failed", { videoId: id, source, ms: Date.now() - started, reason: signal.aborted ? "cancelled" : "provider" }); throw error; }
  };
  yield* readyCandidates([
    resolve("primary", () => resolveStreams(id, signal).then((result) => result.audio)),
    resolve("direct", () => resolveDirectAudio(id, signal).then((result): StreamFormat => ({ formatId: "fallback", url: result.url, mime: result.mime, headers: {} }))),
  ], signal);
}

/** Race usable first bytes, not just resolved URLs. Never wait for a whole file before cold playback. */
const sourceSelections = new TaskQueue(8, 24, 5000);
export async function openAudioSource(id: string, signal: AbortSignal, candidates: CandidateProvider = audioCandidates,
  transport: typeof fetch = fetch, range?: string, timeoutMs = 20_000) {
  const queued = Date.now(); playbackStage("source.queued", { videoId: id });
  try { return await sourceSelections.run(() => {
    const waiting = Date.now() - queued; playbackStage("source.started", { videoId: id, ms: waiting });
    return raceAudioSource(id, signal, candidates, transport, range, Math.max(1, timeoutMs - waiting));
  }, signal); }
  catch (error) { if (error instanceof QueueError) throw new HttpError(503, msg("serverBusy"), "server_busy"); throw error; }
}
async function raceAudioSource(id: string, signal: AbortSignal, candidates: CandidateProvider = audioCandidates,
  transport: typeof fetch = fetch, range?: string, timeoutMs = 20_000) {
  check(signal); const started = Date.now(); const discovery = new AbortController();
  const controllers = new Set<AbortController>();
  return new Promise<{ format: StreamFormat; response: Response; cancel: () => void }>((resolve, reject) => {
    let settled = false; let enumerated = false; let active = 0;
    const finishError = (error: Error) => {
      if (settled) return; settled = true; clearTimeout(deadline); discovery.abort();
      for (const controller of controllers) controller.abort();
      signal.removeEventListener("abort", cancelled); reject(error);
    };
    const cancelled = () => finishError(aborted());
    const deadline = setTimeout(() => finishError(new HttpError(504, msg("playbackTimeout"))), timeoutMs);
    signal.addEventListener("abort", cancelled, { once: true });
    const failed = () => { if (enumerated && !active && !settled) finishError(new HttpError(502, msg("noAudio"))); };
    const attempt = async (format: StreamFormat) => {
      if (settled || !["audio/mp4", "audio/webm"].includes(format.mime)) return;
      active++; const controller = new AbortController(); controllers.add(controller);
      const firstByteTimer = setTimeout(() => controller.abort(), Math.min(8000, timeoutMs));
      try {
        playbackStage("source.open", { videoId: id, source: format.formatId === "fallback" || format.formatId === "direct" ? "direct" : "primary" });
        const response = await transport(format.url, { headers: { ...format.headers, ...(range ? { Range: range } : {}) },
          signal: AbortSignal.any([signal, controller.signal]) });
        const badType = /text\/html|application\/json/i.test(response.headers.get("content-type") ?? "");
        if ((!response.ok && response.status !== 416) || badType || !response.body && response.status !== 416) {
          await response.body?.cancel(); invalidate(id); throw new Error("refused");
        }
        if (response.status === 416) await response.body?.cancel();
        const reader = response.status === 416 ? undefined : response.body?.getReader();
        const first = response.status === 416 ? null : await reader!.read();
        if (first?.done || first && !first.value.byteLength) { await reader?.cancel(); throw new Error("empty"); }
        clearTimeout(firstByteTimer);
        if (settled) { await reader?.cancel(); controller.abort(); return; }
        settled = true; clearTimeout(deadline); signal.removeEventListener("abort", cancelled); discovery.abort();
        for (const other of controllers) if (other !== controller) other.abort();
        playbackStage("source.first_byte", { videoId: id, ms: Date.now() - started, status: response.status,
          source: format.formatId === "fallback" || format.formatId === "direct" ? "direct" : "primary" });
        let initial = first?.value;
        const body = response.status === 416 ? null : new ReadableStream<Uint8Array>({
          async pull(stream) {
            try {
              if (initial) { stream.enqueue(initial); initial = undefined; return; }
              const next = await cancellable(reader!.read(), AbortSignal.any([signal, AbortSignal.timeout(30_000)]));
              if (next.done) stream.close(); else stream.enqueue(next.value);
            } catch (error) { controller.abort(); await reader?.cancel().catch(() => {}); stream.error(error); }
          },
          async cancel() { controller.abort(); await reader?.cancel().catch(() => {}); },
        });
        resolve({ format, response: new Response(body, { status: response.status, headers: response.headers }), cancel: () => controller.abort() });
      } catch {
        clearTimeout(firstByteTimer); controller.abort();
        playbackStage("source.candidate_failed", { videoId: id, ms: Date.now() - started, reason: signal.aborted ? "cancelled" : "refused_or_timeout" });
      } finally { active--; controllers.delete(controller); failed(); }
    };
    void (async () => {
      try { for await (const format of await candidates(id, AbortSignal.any([signal, discovery.signal]))) {
        if (settled) break; void attempt(format);
      } } catch { /* A successful candidate cancels discovery; otherwise failed() closes the race. */ }
      finally { enumerated = true; failed(); }
    })();
  });
}

export interface AudioSourceOptions { candidates?: CandidateProvider; transport?: typeof fetch; timeoutMs?: number; }

export class AudioCache {
  private jobs = new TaskQueue(2, 16, 30_000);
  private windows = new Map<string, { controller: AbortController; signature: string; blocked: boolean; budget: number; revision: number; retryAt: number }>();
  private inflight = new Map<string, { controller: AbortController; consumers: Set<symbol>; work: Promise<CachedAudio> }>();
  constructor(private candidates: CandidateProvider = audioCandidates, private transport: typeof fetch = fetch,
    private debug: (message: string) => void = () => {}) {}
  async find(id: string): Promise<CachedAudio | null> {
    const file = path.join(config.cacheDir, `${id}.audio.bin`);
    try {
      const meta = JSON.parse(await readFile(file.replace(/\.bin$/, ".json"), "utf8")) as { mime: string; size: number };
      const info = await stat(file);
      if (info.size !== meta.size || !["audio/mp4", "audio/webm"].includes(meta.mime)) return null;
      const now = new Date(); await utimes(file, now, now).catch(() => {});
      return { file, mime: meta.mime };
    } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT" || e instanceof SyntaxError) return null; throw e; }
  }
  async ensure(id: string, signal: AbortSignal): Promise<CachedAudio> {
    check(signal);
    const hit = await this.find(id); check(signal); if (hit) { playbackStage("prepare.hit", { videoId: id, warm: true }); return hit; }
    let job = this.inflight.get(id);
    if (job?.controller.signal.aborted) {
      await job.work.catch(() => {}); check(signal); return this.ensure(id, signal);
    }
    if (!job) {
      const controller = new AbortController();
      playbackStage("prepare.queued", { videoId: id });
      const work = this.jobs.run(async () => { check(controller.signal); return this.download(id, controller.signal); }, controller.signal)
        .finally(() => { if (this.inflight.get(id)?.controller === controller) this.inflight.delete(id); });
      job = { controller, work, consumers: new Set() }; this.inflight.set(id, job);
    }
    const consumer = Symbol(); job.consumers.add(consumer);
    try { return await cancellable(job.work, signal); }
    finally { job.consumers.delete(consumer); if (!job.consumers.size) job.controller.abort(); }
  }
  private async download(id: string, signal: AbortSignal): Promise<CachedAudio> {
    playbackStage("prepare.start", { videoId: id });
    const selected = await openAudioSource(id, signal, this.candidates, this.transport);
    const { format, response } = selected;
    const token = `${id}.${randomUUID()}`;
    const file = path.join(config.cacheDir, `${id}.audio.bin`);
    const tmp = path.join(config.cacheDir, `${token}.part`);
    const meta = `${file.replace(/\.bin$/, ".json")}.${token}.tmp`;
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      if (!response.ok || !response.body) throw new Error("No audio body");
      const length = Number(response.headers.get("content-length"));
      if (length > 0 && !await reserveBytes(token, length + 64, id)) throw new BudgetFull();
      await mkdir(config.cacheDir, { recursive: true }); handle = await open(tmp, "wx");
      const reader = response.body.getReader(); let size = 0;
      try {
        while (true) {
          check(signal); const { done, value } = await cancellable(reader.read(), AbortSignal.any([signal, AbortSignal.timeout(120_000)])); if (done) break;
          if ((!(length > 0) || size + value.byteLength > length) && !await reserveBytes(token, value.byteLength + (size ? 0 : 64), id)) throw new BudgetFull();
          await handle.writeFile(value); size += value.byteLength; await consumeBytes(token, value.byteLength);
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      if (!size || length > 0 && size !== length) throw new Error("Incomplete audio cache body");
      await handle.close(); handle = null;
      const release = leaseFile(file);
      try { await mutateCache(async () => {
        await rename(tmp, file);
        await (await import("node:fs/promises")).writeFile(meta, JSON.stringify({ mime: format.mime, size }));
        await rename(meta, file.replace(/\.bin$/, ".json"));
      }); } finally { release(); }
      playbackStage("prepare.complete", { videoId: id, bytes: size, warm: true });
      return { file, mime: format.mime };
    } finally {
      selected.cancel(); await response.body?.cancel().catch(() => {}); await handle?.close().catch(() => {});
      await rm(tmp, { force: true }); await rm(meta, { force: true }); await releaseBytes(token);
    }
  }
  update(client: string, current: string, upcoming: string[], depth: number, revision?: number) {
    const previous = this.windows.get(client);
    if (revision !== undefined && previous && revision <= previous.revision) return;
    const ids = [...new Set(upcoming)].filter((id) => id !== current).slice(0, depth);
    needWindow(client, [current, ...ids]);
    const signature = [current, ...ids].join("|");
    if (previous?.signature === signature && (!previous.blocked || previous.budget === config.cacheMaxBytes) && Date.now() < previous.retryAt) { previous.revision = revision ?? previous.revision + 1; return; }
    previous?.controller.abort();
    if (!this.windows.has(client) && this.windows.size >= 64) {
      const oldest = this.windows.keys().next().value!; this.windows.get(oldest)?.controller.abort(); this.windows.delete(oldest); releaseWindow(oldest);
    }
    const entry = { controller: new AbortController(), signature, blocked: false, budget: config.cacheMaxBytes, retryAt: Infinity, revision: revision ?? (previous?.revision ?? 0) + 1 };
    this.windows.set(client, entry);
    void (async () => {
      for (const id of ids) {
        try { await this.ensure(id, entry.controller.signal); }
        catch (e) {
          if (e instanceof BudgetFull) { entry.blocked = true; playbackStage("prepare.blocked", { videoId: id, reason: "budget" }); this.debug("Look-ahead stopped at cache budget"); break; }
          if (entry.controller.signal.aborted) break;
          entry.retryAt = Date.now() + 30_000;
          this.debug("Look-ahead item could not be cached");
        }
      }
    })();
  }
  async close() { for (const [client, entry] of this.windows) { entry.controller.abort(); releaseWindow(client); }
    this.windows.clear(); this.jobs.close(); for (const entry of this.inflight.values()) entry.controller.abort();
    await Promise.allSettled([...this.inflight.values()].map((entry) => entry.work)); }
}
