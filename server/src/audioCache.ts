import { mkdir, open, readFile, rename, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { directAudio } from "./directAudio.js";
import { clientsForDirect, invalidate, resolveStreams, type StreamFormat } from "./ytdlp.js";
import { TaskQueue } from "./taskQueue.js";
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
type CandidateProvider = (id: string, signal: AbortSignal) => Promise<Iterable<StreamFormat>> | AsyncIterable<StreamFormat>;
export async function* readyCandidates(jobs: Promise<StreamFormat>[], signal: AbortSignal): AsyncGenerator<StreamFormat> {
  const pending = new Map(jobs.map((job, i) => [i, job.then((value) => ({ i, value }), () => ({ i, value: null }))]));
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(45_000)]);
  while (pending.size) {
    const next = await cancellable(Promise.race(pending.values()), deadline); pending.delete(next.i);
    if (next.value) yield next.value;
  }
}
export async function* audioCandidates(id: string, signal: AbortSignal): AsyncGenerator<StreamFormat> {
  yield* readyCandidates([
    resolveStreams(id).then((r) => r.audio),
    clientsForDirect().then((clients) => directAudio(id, clients)).then((r): StreamFormat => ({ formatId: "fallback", url: r.url, mime: r.mime, headers: {} })),
  ], signal);
}

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
    const hit = await this.find(id); check(signal); if (hit) return hit;
    let job = this.inflight.get(id);
    if (job?.controller.signal.aborted) {
      await job.work.catch(() => {}); check(signal); return this.ensure(id, signal);
    }
    if (!job) {
      const controller = new AbortController();
      const work = this.jobs.run(async () => { check(controller.signal); return this.download(id, controller.signal); }, controller.signal)
        .finally(() => { if (this.inflight.get(id)?.controller === controller) this.inflight.delete(id); });
      job = { controller, work, consumers: new Set() }; this.inflight.set(id, job);
    }
    const consumer = Symbol(); job.consumers.add(consumer);
    try { return await cancellable(job.work, signal); }
    finally { job.consumers.delete(consumer); if (!job.consumers.size) job.controller.abort(); }
  }
  private async download(id: string, signal: AbortSignal): Promise<CachedAudio> {
    const formats = await this.candidates(id, signal);
    for await (const format of formats) {
      check(signal);
      if (!["audio/mp4", "audio/webm"].includes(format.mime)) continue;
      const token = `${id}.${randomUUID()}`;
      const file = path.join(config.cacheDir, `${id}.audio.bin`);
      const tmp = path.join(config.cacheDir, `${token}.part`);
      const meta = `${file.replace(/\.bin$/, ".json")}.${token}.tmp`;
      let handle: Awaited<ReturnType<typeof open>> | null = null;
      try {
        const response = await this.transport(format.url, { headers: format.headers, signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) });
        if (!response.ok || !response.body) { await response.body?.cancel(); continue; }
        const length = Number(response.headers.get("content-length"));
        if (length > 0 && !await reserveBytes(token, length + 64, id)) { await response.body.cancel(); throw new BudgetFull(); }
        await mkdir(config.cacheDir, { recursive: true }); handle = await open(tmp, "wx");
        const reader = response.body.getReader(); let size = 0;
        try {
          while (true) {
            check(signal); const { done, value } = await reader.read(); if (done) break;
            if ((!(length > 0) || size + value.byteLength > length) && !await reserveBytes(token, value.byteLength + (size ? 0 : 64), id)) throw new BudgetFull();
            await handle.writeFile(value); size += value.byteLength;
            // Account by disk from here; the next reservation also sees the partial file.
            await consumeBytes(token, value.byteLength);
          }
        } catch (e) { await reader.cancel().catch(() => {}); throw e; }
        if (!size || (length > 0 && size !== length)) throw new Error("Incomplete audio cache body");
        await handle.close(); handle = null;
        const release = leaseFile(file);
        try {
          await mutateCache(async () => {
            await rename(tmp, file);
            await (await import("node:fs/promises")).writeFile(meta, JSON.stringify({ mime: format.mime, size }));
            await rename(meta, file.replace(/\.bin$/, ".json"));
          });
        } finally { release(); }
        return { file, mime: format.mime };
      } catch (e) {
        if (e instanceof BudgetFull || signal.aborted) throw e;
        invalidate(id);
      } finally { await handle?.close().catch(() => {}); await rm(tmp, { force: true }); await rm(meta, { force: true }); await releaseBytes(token); }
    }
    throw new Error("No cacheable audio stream");
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
          if (e instanceof BudgetFull) { entry.blocked = true; this.debug("Look-ahead stopped at cache budget"); break; }
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
