import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const track = (n: number) => ({ id: String(n).padStart(11, "0"), title: `Fixture ${n}`, artist: "Fixture artist", duration: 180, thumb: "", art: "", kind: "song" });
const tick = async () => { for (let n = 0; n < 8; n++) await new Promise((resolve) => setImmediate(resolve)); };
async function harness() {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-player-test-"));
  const root = path.resolve("../web/src");
  const h: any = { elements: [], sources: [], prepares: [], notices: [], played: [], plays: 0, errors: { message: "fixture network", failure: "network" }, handlers: new Map() };
  class Media extends EventTarget {
    _src = ""; paused = true; ended = false; readyState = 4; currentTime = 0; duration = 180; error: unknown = null;
    volume = .9; muted = false; videoWidth = 1920; videoHeight = 1080; buffered = { length: 1, end: () => 180 };
    rejectPlay = false;
    get src() { return this._src; } set src(value: string) { this._src = value; this.ended = false; this.currentTime = 0; this.readyState = 4; h.sources.push(value); }
    get currentSrc() { return this._src; }
    play() { if (this.rejectPlay) return Promise.reject(new DOMException("Blocked", "NotAllowedError")); this.paused = false; h.plays++; queueMicrotask(() => this.dispatchEvent(new Event("playing"))); return Promise.resolve(); }
    pause() { this.paused = true; this.dispatchEvent(new Event("pause")); }
    load() {} setAttribute() {} getAttribute(name: string) { return name === "src" ? this._src : null; }
    removeAttribute(name: string) { if (name === "src") { this._src = ""; this.readyState = 0; this.error = null; } }
    emit(name: string) { if (name === "ended") { this.ended = true; this.paused = true; } this.dispatchEvent(new Event(name)); }
  }
  const browser = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: "visible", createElement: () => { const media = new Media(); h.elements.push(media); return media; } });
  const storage = () => { const items = new Map(); return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value), removeItem: (key: string) => items.delete(key) }; };
  const timers: any[] = []; const interval = globalThis.setInterval; const timeout = globalThis.setTimeout;
  const values: Record<string, unknown> = {
    __musikeHarness: h, window: globalThis, document, localStorage: storage(), sessionStorage: storage(),
    navigator: { userAgent: "Chrome", platform: "Linux", maxTouchPoints: 0, mediaSession: { metadata: null, playbackState: "none", setPositionState() {}, setActionHandler: (name: string, callback: any) => h.handlers.set(name, callback) } },
    MediaMetadata: class { constructor(_data: unknown) {} }, location: { protocol: "https:", reload() {} },
    addEventListener: browser.addEventListener.bind(browser), removeEventListener: browser.removeEventListener.bind(browser), dispatchEvent: browser.dispatchEvent.bind(browser),
    setInterval: (...args: any[]) => { (h.intervals ??= []).push({ run: args[0], ms: args[1] }); const timer = (interval as any)(...args); timer.unref(); timers.push(timer); return timer; },
    setTimeout: (...args: any[]) => { const timer = (timeout as any)(...args); if (args[1] > 1000) timer.unref(); timers.push(timer); return timer; },
  };
  const descriptors = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  h.Media = Media;
  h.messages = { player: { playsNext: (name: string) => name, addedToQueue: (name: string) => name, startingRadio: (name: string) => name, cantPlay: (_title: string, message: string) => message, aTrack: "track" },
    features: { signInAgain: "Sign in again", downloadDiagnostics: "Diagnostics", networkFailure: "Network failure", networkTimeout: "Timed out", radioRetry: "Retry radio" }, common: { update: "Update", install: "Install" } };
  h.api = { prepare: async () => ({}), prefetch: async (id: string, ids: string[]) => { h.prepares.push({ id, ids }); return { lookahead: 3, readyIds: ids }; },
    playbackSettings: async () => ({ lookahead: 3, videoQuality: "sd" }), radio: async () => [], videoFor: async () => null };
  const mocks = new Map([
    ["lib/api.ts", `const h=globalThis.__musikeHarness;export const api=h.api;export const capabilities={video:true,engineSettings:false,retryOnError:false};export const systemMedia=null;export const streamSource=(id,kind,q,trace)=>'/api/stream/'+id+'/'+kind+'?trace='+trace;export const explainStreamError=async()=>h.errors;export const saveFile=async()=>{};`],
    ["lib/audio.ts", `const h=globalThis.__musikeHarness;export const createAudio=()=>{const m=new h.Media();h.elements.push(m);return m;};export const createUpcomingAudio=createAudio;`],
    ["i18n/index.ts", `export const getT=()=>globalThis.__musikeHarness.messages;export const useT=getT;`],
    ["lib/format.ts", `export const shuffled=items=>items.slice().reverse();`],
    ["stores/library.ts", `export const useLibrary={getState:()=>({recordPlay:track=>globalThis.__musikeHarness.played.push(track.id)})};`],
    ["stores/system.ts", `export const openSettings=()=>{};`],
    ["stores/ui.ts", `export const toast=(...args)=>globalThis.__musikeHarness.notices.push(args);`],
  ].map(([file, contents]) => [path.join(root, file!), contents!]));
  let player: any;
  try {
    const result = await build({ entryPoints: [path.join(root, "player/player.ts")], bundle: true, write: false, format: "esm", platform: "node", define: { "process.env.NODE_ENV": '"production"' },
      plugins: [{ name: "fixture-platform", setup(plugin) { plugin.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => mocks.has(args.path) ? { contents: mocks.get(args.path)!, loader: "ts" } : undefined); } }] });
    const file = path.join(dir, "player.mjs"); await writeFile(file, result.outputFiles[0]!.text); player = await import(pathToFileURL(file).href);
    await tick();
    return { h, player: player.usePlayer, document, browser, tick, cleanup: async () => {
      player.usePlayer.getState().stopSession(); await tick(); for (const timer of timers) { clearTimeout(timer); clearInterval(timer); }
      for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
      await rm(dir, { recursive: true, force: true });
    } };
  } catch (error) { for (const timer of timers) clearTimeout(timer); for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; await rm(dir, { recursive: true, force: true }); throw error; }
}

test("playlist/album/import playList, manual edits, jumps, shuffle and repeat renew actual player preparation", async () => {
  const f = await harness(); const p = () => f.player.getState();
  try {
    p().setAutoRadio(false); p().playList([track(1), track(2), track(3)]); await f.tick();
    assert.equal(p().status, "playing"); assert.equal(f.h.prepares.at(-1).id, track(1).id);
    p().playNext(track(4)); await f.tick(); assert.equal(f.h.prepares.at(-1).ids[0], track(4).id);
    p().addToQueue(track(5)); await f.tick(); assert.ok(f.h.prepares.at(-1).ids.includes(track(5).id));
    p().playTrack(track(6)); await f.tick(); assert.equal(f.h.prepares.at(-1).id, track(6).id);
    p().toggleShuffle(); await f.tick(); assert.equal(f.h.prepares.at(-1).id, track(6).id);
    p().jumpTo(p().queue.length - 1); await f.tick(); assert.equal(f.h.prepares.at(-1).id, p().queue.at(-1).id);
    p().cycleRepeat(); await f.tick(); assert.equal(f.h.prepares.at(-1).ids[0], p().queue[0].id);
    p().removeAt(0); await f.tick(); assert.equal(f.h.prepares.at(-1).id, p().queue[p().index].id);
    p().clearUpcoming(); await f.tick(); assert.equal(f.h.prepares.at(-1).ids[0], p().queue[0].id); // repeat-all still wraps
  } finally { await f.cleanup(); }
});
test("hidden ended and manual next retain the same authorised audio element and Media Session", async () => {
  const f = await harness(); const p = () => f.player.getState();
  try {
    p().setAutoRadio(false); p().playList([track(1), track(2), track(3)]); await f.tick();
    const audio = f.h.elements[0];
    f.document.visibilityState = "hidden";
    audio.emit("ended");
    assert.equal(navigator.mediaSession.playbackState, "playing");
    f.h.handlers.get("play")(); // Idempotent while loading; must not cancel this handoff.
    await f.tick();
    assert.equal(p().index, 1); assert.equal(p().status, "playing");
    assert.ok(audio.src.includes(track(2).id));
    f.h.handlers.get("nexttrack")(); await f.tick();
    assert.equal(p().index, 2); assert.ok(audio.src.includes(track(3).id));
    assert.equal(f.h.elements.filter((m: any) => m !== audio && !m.paused).length, 0);
    assert.equal(navigator.mediaSession.playbackState, "playing");
    p().prev(); f.h.handlers.get("pause")(); await f.tick();
    assert.equal(p().status, "paused"); assert.equal(navigator.mediaSession.playbackState, "paused");
    f.h.handlers.get("play")(); await f.tick(); assert.equal(p().status, "playing");
  } finally { await f.cleanup(); }
});
test("radio stale responses cannot replace manual intent and authentication errors are surfaced", async () => {
  const f = await harness(); const p = () => f.player.getState(); let release!: (items: unknown[]) => void;
  try {
    f.h.api.radio = () => new Promise((resolve) => { release = resolve; });
    p().playList([track(1)]); await f.tick();
    f.h.api.radio = async () => []; p().playList([track(8), track(9)]); await f.tick(); release([track(4)]); await f.tick();
    assert.deepEqual(p().queue.map((item: any) => item.id), [track(8).id, track(9).id]);
    f.h.api.radio = async () => { throw Object.assign(new Error("Sign in required"), { failure: "authentication" }); };
    p().playList([track(7)]); await f.tick(); p().next(); await f.tick();
    assert.equal(p().status, "error"); assert.equal(f.h.notices.at(-1)[2].label, "Sign in again");
  } finally { release?.([]); await f.cleanup(); }
});
test("two transient retries allow one fresh foreground recovery; deliberate pause remains paused", async () => {
  const f = await harness(); const p = () => f.player.getState();
  try {
    p().setAutoRadio(false); p().playList([track(1), track(2)]); await f.tick();
    f.h.elements[0].emit("error"); await new Promise((r) => setTimeout(r, 550)); await f.tick(); assert.equal(p().status, "playing"); assert.equal(p().index, 0);
    f.h.elements[0].emit("error"); await new Promise((r) => setTimeout(r, 1050)); await f.tick(); assert.equal(p().status, "playing");
    f.h.elements[0].emit("error"); await f.tick(); assert.equal(p().status, "error"); assert.equal(p().index, 0);
    f.browser.dispatchEvent(new Event("online")); await f.tick(); assert.equal(p().status, "playing");
    p().toggle(); await f.tick(); const plays = f.h.plays;
    f.document.visibilityState = "hidden"; f.document.dispatchEvent(new Event("visibilitychange"));
    f.document.visibilityState = "visible"; f.document.dispatchEvent(new Event("visibilitychange")); await f.tick();
    assert.equal(p().status, "paused"); assert.equal(f.h.plays, plays);
  } finally { await f.cleanup(); }
});

test("blocked autoplay reports paused without switching to an unauthorised spare", async () => {
  const f = await harness(); const p = () => f.player.getState();
  try {
    p().setAutoRadio(false); p().playList([track(1), track(2)]); await f.tick();
    f.h.elements[0].rejectPlay = true;
    f.h.elements[0].emit("ended"); await f.tick();
    assert.equal(p().index, 1); assert.equal(p().status, "paused");
    assert.equal(navigator.mediaSession.playbackState, "paused");
    assert.ok(f.h.elements[0].src.includes(track(2).id));
  } finally { await f.cleanup(); }
});

test("hidden playback that starts then stalls recovers without unlock, preserving position", async () => {
  const f = await harness(); const p = () => f.player.getState(); const now = Date.now;
  try {
    p().setAutoRadio(false); p().playList([track(1), track(2)]); await f.tick();
    f.document.visibilityState = "hidden";
    f.h.elements[0].emit("ended"); await f.tick();
    const active = f.h.elements[0]; active.currentTime = 1.8; active.emit("timeupdate"); active.emit("waiting");
    f.h.errors = { message: "Browser cannot play", failure: undefined };
    Date.now = () => now() + 10000;
    f.h.intervals.find((t: any) => t.ms === 5000).run(); await f.tick();
    await new Promise((resolve) => setTimeout(resolve, 550)); await f.tick();
    assert.equal(f.document.visibilityState, "hidden"); assert.equal(p().index, 1); assert.equal(p().status, "playing");
    active.emit("loadedmetadata"); assert.equal(active.currentTime, 1.8);
  } finally { Date.now = now; await f.cleanup(); }
});

test("a scheduled hidden retry cannot resume after a deliberate pause or skip", async () => {
  const f = await harness(); const p = () => f.player.getState();
  try {
    p().setAutoRadio(false); p().playList([track(1), track(2)]); await f.tick(); f.document.visibilityState = "hidden";
    f.h.elements[0].emit("error"); await f.tick(); p().toggle(); const plays = f.h.plays;
    await new Promise((resolve) => setTimeout(resolve, 550)); await f.tick();
    assert.equal(p().status, "paused"); assert.equal(f.h.plays, plays);
    p().toggle(); await f.tick(); f.h.elements[0].emit("error"); await f.tick(); p().next(); await f.tick();
    await new Promise((resolve) => setTimeout(resolve, 1050)); await f.tick(); assert.equal(p().index, 1); assert.equal(p().status, "playing");
  } finally { await f.cleanup(); }
});
