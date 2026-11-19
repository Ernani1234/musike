import assert from "node:assert/strict";
import { test } from "node:test";
import { clientsForDirect, resolveDirectAudio } from "../src/ytdlp.js";
import { DEFAULT_CLIENTS } from "../src/directAudio.js";

test("cold fallback uses cached/default clients immediately and coalesces advisory refresh", async () => {
  const previous = globalThis.fetch; let release!: (response: Response) => void; let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Promise<Response>((resolve) => { release = resolve; }); }) as typeof fetch;
  try {
    assert.deepEqual(await clientsForDirect(), DEFAULT_CLIENTS);
    assert.deepEqual(await clientsForDirect(), DEFAULT_CLIENTS); assert.equal(calls, 1);
    const attempted: string[][] = [];
    const resolved = resolveDirectAudio("fixture0001", undefined, async (_id, clients) => {
      attempted.push(clients);
      if (clients.includes("VISIONOS")) throw new Error("stale client fixture");
      return { url: "https://media.invalid/audio", mime: "audio/mp4", title: "Fixture", duration: 1, expiresAt: Date.now() + 1000 };
    });
    await new Promise((resolve) => setImmediate(resolve)); assert.equal(attempted.length, 1);
    release(new Response(JSON.stringify({ clients: ["ANDROID"] })));
    assert.equal((await resolved).mime, "audio/mp4"); assert.deepEqual(attempted, [DEFAULT_CLIENTS, ["ANDROID"]]);
    for (let n = 0; n < 8; n++) await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(await clientsForDirect(), ["ANDROID"]); assert.equal(calls, 1);
  } finally { release?.(new Response("{}")); globalThis.fetch = previous; }
});
