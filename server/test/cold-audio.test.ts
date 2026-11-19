import assert from "node:assert/strict";
import { test } from "node:test";
import { openAudioSource } from "../src/audioCache.js";
const primary = { formatId: "140", url: "https://media.invalid/primary", mime: "audio/mp4", headers: {} };
const direct = { ...primary, formatId: "fallback", url: "https://media.invalid/direct" };
const id = "00000000001";

test("cold audio chooses usable fallback bytes while primary body stalls and cancels the loser", async () => {
  let cancelled = false;
  const selected = await openAudioSource(id, new AbortController().signal, async () => [primary, direct], (async (url, init) => {
    if (String(url).endsWith("primary")) return new Response(new ReadableStream({ start(controller) {
      init!.signal!.addEventListener("abort", () => { cancelled = true; controller.error(new DOMException("Aborted", "AbortError")); });
    } }));
    return new Response("ready", { headers: { "content-length": "5" } });
  }) as typeof fetch, undefined, 1000);
  assert.equal(await selected.response.text(), "ready"); assert.equal(selected.format.formatId, "fallback"); assert.equal(cancelled, true);
});
test("cold audio forwards Range, preserves 206 and exposes bytes before the rest of a file exists", async () => {
  let finish!: () => void;
  const source = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("a")); finish = () => { controller.enqueue(new TextEncoder().encode("bc")); controller.close(); }; } });
  const selected = await openAudioSource(id, new AbortController().signal, async () => [primary], (async (_url, init) => {
    assert.equal((init!.headers as Record<string, string>).Range, "bytes=0-2");
    return new Response(source, { status: 206, headers: { "content-range": "bytes 0-2/10", "content-length": "3" } });
  }) as typeof fetch, "bytes=0-2", 1000);
  assert.equal(selected.response.status, 206); const reader = selected.response.body!.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "a"); finish();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "bc");
});
test("cold preparation has an overall deadline and honours disconnect cancellation", async () => {
  const never = (async () => new Promise<Response>(() => {})) as typeof fetch;
  await assert.rejects(openAudioSource(id, new AbortController().signal, async () => [primary], never, undefined, 15), (error: any) => error.status === 504);
  const controller = new AbortController(); const pending = openAudioSource(id, controller.signal, async () => [primary], never);
  controller.abort(); await assert.rejects(pending, { name: "AbortError" });
});
test("invalid ranges remain 416 and HTML challenge bodies are not cached as audio", async () => {
  const selected = await openAudioSource(id, new AbortController().signal, async () => [primary], (async () => new Response(null, { status: 416, headers: { "content-range": "bytes */10" } })) as typeof fetch, "bytes=20-", 1000);
  assert.equal(selected.response.status, 416); assert.equal(selected.response.headers.get("content-range"), "bytes */10");
  await assert.rejects(openAudioSource(id, new AbortController().signal, async () => [primary], (async () => new Response("challenge", { headers: { "content-type": "text/html" } })) as typeof fetch));
});

test("candidate selection admission bounds a burst instead of opening unlimited upstream races", async () => {
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; }); let active = 0; let max = 0;
  const jobs = Array.from({ length: 12 }, () => openAudioSource(id, new AbortController().signal, async () => {
    active++; max = Math.max(max, active); await held; active--; return [];
  }));
  const settled = Promise.allSettled(jobs);
  try { await new Promise((resolve) => setImmediate(resolve)); assert.equal(max, 8); }
  finally { release(); await settled; }
  assert.ok(max <= 8);
});
