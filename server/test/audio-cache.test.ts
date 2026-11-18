import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { AudioCache, BudgetFull, readyCandidates } from "../src/audioCache.js";
import { cacheUsage, leaseFile, needWindow, releaseWindow, acquireFileLease, mutateCache, trimCache } from "../src/cacheBudget.js";
import { readFile, writeFile } from "node:fs/promises";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";

const format = { formatId: "test", url: "https://media.invalid/audio", mime: "audio/mp4", headers: {} };
const id = (n: number) => String(n).padStart(11, "0");
const pause = () => new Promise<void>((r) => setImmediate(r));

test("warm audio bytes survive URL expiry and primary refusal falls back before switching", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-audio-"));
  const previous = { cacheDir: config.cacheDir, cacheMaxBytes: config.cacheMaxBytes };
  config.cacheDir = dir; config.cacheMaxBytes = 4096;
  let resolves = 0; let fetches = 0;
  const cache = new AudioCache(async () => { resolves++; return [format, { ...format, url: "https://media.invalid/fallback" }]; },
    (async (url) => { fetches++; return String(url).endsWith("fallback") ? new Response("cached audio", { headers: { "content-length": "12" } }) : new Response(null, { status: 403 }); }) as typeof fetch);
  try {
    const cached = await cache.ensure(id(1), new AbortController().signal);
    assert.equal((await cache.find(id(1)))?.file, cached.file);
    await cache.ensure(id(1), new AbortController().signal);
    assert.equal(resolves, 1); assert.equal(fetches, 2);
    assert.ok((await cacheUsage()).bytes <= config.cacheMaxBytes);
  } finally { await cache.close(); Object.assign(config, previous); await rm(dir, { recursive: true, force: true }); }
});

test("audio shares budget with HD files, protects leases and stops without re-download thrash", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-budget-"));
  const previous = { cacheDir: config.cacheDir, cacheMaxBytes: config.cacheMaxBytes };
  config.cacheDir = dir; config.cacheMaxBytes = 400;
  let fetches = 0;
  const cache = new AudioCache(async () => [format], (async () => { fetches++; return new Response("x".repeat(200), { headers: { "content-length": "200" } }); }) as typeof fetch);
  await writeFile(path.join(dir, `${id(9)}.720.mp4`), "h".repeat(64));
  const releaseHd = leaseFile(path.join(dir, `${id(9)}.720.mp4`));
  needWindow("test", [id(0), id(1), id(2), id(3)]);
  try {
    const first = await cache.ensure(id(1), new AbortController().signal);
    const release = leaseFile(first.file);
    await assert.rejects(cache.ensure(id(2), new AbortController().signal), BudgetFull);
    release();
    assert.ok(await cache.find(id(1)));
    assert.ok((await cacheUsage()).bytes <= 400);
    cache.update("client", id(0), [id(1), id(2), id(3)], 3);
    for (let i = 0; i < 30; i++) await pause();
    const before = fetches;
    cache.update("client", id(0), [id(1), id(2), id(3)], 3);
    for (let i = 0; i < 5; i++) await pause();
    assert.equal(fetches, before);
  } finally { releaseHd(); releaseWindow("test"); await cache.close(); Object.assign(config, previous); await rm(dir, { recursive: true, force: true }); }
});

test("replacing a rapid-skip window aborts stale downloads and limits future IDs", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-cancel-"));
  const previous = { cacheDir: config.cacheDir, cacheMaxBytes: config.cacheMaxBytes };
  config.cacheDir = dir; config.cacheMaxBytes = 4096;
  const requested: string[] = []; let cancelled = false;
  let started!: () => void; const starting = new Promise<void>((r) => { started = r; });
  const cache = new AudioCache(async (track) => { requested.push(track); return [{ ...format, url: `https://media.invalid/${track}` }]; },
    (async (url, init) => {
      if (String(url).endsWith(id(1))) return new Promise<Response>((_yes, no) => { started(); init!.signal!.addEventListener("abort", () => { cancelled = true; no(new DOMException("Aborted", "AbortError")); }); });
      return new Response("warm", { headers: { "content-length": "4" } });
    }) as typeof fetch);
  try {
    cache.update("client", id(0), [id(1), id(2), id(3)], 1);
    await starting;
    cache.update("client", id(4), [id(5), id(6)], 1);
    for (let i = 0; i < 50 && !await cache.find(id(5)); i++) await pause();
    assert.equal(cancelled, true);
    assert.ok(await cache.find(id(5)));
    assert.deepEqual(requested, [id(1), id(5)]);
  } finally { await cache.close(); Object.assign(config, previous); await rm(dir, { recursive: true, force: true }); }
});


test("the direct candidate becomes usable without waiting for a slow wrapper", async () => {
  let finish!: (value: typeof format) => void;
  const slow = new Promise<typeof format>((resolve) => { finish = resolve; });
  const controller = new AbortController();
  const iterator = readyCandidates([slow, Promise.resolve({ ...format, formatId: "direct" })], controller.signal);
  assert.equal((await iterator.next()).value?.formatId, "direct");
  finish(format); assert.equal((await iterator.next()).value?.formatId, "test");
  assert.equal((await iterator.next()).done, true);
});

test("out-of-order queue requests cannot replace a newer skip window", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-revision-"));
  const previous = { cacheDir: config.cacheDir, cacheMaxBytes: config.cacheMaxBytes };
  config.cacheDir = dir; config.cacheMaxBytes = 4096;
  const requested: string[] = [];
  const cache = new AudioCache(async (track) => { requested.push(track); return [format]; },
    (async () => new Response("warm", { headers: { "content-length": "4" } })) as typeof fetch);
  try {
    cache.update("client", id(4), [id(5)], 1, 20);
    cache.update("client", id(0), [id(1)], 1, 19);
    for (let n = 0; n < 100 && !await cache.find(id(5)); n++) await pause();
    assert.deepEqual(requested, [id(5)]);
  } finally { await cache.close(); Object.assign(config, previous); await rm(dir, { recursive: true, force: true }); }
});

test("warm HTTP audio uses the local byte-range path without invoking an upstream resolver", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-warm-http-"));
  const previous = { cacheDir: config.cacheDir, cacheMaxBytes: config.cacheMaxBytes };
  config.cacheDir = dir; config.cacheMaxBytes = 4096;
  let resolutions = 0;
  const cache = new AudioCache(async () => { resolutions++; return [format]; },
    (async () => new Response("cached audio", { headers: { "content-length": "12" } })) as typeof fetch);
  const app = await createApp({ enabled: false });
  try {
    const entry = await cache.ensure(id(8), new AbortController().signal);
    assert.equal(await readFile(entry.file, "utf8"), "cached audio");
    const response = await app.inject({ url: `/api/stream/${id(8)}/audio`, headers: { range: "bytes=2-5" } });
    assert.equal(response.statusCode, 206); assert.equal(response.body, "ched");
    assert.equal(response.headers["content-range"], "bytes 2-5/12"); assert.equal(resolutions, 1);
    assert.equal(response.headers["cache-control"], "no-store");
  } finally { await app.close(); await cache.close(); Object.assign(config, previous); await rm(dir, { recursive: true, force: true }); }
});


test("rejoining the same track immediately after cancellation starts usable work", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-rejoin-"));
  const previous = { cacheDir: config.cacheDir, cacheMaxBytes: config.cacheMaxBytes };
  config.cacheDir = dir; config.cacheMaxBytes = 4096;
  let begin!: () => void; const started = new Promise<void>((resolve) => { begin = resolve; }); let calls = 0;
  const cache = new AudioCache(async () => [format], (async (_url, init) => {
    if (++calls === 1) return new Promise<Response>((_resolve, reject) => { begin(); init!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))); });
    return new Response("warm", { headers: { "content-length": "4" } });
  }) as typeof fetch);
  try {
    const controller = new AbortController(); const old = cache.ensure(id(1), controller.signal); void old.catch(() => {});
    await started; controller.abort();
    assert.ok(await cache.ensure(id(1), new AbortController().signal));
    await assert.rejects(old); assert.equal(calls, 2);
  } finally { await cache.close(); Object.assign(config, previous); await rm(dir, { recursive: true, force: true }); }
});


test("publication, response lease acquisition and eviction share one lock", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-publish-lock-"));
  const previous = { cacheDir: config.cacheDir, cacheMaxBytes: config.cacheMaxBytes };
  config.cacheDir = dir; config.cacheMaxBytes = 0;
  const file = path.join(dir, `${id(7)}.audio.bin`);
  let begin!: () => void; const started = new Promise<void>((r) => { begin = r; });
  let finish!: () => void; const held = new Promise<void>((r) => { finish = r; });
  let release: (() => void) | undefined;
  const publishing = mutateCache(async () => { begin(); await held; await writeFile(file, "cached"); });
  try {
    await started; let acquired = false;
    const waiting = acquireFileLease(file).then((done) => { acquired = true; return done; });
    await pause(); assert.equal(acquired, false);
    finish(); await publishing; release = await waiting;
    await trimCache(); assert.equal(await readFile(file, "utf8"), "cached");
    release(); await trimCache(); await assert.rejects(readFile(file), { code: "ENOENT" });
  } finally { finish(); await publishing; release?.(); Object.assign(config, previous); await rm(dir, { recursive: true, force: true }); }
});
