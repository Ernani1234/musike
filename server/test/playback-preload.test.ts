import assert from "node:assert/strict";
import { test } from "node:test";
import { PlaybackPreload } from "../../web/src/lib/playbackPreload.js";
test("complete next-track bytes survive loss of the network and are released after use", async () => {
  let calls = 0; const transport = (async () => { calls++; return new Response(new Uint8Array([1,2,3,4]), { headers: { "content-type": "audio/mp4" } }); }) as typeof fetch;
  const preload = new PlaybackPreload(transport); await preload.prepare("00000000001", "/api/stream/00000000001/audio", "fixture");
  await preload.prepare("00000000001", "/api/stream/00000000001/audio", "fixture"); assert.equal(calls, 1);
  const complete = preload.take("00000000001")!; assert.ok(complete.url.startsWith("blob:")); assert.deepEqual([...new Uint8Array(await (await fetch(complete.url)).arrayBuffer())], [1,2,3,4]);
  preload.clear(); URL.revokeObjectURL(complete.url); await assert.rejects(fetch(complete.url));
});
test("preload rejects HTML and oversized complete bodies and clears owner-scoped retained bytes", async () => {
  const html = new PlaybackPreload((async () => new Response("gateway", { headers: { "content-type": "text/html" } })) as typeof fetch);
  await html.prepare("00000000001", "/api/stream", "fixture"); assert.equal(html.take("00000000001"), null);
  const large = new PlaybackPreload((async () => new Response(new Uint8Array(5), { headers: { "content-type": "audio/mp4" } })) as typeof fetch, 4);
  await large.prepare("00000000001", "/api/stream", "fixture"); assert.equal(large.take("00000000001"), null);
  const retained = new PlaybackPreload((async () => new Response(new Uint8Array(4), { headers: { "content-type": "audio/mp4" } })) as typeof fetch);
  await retained.prepare("00000000001", "/api/stream", "fixture"); retained.clear(); assert.equal(retained.take("00000000001"), null);
});
test("persistent next-track hydration avoids network and stale hydration cannot replace a newer target", async () => {
  let calls = 0; let finish!: (blob: Blob) => void;
  const blob = new Blob(["saved"], { type: "audio/mp4" });
  const preload = new PlaybackPreload((async () => { calls++; throw new Error("offline"); }) as typeof fetch, 16 * 1024 * 1024, undefined, async () => blob);
  preload.retain("00000000001"); await preload.hydrate("00000000001", "fixture");
  const ready = preload.take("00000000001")!; assert.ok(ready); assert.equal(await (await fetch(ready.url)).text(), "saved"); URL.revokeObjectURL(ready.url); assert.equal(calls, 0);
  const stale = new PlaybackPreload(fetch, 16 * 1024 * 1024, undefined, () => new Promise(resolve => { finish = resolve; }));
  stale.retain("00000000001"); const pending = stale.hydrate("00000000001", "fixture");
  stale.retain("00000000002"); finish(blob); await pending;
  assert.equal(stale.take("00000000001"), null); assert.equal(stale.take("00000000002"), null);
});
