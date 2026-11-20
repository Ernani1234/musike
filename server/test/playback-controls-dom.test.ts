import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

test("actual React SVG clicks serialize data-only commands through the jam boundary", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-controls-dom-")); const root = path.resolve("../web/src");
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid" });
  const browser = new EventTarget();
  const snapshot = { queue: [{ id: "abcdefghijk", title: "Fixture", artist: "Fixture", duration: 180, thumb: "", art: "", kind: "song" }], original: null, index: 0, position: 0, duration: 180, status: "playing", shuffle: false, repeat: "off", autoRadio: false };
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, sessionStorage: dom.window.sessionStorage,
    localStorage: dom.window.localStorage, addEventListener: browser.addEventListener.bind(browser), removeEventListener: browser.removeEventListener.bind(browser),
    fetch: async (_url: string, init: RequestInit) => new Response(new ReadableStream({ start(c) { init.signal?.addEventListener("abort", () => c.close(), { once: true }); } }), { headers: { "content-type": "text/event-stream" } }),
    __controlsSnapshot: snapshot };
  const previous = new Map(Object.keys(globals).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const mocks = new Map([
    [path.join(root, "player/player.ts"), `import {create} from 'zustand';const noop=()=>{};export const usePlayer=create(()=>({...globalThis.__controlsSnapshot,playList:noop,playTrack:noop,playNext:noop,addToQueue:noop,removeAt:noop,jumpTo:noop,clearUpcoming:noop,startRadio:noop,toggle:noop,next:noop,prev:noop,seek:noop,toggleShuffle:noop,cycleRepeat:noop,setAutoRadio:noop,suspendOutput:noop,resumeOutput:noop}));`],
    [path.join(root, "stores/session.ts"), `export const useSession={getState:()=>({offline:false})};export const accountRequest=async()=>({deviceId:'here',active:'here',epoch:1,revision:1,updatedAt:Date.now(),snapshot:globalThis.__controlsSnapshot,devices:[],command:null,transfer:null});`],
    [path.join(root, "stores/library.ts"), "export const useLibrary=()=>false;"],
    [path.join(root, "stores/ui.ts"), "export const toast=()=>{};"],
    [path.join(root, "lib/api.ts"), "export const capabilities={video:true};"],
    [path.join(root, "components/PlaybackDevices.tsx"), "export const PlaybackDevices=()=>null;"],
    [path.join(root, "i18n/index.ts"), `export {en as messages} from './en';import {en} from './en';export const getT=()=>en;export const useT=getT;`],
  ]);
  const code = `import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {Transport} from './components/Controls';import {usePlayer} from './player/player';import {startPlaybackSync,setJamControl} from './lib/playbackSync';export function mount(){const stop=startPlaybackSync(usePlayer);const out=[];setJamControl((action,args)=>out.push(JSON.stringify({action,args})));const root=createRoot(document.getElementById('root'));flushSync(()=>root.render(React.createElement(Transport)));return {out,close(){flushSync(()=>root.unmount());stop();}};}`;
  let mounted: any;
  try {
    const result = await build({ stdin: { contents: code, resolveDir: root, loader: "tsx" }, bundle: true, platform: "node", format: "esm", write: false, define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "controls-platform", setup(p) { p.onLoad({ filter: /\.(ts|tsx)$/ }, args => mocks.has(args.path) ? { contents: mocks.get(args.path)!, loader: "tsx" } : undefined); } }] });
    const file = path.join(dir, "controls.mjs"); await writeFile(file, result.outputFiles[0]!.text); const mod = await import(pathToFileURL(file).href); mounted = mod.mount();
    const buttons = [...dom.window.document.querySelectorAll("button")];
    for (const button of buttons) {
      const svg = button.querySelector("svg path") ?? button.querySelector("svg"); assert.ok(svg);
      // This node has React's real fiber back-reference: the original wire payload fails here.
      assert.throws(() => JSON.stringify({ target: svg }), /circular/i);
      svg.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    }
    assert.deepEqual(mounted.out.map((s: string) => JSON.parse(s).action), ["toggleShuffle", "prev", "toggle", "next", "cycleRepeat"]);
    assert.ok(mounted.out.every((s: string) => JSON.parse(s).args.length === 0));
  } finally {
    mounted?.close(); await new Promise(resolve => setImmediate(resolve)); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
    await rm(dir, { recursive: true, force: true });
  }
});
