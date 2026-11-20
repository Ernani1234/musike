import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { offlineSettings, offlineSummary, purgeOfflineOwner } from "../../web/src/lib/offlineStore.ts";

const track = (n: number) => ({ id: String(n).padStart(11, "0"), title: `Fixture ${n}`, artist: "Fixture", duration: 3, thumb: "", art: "", kind: "video" });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function harness() {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-offline-")); const owner = crypto.randomUUID();
  const values = new Map<string, string>([["musike:user", owner]]); const local = new Map();
  const storage = (map: Map<string, string>) => ({ getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, v: string) => map.set(key, v), removeItem: (key: string) => map.delete(key) });
  const browser = new EventTarget(); const h: any = { offline: false, requests: [], fail: "" };
  const globals = { __offlineHarness: h, sessionStorage: storage(values), localStorage: storage(local), window: browser,
    navigator: { onLine: true, storage: { estimate: async () => ({ usage: 123 }), persisted: async () => true, persist: async () => true } },
    fetch: async (url: string, init: RequestInit) => { h.requests.push(url); if (h.transport) return h.transport(url, init); if (h.fail && url.includes(h.fail)) throw new Error("fixture offline"); return new Response("complete-audio", { headers: { "content-type": "audio/mp4" } }); } };
  const old = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const root = path.resolve("../web/src"); const mocks = new Map([
    [path.join(root, "i18n/index.ts"), 'export const getT=()=>({offline:{storageUnavailable:"storage",enableFirst:"enable",budgetFull:"budget",incomplete:"incomplete"}});'],
    [path.join(root, "stores/session.ts"), 'const h=globalThis.__offlineHarness;export const useSession={getState:()=>({offline:h.offline})};'],
  ]);
  const result = await build({ stdin: { contents: `export * from "${root}/lib/offlineDownloads.ts";export {useOffline} from "${root}/stores/offline.ts";`, resolveDir: root }, bundle: true, write: false, platform: "node", format: "esm",
    plugins: [{ name: "offline-platform", setup(p) { p.onLoad({ filter: /\.(ts|tsx)$/ }, args => mocks.has(args.path) ? { contents: mocks.get(args.path)!, loader: "ts" } : undefined); } }] });
  const file = path.join(dir, "offline.mjs"); await writeFile(file, result.outputFiles[0]!.text); const mod = await import(pathToFileURL(file).href);
  const settled = async () => { for (let n = 0; n < 300; n++) { await tick(); if (!mod.useOffline.getState().busy) return; } throw new Error("download did not settle"); };
  return { mod, h, owner, settled, cleanup: async () => { mod.cancelOfflineDownloads(); await settled(); await purgeOfflineOwner(owner); for (const [key, value] of old) if (value) Object.defineProperty(globalThis, key, value); else delete (globalThis as any)[key]; await rm(dir, { recursive: true, force: true }); } };
}
test("download admission rejects partial, video, empty and HTML responses; video catalog items use audio-only URLs", async () => {
  const f = await harness();
  try {
    for (const [status, type, body] of [[206, "audio/mp4", "partial"], [200, "video/mp4", "video"], [200, "text/html", "challenge"], [200, "audio/mp4", ""]] as const) {
      await assert.rejects(f.mod.fetchCompleteAudio(track(1).id, new AbortController().signal, async () => new Response(body, { status, headers: { "content-type": type } })));
    }
    const body = await f.mod.fetchCompleteAudio(track(1).id, new AbortController().signal);
    assert.equal(await body.text(), "complete-audio"); assert.match(f.h.requests[0], /\/audio$/);
    assert.ok(!f.h.requests[0].includes("/video"));
  } finally { await f.cleanup(); }
});
test("explicit playlist jobs resume without refetching complete bodies and logout removes the account cache", async () => {
  const f = await harness();
  try {
    await f.mod.rememberOfflineAccount(f.owner, "Fixture"); assert.equal(await f.mod.cachedOfflineAccount(), null);
    await f.mod.setOfflineBudget(512, true);
    const playlist = { id: "copy", name: "Personal copy", createdAt: 1, updatedAt: 1, tracks: [track(1), track(2)] };
    f.h.fail = track(2).id;
    await f.mod.pinOfflinePlaylist(playlist); await f.settled();
    assert.equal((await offlineSummary(f.owner)).entries.length, 1);
    assert.ok((await offlineSummary(f.owner)).pins[0].pending);
    assert.equal(f.mod.useOffline.getState().error, "incomplete");
    f.h.fail = ""; await f.mod.pinOfflinePlaylist(playlist); await f.settled();
    const ready = await offlineSummary(f.owner);
    assert.equal(ready.pins[0].pending, null); assert.equal(ready.entries.length, 2);
    assert.equal(f.h.requests.filter((u: string) => u.includes(track(1).id)).length, 1);
    assert.equal((await f.mod.cachedOfflineAccount()).phone, "");
    const url = await f.mod.offlineAudioUrl(track(1).id); assert.ok(url.startsWith("blob:")); URL.revokeObjectURL(url);
    await f.mod.setOfflineBudget(512, false); assert.ok(await f.mod.cachedOfflineAccount());
    await f.mod.logoutOfflineData(); assert.equal(await f.mod.cachedOfflineAccount(), null);
    assert.equal((await offlineSummary(f.owner)).bytes, 0); assert.equal((await offlineSummary(f.owner)).pins.length, 0);
  } finally { await f.cleanup(); }
});
test("last output eligibility survives a mirror tab but is revoked by a remote output or transfer", async () => {
  const f = await harness();
  try {
    await offlineSettings(f.owner, { enabled: true });
    await f.mod.rememberOutput(true, "output-a", "output-a");
    await f.mod.rememberOutput(false, "output-a", "mirror");
    assert.equal((await offlineSummary(f.owner)).settings.eligible, true);
    await f.mod.rememberOutput(false, "remote", "mirror");
    assert.equal((await offlineSummary(f.owner)).settings.eligible, false);
    await f.mod.rememberOutput(true, "output-a", "output-a");
    await f.mod.rememberOutput(false, "output-a", "mirror", true);
    assert.equal((await offlineSummary(f.owner)).settings.eligible, false);
  } finally { await f.cleanup(); }
});

test("cancelled partial audio never commits and an explicit resume can finish the pin", async () => {
  const f = await harness();
  try {
    await f.mod.setOfflineBudget(512, true);
    const playlist = { id: "cancel", name: "Interrupted", createdAt: 1, updatedAt: 1, tracks: [track(4)] };
    let started = false;
    f.h.transport = (_url: string, init: RequestInit) => new Response(new ReadableStream({ start(c) {
      c.enqueue(new TextEncoder().encode("partial")); started = true;
      init.signal!.addEventListener("abort", () => c.error(new DOMException("Stopped", "AbortError")), { once: true });
    } }), { headers: { "content-type": "audio/mp4" } });
    await f.mod.pinOfflinePlaylist(playlist);
    for (let n = 0; n < 100 && !started; n++) await tick();
    assert.equal(started, true); f.mod.cancelOfflineDownloads(); await f.settled();
    assert.equal((await offlineSummary(f.owner)).entries.length, 0);
    assert.ok((await offlineSummary(f.owner)).pins[0].pending);
    f.h.transport = null; await f.mod.pinOfflinePlaylist(playlist); await f.settled();
    assert.equal((await offlineSummary(f.owner)).entries.length, 1);
    assert.equal((await offlineSummary(f.owner)).pins[0].pending, null);
  } finally { await f.cleanup(); }
});
