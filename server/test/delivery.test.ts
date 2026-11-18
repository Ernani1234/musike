import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import Fastify from "fastify";
import { byteRange } from "../src/range.js";
import { serveFile } from "../src/stream.js";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";

test("range parser handles suffix, open-ended, huge and unsupported ranges safely", () => {
  assert.deepEqual(byteRange("bytes=-3", 10), { start: 7, end: 9 });
  assert.deepEqual(byteRange("bytes=2-", 10), { start: 2, end: 9 });
  assert.deepEqual(byteRange("bytes=2-999999999999999999999", 10), { start: 2, end: 9 });
  assert.deepEqual(byteRange("bytes=-999999999999999999999", 10), { start: 0, end: 9 });
  for (const value of ["bytes=10-", "bytes=5-2", "bytes=-0", "bytes=999999999999999999999-"]) assert.equal(byteRange(value, 10), false);
  for (const value of ["bytes=-", "garbage bytes=0-1", "bytes=0-1,3-4", "bytes=1.5-4", "items=0-1"]) assert.equal(byteRange(value, 10), null);
  assert.equal(byteRange("bytes=0-1", 0), false);
});

test("cached media delivers exact byte ranges, 416, full response and empty files", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-range-"));
  const app = Fastify();
  try {
    const file = path.join(dir, "video.mp4");
    await writeFile(file, "0123456789");
    app.get("/video", (req, reply) => serveFile(req, reply, file, "video/mp4"));
    let res = await app.inject({ url: "/video", headers: { range: "bytes=-3" } });
    assert.equal(res.statusCode, 206);
    assert.equal(res.body, "789");
    assert.equal(res.headers["content-range"], "bytes 7-9/10");
    res = await app.inject({ url: "/video", headers: { range: "bytes=2-4" } });
    assert.equal(res.body, "234");
    assert.equal(res.headers["content-length"], "3");
    res = await app.inject({ url: "/video", headers: { range: "bytes=10-" } });
    assert.equal(res.statusCode, 416);
    assert.equal(res.headers["content-range"], "bytes */10");
    res = await app.inject({ url: "/video", headers: { range: "bytes=0-1,3-4" } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, "0123456789");
    await writeFile(file, "");
    assert.equal((await app.inject("/video")).statusCode, 200);
    assert.equal((await app.inject({ url: "/video", headers: { range: "bytes=0-0" } })).statusCode, 416);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test("hashed assets cache immutably, HTML revalidates, SPA fallback never swallows API 404", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-assets-"));
  const previous = config.webDist;
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    config.webDist = dir;
    await mkdir(path.join(dir, "assets"));
    await writeFile(path.join(dir, "index.html"), "<html>Musike</html>");
    await writeFile(path.join(dir, "assets", "index-abcd1234.js"), "console.log('app')");
    app = await createApp();
    const html = await app.inject("/index.html");
    assert.equal(html.headers["cache-control"], "no-cache");
    const asset = await app.inject("/assets/index-abcd1234.js");
    assert.equal(asset.headers["cache-control"], "public, max-age=31536000, immutable");
    const route = await app.inject("/playlist/example");
    assert.equal(route.statusCode, 200);
    assert.equal(route.body, "<html>Musike</html>");
    assert.equal((await app.inject("/api/missing")).statusCode, 404);
  } finally { await app?.close(); config.webDist = previous; await rm(dir, { recursive: true, force: true }); }
});
