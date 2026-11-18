import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";

test("HTTP library contracts, bounded filtering, validation, and disk persistence", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-test-"));
  const previous = { dataDir: config.dataDir, cacheDir: config.cacheDir, webDist: config.webDist };
  Object.assign(config, { dataDir: dir, cacheDir: path.join(dir, "cache"), webDist: path.join(dir, "no-web") });
  let running: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    running = await createApp();
    const app = running;
    const request = async (url: string, method = "GET", body?: unknown) => {
      const res = await app.inject({ url, method: method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, payload: JSON.stringify(body) }),
      });
      return { status: res.statusCode, json: () => res.json() };
    };
    assert.equal((await request("/api/health")).status, 200);
    for (const url of ["/api/search", "/api/search/albums", "/api/genres/bad", "/api/genres/abcdefgh/artists?offset=-1", "/api/artists/bad", "/api/albums/bad", "/api/radio/bad", "/api/stream/bad/audio", "/api/stream/bad/video", "/api/video-for/bad?title=Song"]) {
      assert.equal((await request(url)).status, 400, url);
    }
    assert.deepEqual((await request("/api/suggest?q=")).json(), { suggestions: [] });
    assert.equal((await request("/api/prepare/bad", "POST")).status, 400);
    assert.equal((await request("/api/library/import", "POST", { backup: {} })).status, 400);
    assert.equal((await request("/api/favorites", "POST", { tracks: "bad" })).status, 400);
    const tracks = Array.from({ length: 205 }, (_, n) => ({ id: String(n).padStart(11, "0"), title: `Song ${n}`, artist: "Artist", duration: n }));
    const created = await (await request("/api/playlists", "POST", { name: "Mix", tracks })).json();
    assert.equal(created.tracks.length, 205);
    let response = await request(`/api/library/tracks?kind=playlist&pid=${created.id}&limit=100&offset=100`);
    const page = await response.json();
    assert.equal(response.status, 200);
    assert.equal(page.tracks.length, 100);
    assert.equal(page.total, 205);
    assert.equal(page.hasMore, true);
    assert.equal(page.tracks[0].id, tracks[100].id);
    const filtered = await (await request(`/api/library/tracks?kind=playlist&pid=${created.id}&q=SONG%20204`)).json();
    assert.equal(filtered.total, 1);
    for (const query of ["kind=bad", "kind=favorites&limit=201", "kind=favorites&offset=-1", "kind=favorites&offset=1.5", "kind=favorites&limit=nope", ""]) {
      assert.equal((await request(`/api/library/tracks?${query}`)).status, 400, query);
    }
    assert.equal((await request("/api/library/tracks?kind=playlist&pid=missing")).status, 404);
    response = await request(`/api/favorites/${tracks[0].id}`, "PUT", tracks[0]);
    assert.equal((await response.json()).favorites.length, 1);
    const full = await (await request("/api/library")).json();
    assert.deepEqual(Object.keys(full).sort(), ["favorites", "history", "playlists"]);
    assert.equal(full.playlists[0].tracks.length, 205);
    const backup = { format: "musike-backup", version: 1, library: full };
    assert.equal((await request("/api/library/import", "POST", { backup, mode: "merge" })).status, 200);
    assert.equal((await request(`/api/playlists/${created.id}`, "PATCH", { name: "Renamed" })).status, 200);
    const saved = JSON.parse(await readFile(path.join(dir, "library.json"), "utf8"));
    assert.equal(saved.playlists[0].name, "Renamed");
    assert.equal((await request(`/api/playlists/${created.id}`, "DELETE")).status, 204);
    assert.equal((await request("/api/unknown")).status, 404);
  } finally {
    await running?.close();
    Object.assign(config, previous);
    await rm(dir, { recursive: true, force: true });
  }
});
