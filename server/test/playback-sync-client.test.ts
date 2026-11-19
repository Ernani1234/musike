import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Jams } from "../src/jams.js";
import { Accounts } from "../src/accounts.js";
import { PlaybackSync } from "../src/playbackSync.js";
import { config } from "../src/config.js";

test("browser sync coordinators preserve sole outputs across transfers and cross-account jams", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-sync-client-")); const old = config.dataDir; config.dataDir = dir;
  let clock = Date.now();
  const a = await Accounts.open({ now: () => clock, adminPhone: "60120000001", secret: "sync-client-secret-".repeat(3) });
  const user = (await a.db.get("SELECT id FROM users"))!.id; const sync = new PlaybackSync(a, () => clock); const jams = new Jams(a, sync);
  const jamErrors: unknown[] = []; sync.onChange = (owner, snapshot) => { void jams.observe(owner, snapshot).catch(e => jamErrors.push(e)); };
  const names = ["sessionStorage", "navigator", "addEventListener", "removeEventListener", "fetch", "__syncHarness"];
  const descriptors = new Map(names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const browser = new EventTarget(); const sessions = new Map<string, string>(); const owners = new Map<string, string>(); const stop: (() => void)[] = []; const output: string[] = [];
  const streams = new Map<string, () => void>();
  const set = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const until = async (check: () => boolean) => { for (let n = 0; n < 300; n++) { if (check()) return; await new Promise((r) => setTimeout(r, 5)); } throw new Error("Sync condition did not become true"); };
  set("navigator", { userAgent: "Fixture browser" }); set("addEventListener", browser.addEventListener.bind(browser)); set("removeEventListener", browser.removeEventListener.bind(browser));
  set("fetch", async (url: string, init: RequestInit) => {
    const id = new URL(url, "https://fixture.invalid").searchParams.get("deviceId")!; let dispose = () => {};
    return new Response(new ReadableStream({
      async start(controller) {
        dispose = await sync.subscribe(owners.get(id)!, sessions.get(id)!, id, (view) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(view)}\n\n`)));
        let ended = false;
        const end = () => { if (ended) return; ended = true; dispose(); controller.close(); if (streams.get(id) === end) streams.delete(id); };
        streams.set(id, end); init.signal?.addEventListener("abort", end, { once: true });
      }, cancel() { dispose(); },
    }), { headers: { "content-type": "text/event-stream" } });
  });
  async function client(session: string, owner = user) {
    const values = new Map(); set("sessionStorage", { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
    const h = { request: async (url: string, body: Record<string, unknown>) => {
      if (url.endsWith("/devices")) { const v = await sync.register(owner, session, body.clientId, body.name); sessions.set(v.deviceId, session); owners.set(v.deviceId, owner); return v; }
      return sync.act(owner, session, body.deviceId as string, body);
    } };
    set("__syncHarness", h);
    const root = path.resolve("../web/src"); const mocks = new Map([
      [path.join(root, "stores/session.ts"), "const h=globalThis.__syncHarness;export const accountRequest=(url,body)=>h.request(url,body);"],
      [path.join(root, "i18n/index.ts"), "export const getT=()=>({features:{syncFailure:'Sync failed',syncConnecting:'Connecting',phoneDevice:'Phone',browserDevice:'Computer'}});"],
      [path.join(root, "stores/ui.ts"), "export const toast=()=>{};"],
    ]);
    const result = await build({ entryPoints: [path.join(root, "lib/playbackSync.ts")], bundle: true, write: false, platform: "node", format: "esm", plugins: [{ name: "sync-platform", setup(p) {
      p.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => mocks.has(args.path) ? { contents: mocks.get(args.path)!, loader: "ts" } : undefined);
    } }] });
    const file = path.join(dir, `${session}.mjs`); await writeFile(file, result.outputFiles[0]!.text); const mod = await import(pathToFileURL(file).href);
    let state: any = { queue: [], original: null, index: 0, position: 0, duration: 0, status: "idle", shuffle: false, repeat: "off", autoRadio: false };
    const listeners = new Set<(state: any, previous: any) => void>();
    const store: any = { getState: () => state, setState: (patch: object) => { const previous = state; state = { ...state, ...patch }; for (const fn of listeners) fn(state, previous); }, subscribe: (fn: any) => { listeners.add(fn); return () => listeners.delete(fn); } };
    const noop = () => {};
    state = { ...state, playList: (queue: any[], index = 0) => { output.push(`${session}:play`); store.setState({ queue, index, status: "playing", duration: 180 }); },
      toggle: () => store.setState({ status: state.status === "playing" ? "paused" : "playing" }), seek: (position: number) => store.setState({ position }),
      suspendOutput: () => { output.push(`${session}:pause`); store.setState({ status: "paused" }); }, resumeOutput: (snapshot: any) => { output.push(`${session}:play`); store.setState({ ...snapshot, status: snapshot.status }); },
      playTrack: noop, playNext: noop, addToQueue: noop, removeAt: noop, jumpTo: noop, clearUpcoming: noop, startRadio: noop, next: noop, prev: noop, toggleShuffle: noop, cycleRepeat: noop, setAutoRadio: noop };
    stop.push(mod.startPlaybackSync(store)); await until(() => mod.usePlaybackDevices.getState().connected);
    return { mod, store };
  }
  try {
    const first = await client("session-a"); const second = await client("session-b");
    const secondId = second.mod.usePlaybackDevices.getState().view.deviceId;
    streams.get(secondId)!(); await until(() => !second.mod.usePlaybackDevices.getState().connected);
    browser.dispatchEvent(new Event("online")); await until(() => second.mod.usePlaybackDevices.getState().connected);
    const track = { id: "testtrack01", title: "Fixture", artist: "Fixture", duration: 180, thumb: "", art: "", kind: "song" };
    first.store.getState().playList([track]); await until(() => second.store.getState().queue.length === 1);
    assert.equal(first.mod.playbackCanOutput(), true); assert.equal(second.mod.playbackCanOutput(), false);
    first.store.setState({ shuffle: true, original: [{ ...track }] });
    await until(() => second.store.getState().shuffle);
    assert.equal(second.store.getState().original[0], second.store.getState().queue[0]);
    second.store.getState().toggle(); await until(() => first.store.getState().status === "paused" && second.store.getState().status === "paused");
    second.store.getState().seek(42); await until(() => first.store.getState().position === 42);
    await second.mod.claimPlayback(); await until(() => second.mod.playbackCanOutput() && second.store.getState().status === "playing");
    assert.equal(first.mod.playbackCanOutput(), false); assert.equal(second.store.getState().position, 42);
    assert.ok(output.lastIndexOf("session-a:pause") < output.lastIndexOf("session-b:play"));
    await first.mod.claimPlayback(); await until(() => first.mod.playbackCanOutput() && first.store.getState().status === "playing");
    await second.mod.claimPlayback(); await until(() => second.mod.playbackCanOutput() && second.store.getState().status === "playing");
    assert.equal(first.mod.playbackCanOutput(), false);
    await second.mod.releasePlayback(); assert.equal(second.mod.playbackCanOutput(), false);
    await a.db.run("INSERT INTO users(id,phone,created_at) VALUES('bob','+60120000002',1)");
    const third = await client("session-c", "bob"); await first.mod.claimPlayback(); await third.mod.claimPlayback();
    await until(() => first.mod.playbackCanOutput() && third.mod.playbackCanOutput());
    const jam = await jams.create(user); const invitation = await jams.invite(user, jam.id); await jams.join("bob", invitation.code);
    const routeJam = (owner: string) => async (action: string, args: unknown[]) => { const current = await jams.current(owner); return jams.command(owner, jam.id, { version: current!.version, action, args }); };
    first.mod.setJamControl(routeJam(user)); third.mod.setJamControl(routeJam("bob"));
    const nextTrack = { ...track, id: "testtrack02", title: "Second" };
    await first.store.getState().playList([track, nextTrack]);
    await until(() => first.store.getState().status === "playing" && third.store.getState().status === "playing" && third.store.getState().queue.length === 2);
    assert.equal(second.mod.playbackCanOutput(), false);
    await third.store.getState().addToQueue({ ...track, id: "testtrack03", title: "Third" });
    await until(() => first.store.getState().queue.length === 3 && third.store.getState().queue.length === 3);
    await assert.rejects(third.store.getState().toggle(), /host/);
    third.mod.alignJamPlayback({ ...third.store.getState(), position: 42 }); assert.equal(third.store.getState().position, 42);
    clock += 46000; const thirdId = third.mod.usePlaybackDevices.getState().view.deviceId; await sync.read("bob", "session-c", thirdId);
    const missing = await jams.current("bob"); assert.equal(missing!.host, null); assert.equal(missing!.snapshot.status, "paused");
    await until(() => third.store.getState().status === "paused");
    assert.equal((await jams.claim("bob", jam.id)).host, "bob"); assert.deepEqual(jamErrors, []);

  } finally {
    for (const end of stop) end(); await new Promise((r) => setTimeout(r, 20)); await sync.close(); await a.close();
    for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
    config.dataDir = old; await rm(dir, { recursive: true, force: true });
  }
});
