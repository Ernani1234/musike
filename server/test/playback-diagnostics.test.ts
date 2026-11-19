import assert from "node:assert/strict";
import { test } from "node:test";
import { safePlaybackFields, withPlaybackTrace, playbackStage, type PlaybackFields } from "../src/playbackDiagnostics.js";
import { responseFailure } from "../../web/src/lib/playbackDiagnostics.js";
import { requestRadio } from "../../web/src/lib/playbackRecovery.js";

test("timing contexts stay correlated across concurrent asynchronous requests and redact unknown data", async () => {
  const events: PlaybackFields[] = [];
  await Promise.all(["trace_first", "trace_second"].map((traceId, n) => withPlaybackTrace({ traceId, requestId: `request_${n}`, emit: (event) => events.push(event) }, async () => {
    await new Promise((resolve) => setTimeout(resolve, n ? 1 : 5)); playbackStage("stream.first_byte", { videoId: "00000000001", bytes: n });
  })));
  assert.deepEqual(new Set(events.map((event) => event.traceId)), new Set(["trace_first", "trace_second"]));
  assert.ok(events.every((event) => event.requestId === (event.traceId === "trace_first" ? "request_0" : "request_1")));
  const safe = safePlaybackFields({ stage: "stream.error", ms: 5, url: "https://private.invalid/token", cookie: "fixture", reason: "secret=value" } as PlaybackFields);
  assert.equal(safePlaybackFields({ edgeRay: "abcdef0123456789-KUL" }).edgeRay, "abcdef0123456789-KUL");
  assert.equal(safePlaybackFields({ edgeRay: "fixture-secret" }).edgeRay, undefined);
  assert.deepEqual(safe, { stage: "stream.error", ms: 5 });
});
test("HTTP classification separates login HTML, challenges, gateway failures and JSON", () => {
  const response = (status: number, type: string, redirected = false, challenge = false) => ({ status, redirected, headers: new Headers({ "content-type": type, ...(challenge ? { "cf-mitigated": "challenge" } : {}) }) });
  assert.equal(responseFailure(response(200, "text/html", true)), "authentication");
  assert.equal(responseFailure(response(403, "text/html", false, true)), "edge_challenge");
  assert.equal(responseFailure(response(401, "application/json")), "authentication");
  assert.equal(responseFailure(response(200, "application/json")), null);
  assert.equal(responseFailure({ ...response(0, ""), type: "opaqueredirect" }), "authentication");
  assert.equal(responseFailure(response(200, "text/html")), "unexpected_response");
  assert.equal(responseFailure(response(502, "application/json")), "server");
  assert.equal(responseFailure(response(502, "text/html")), "server");
});
test("radio retries transient errors once, never retries auth, and abort stops stale work", async () => {
  let calls = 0;
  assert.equal(await requestRadio(async () => { if (!calls++) throw Object.assign(new Error("offline"), { failure: "network" }); return "ready"; }, new AbortController().signal, 0), "ready");
  assert.equal(calls, 2); calls = 0;
  await assert.rejects(requestRadio(async () => { calls++; throw Object.assign(new Error("login"), { failure: "authentication" }); }, new AbortController().signal, 0));
  assert.equal(calls, 1);
  const controller = new AbortController();
  const pending = requestRadio(() => new Promise(() => {}), controller.signal);
  controller.abort(); await assert.rejects(pending, { name: "AbortError" });
});

test("HTTP cold playback emits correlated lifecycle stages, honours Range and retains no-store", async () => {
  const { createApp } = await import("../src/app.js");
  const previous = process.env.MUSIKE_PLAYBACK_DIAGNOSTICS; process.env.MUSIKE_PLAYBACK_DIAGNOSTICS = "true";
  const events: PlaybackFields[] = []; const id = "trace-test1"; // valid eleven-character video ID
  const app = await createApp({ enabled: false, onPlaybackEvent: (event) => events.push(event), audio: {
    candidates: async () => [{ formatId: "fallback", url: "https://fixture.invalid/media", headers: {}, mime: "audio/mp4" }],
    transport: (async (_url, init) => { assert.equal((init!.headers as any).Range, "bytes=0-2"); return new Response("abc", { status: 206, headers: { "content-length": "3", "content-range": "bytes 0-2/10" } }); }) as typeof fetch,
  } });
  try {
    const trace = "7ade7fae-355d-4406-b594-bc18145039f0";
    const response = await app.inject({ url: `/api/stream/${id}/audio?trace=${trace}`, headers: { range: "bytes=0-2" } });
    assert.equal(response.statusCode, 206); assert.equal(response.body, "abc"); assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["x-musike-trace"], trace);
    for (const stage of ["http.start", "stream.cold", "source.open", "source.first_byte", "stream.first_byte", "http.complete"]) assert.ok(events.some((event) => event.stage === stage), stage);
    assert.ok(events.every((event) => event.traceId === trace));
    assert.ok(events.every((event) => !JSON.stringify(event).includes("fixture.invalid")));
  } finally { await app.close(); if (previous === undefined) delete process.env.MUSIKE_PLAYBACK_DIAGNOSTICS; else process.env.MUSIKE_PLAYBACK_DIAGNOSTICS = previous; }
});
test("client telemetry is field-limited, bounded per owner/IP and requires auth when enabled", async () => {
  const { createApp } = await import("../src/app.js");
  const previous = process.env.MUSIKE_PLAYBACK_DIAGNOSTICS; process.env.MUSIKE_PLAYBACK_DIAGNOSTICS = "true";
  const events: PlaybackFields[] = []; const app = await createApp({ enabled: false, onPlaybackEvent: (event) => events.push(event) });
  const item = { traceId: "7ade7fae-355d-4406-b594-bc18145039f0", stage: "player.error", at: Date.now(), reason: "network" };
  try {
    for (let n = 0; n < 6; n++) assert.equal((await app.inject({ url: "/api/playback/events", method: "POST", payload: { events: Array.from({ length: 40 }, () => ({ ...item, cookie: "fixture-secret" })) } })).statusCode, 204);
    assert.equal((await app.inject({ url: "/api/playback/events", method: "POST", payload: { events: [item] } })).statusCode, 429);
    assert.ok(events.some((event) => event.reason === "network")); assert.equal(JSON.stringify(events).includes("fixture-secret"), false);
    assert.equal((await app.inject({ url: "/api/playback/events", method: "POST", payload: { events: [{ ...item, traceId: "not-a-uuid" }] } })).statusCode, 400);
  } finally { await app.close(); if (previous === undefined) delete process.env.MUSIKE_PLAYBACK_DIAGNOSTICS; else process.env.MUSIKE_PLAYBACK_DIAGNOSTICS = previous; }
});

test("error probes reuse the recent failure rather than starting another cold resolution", async () => {
  const { createApp } = await import("../src/app.js"); let attempts = 0;
  const app = await createApp({ enabled: false, audio: { candidates: async () => { attempts++; return []; } } });
  const id = "probe-test1"; const trace = "d2d17377-7115-4d83-a23d-142b82415e43";
  try {
    assert.equal((await app.inject({ url: `/api/stream/${id}/audio?trace=${trace}&probe=1` })).statusCode, 200); assert.equal(attempts, 0);
    assert.equal((await app.inject({ url: `/api/stream/${id}/audio?trace=${trace}` })).statusCode, 502); assert.equal(attempts, 1);
    const probe = await app.inject({ url: `/api/stream/${id}/audio?trace=${trace}&probe=1` });
    assert.equal(probe.statusCode, 502); assert.equal(attempts, 1); assert.ok(probe.json().error);
    assert.equal((await app.inject({ url: `/api/stream/${id}/audio?trace=3bda5ff7-0269-4fd3-9e6b-1b22b743f6bf&probe=1` })).statusCode, 200);
  } finally { await app.close(); }
});
