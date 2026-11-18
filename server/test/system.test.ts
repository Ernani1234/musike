import assert from "node:assert/strict";
import { test } from "node:test";
import { systemInfo } from "../src/system.js";

test("concurrent system polls share release requests", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    await Promise.resolve();
    return new Response(JSON.stringify({ tag_name: "2026.11.18" }), { status: 200 });
  }) as typeof fetch;
  try {
    const results = await Promise.all(Array.from({ length: 12 }, () => systemInfo("en")));
    assert.equal(calls, 2);
    assert.equal(results[0].ytdlp.latest.stable, "2026.11.18");
    await systemInfo("en");
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
