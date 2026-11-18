import assert from "node:assert/strict";
import { test } from "node:test";
import * as lib from "../src/library.js";
import type { Track } from "../src/types.js";

const track = (n: number): Track => ({
  id: String(n).padStart(11, "0"), title: `Song ${n}`, artist: "Artist", duration: n, thumb: "", art: "", kind: "song",
});

test("cold concurrent mutations share one read and retain both tracks", async () => {
  let reads = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const writes: string[] = [];
  lib.useLibraryStorage({ read: async () => { reads++; await gate; return null; }, write: async (json) => { writes.push(json); } });
  const first = lib.addFavorite(track(1));
  const second = lib.addFavorite(track(2));
  release();
  await Promise.all([first, second]);
  assert.equal(reads, 1);
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes.at(-1)!).favorites.map((t: Track) => t.id), [track(2).id, track(1).id]);
});

test("one failed save is reported without poisoning future writes", async () => {
  let attempts = 0;
  let saved = "";
  lib.useLibraryStorage({ read: async () => null, write: async (json) => {
    if (++attempts === 1) throw new Error("disk full");
    saved = json;
  } });
  await assert.rejects(lib.addFavorite(track(1)), /disk full/);
  await lib.addFavorite(track(2));
  assert.equal(attempts, 2);
  assert.equal(JSON.parse(saved).favorites.length, 2);
});

test("failed initial read can be retried", async () => {
  let attempts = 0;
  lib.useLibraryStorage({ read: async () => { if (++attempts === 1) throw new Error("offline"); return null; }, write: async () => {} });
  await assert.rejects(lib.getLibrary(), /offline/);
  assert.equal((await lib.getLibrary()).favorites.length, 0);
});

test("bulk playlist addition deduplicates existing and incoming tracks, preserving order", async () => {
  lib.useLibraryStorage({ read: async () => null, write: async () => {} });
  const p = await lib.createPlaylist("Mix", [track(1)]);
  await lib.addToPlaylist(p.id, [track(1), track(2), track(2), track(3)]);
  assert.deepEqual(p.tracks.map((t) => t.id), [1, 2, 3].map((n) => track(n).id));
});

test("merge matches newly appended playlists by case-insensitive name", async () => {
  lib.useLibraryStorage({ read: async () => null, write: async () => {} });
  const result = await lib.importLibrary({ playlists: [
    { id: "playlist-one", name: "Mix", tracks: [track(1)] },
    { id: "playlist-two", name: "MIX", tracks: [track(2)] },
  ] }, "merge");
  assert.equal(result.playlistsAdded, 1);
  assert.equal(result.playlistsMerged, 1);
  assert.equal((await lib.getLibrary()).playlists[0].tracks.length, 2);
});

test("filtered pagination uses matching totals and preserves collection order", async () => {
  lib.useLibraryStorage({ read: async () => null, write: async () => {} });
  const p = await lib.createPlaylist("Mix", Array.from({ length: 120 }, (_, n) => track(n)));
  const page = await lib.getTrackPage("playlist", p.id, 100, 20);
  assert.equal(page.total, 120);
  assert.equal(page.tracks.length, 20);
  assert.equal(page.tracks[0].id, track(100).id);
  assert.equal(page.hasMore, false);
  const filtered = await lib.getTrackPage("playlist", p.id, 0, 5, "song 11");
  assert.equal(filtered.total, 11);
  assert.equal(filtered.hasMore, true);
  await assert.rejects(lib.getTrackPage("playlist", "missing", 0, 10), /Playlist not found/);
});
