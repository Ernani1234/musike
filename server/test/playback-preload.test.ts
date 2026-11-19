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
