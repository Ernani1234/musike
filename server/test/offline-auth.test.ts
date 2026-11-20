import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { offlineSettings, purgeOfflineOwner } from "../../web/src/lib/offlineStore.ts";

for (const mode of ["offline", "unauthorized", "unauthorized-html", "challenge", "pending-logout"] as const) test(`offline AuthGate: ${mode}`, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-offline-auth-")); const root = path.resolve("../web/src"); const owner = crypto.randomUUID();
  await offlineSettings(owner, { enabled: true, eligible: true, name: "Fixture" });
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid" });
  dom.window.localStorage.setItem("musike:offline-owner", owner);
  if (mode === "pending-logout") dom.window.localStorage.setItem("musike:logout-pending", "1");
  const requests: string[] = [];
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Event: dom.window.Event,
    localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
    fetch: async (url: string) => {
      requests.push(url);
      if (mode === "offline" || mode === "pending-logout") throw new TypeError("fixture network failure");
      if (mode === "unauthorized") return new Response('{"error":"Sign in required"}', { status: 401, headers: { "content-type": "application/json" } });
      return new Response('<html>fixture challenge</html>', { status: mode === "unauthorized-html" ? 401 : 403, headers: { "content-type": "text/html" } });
    } };
  const previous = new Map(Object.keys(globals).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  let unmount: (() => void) | undefined;
  try {
    const result = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {AuthGate} from './components/AuthGate';export {useSession} from './stores/session';export function mount(){const root=createRoot(document.getElementById('root'));flushSync(()=>root.render(React.createElement(AuthGate,null,React.createElement('span',{'data-offline-child':true},'library'))));return ()=>flushSync(()=>root.unmount());}`, loader: "tsx", resolveDir: root },
      bundle: true, platform: "node", format: "esm", write: false, define: { "process.env.NODE_ENV": '"production"', "import.meta.env.MODE": '"test"' },
      plugins: [{ name: "auth-messages", setup(p) { p.onLoad({ filter: /i18n\/index.ts$/ }, () => ({ contents: "import {en} from './en';export const getT=()=>en;export const useT=getT;", loader: "ts" })); } }] });
    const file = path.join(dir, "auth.mjs"); await writeFile(file, result.outputFiles[0]!.text); const mod = await import(pathToFileURL(file).href); unmount = mod.mount();
    for (let n = 0; n < 200; n++) { await new Promise(r => setTimeout(r, 2)); if (!dom.window.document.body.textContent?.includes("Loading")) break; }
    if (mode === "offline") {
      assert.ok(dom.window.document.querySelector("[data-offline-child]"));
      assert.equal(mod.useSession.getState().user.id, owner); assert.equal(mod.useSession.getState().offline, true);
      assert.equal(mod.useSession.getState().user.phone, ""); assert.equal(mod.useSession.getState().user.role, "user");
      assert.equal(dom.window.sessionStorage.getItem("musike:user"), owner);
    } else {
      assert.equal(dom.window.document.querySelector("[data-offline-child]"), null);
      assert.equal(mod.useSession.getState().user, null);
      if (mode === "pending-logout") assert.deepEqual(requests, ["/api/auth/logout"]);
      if (mode.startsWith("unauthorized")) assert.equal(dom.window.localStorage.getItem("musike:offline-owner"), null);
    }
  } finally {
    unmount?.(); dom.window.close(); await purgeOfflineOwner(owner);
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
    await rm(dir, { recursive: true, force: true });
  }
});
