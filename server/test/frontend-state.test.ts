import assert from "node:assert/strict";
import { test } from "node:test";
import { createLibraryStore } from "../../web/src/stores/libraryState.js";
import { en } from "../../web/src/i18n/en.js";
import type { MusikeApi } from "../../web/src/lib/apiTypes.js";
import type { Library, Track } from "../../web/src/lib/types.js";
import { playerWriter, type SavedPlayer } from "../../web/src/lib/playerPersistence.js";
import { SessionCache } from "../../web/src/lib/sessionCache.js";

const track = (n: number): Track => ({ id: String(n).padStart(11, "0"), title: `Song ${n}`, artist: "Artist", duration: n, thumb: "", art: "", kind: "song" });
const empty = (): Library => ({ favorites: [], playlists: [], history: [] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const makeStore = (api: Partial<MusikeApi>) => createLibraryStore(api as MusikeApi, () => en, () => {});

test("favorites remain optimistic while older responses settle and requests run in order", async () => {
  const first = deferred<{ favorites: Track[] }>();
  const second = deferred<{ favorites: Track[] }>();
  const calls: string[] = [];
  const store = makeStore({ addFavorite: (t) => { calls.push(t.id); return calls.length === 1 ? first.promise : second.promise; } });
  const a = store.getState().toggleFavorite(track(1));
  const b = store.getState().toggleFavorite(track(2));
  assert.deepEqual(store.getState().favorites.map((t) => t.id), [track(2).id, track(1).id]);
  await flush();
  assert.equal(calls.length, 1);
  first.resolve({ favorites: [track(1)] });
  await a; await flush();
  assert.deepEqual(store.getState().favorites.map((t) => t.id), [track(2).id, track(1).id]);
  assert.equal(calls.length, 2);
  second.resolve({ favorites: [track(2), track(1)] });
  await b;
});

test("failed optimistic write rolls back only itself, retaining a later successful edit", async () => {
  const first = deferred<{ favorites: Track[] }>();
  let calls = 0;
  const store = makeStore({ addFavorite: async (t) => ++calls === 1 ? first.promise : { favorites: [t] } });
  const a = store.getState().toggleFavorite(track(1));
  const b = store.getState().toggleFavorite(track(2));
  await flush(); first.reject(new Error("offline"));
  await Promise.all([a, b]);
  assert.deepEqual(store.getState().favorites.map((t) => t.id), [track(2).id]);
});

test("rapid double toggle preserves the latest off intent even if the add fails", async () => {
  const first = deferred<{ favorites: Track[] }>();
  const calls: string[] = [];
  const store = makeStore({ addFavorite: () => { calls.push("add"); return first.promise; },
    removeFavorite: async () => { calls.push("remove"); return { favorites: [] }; } });
  const a = store.getState().toggleFavorite(track(1));
  const b = store.getState().toggleFavorite(track(1));
  assert.equal(store.getState().favorites.length, 0);
  await flush(); first.reject(new Error("offline"));
  await Promise.all([a, b]);
  assert.equal(store.getState().favorites.length, 0);
  assert.deepEqual(calls, ["add", "remove"]);
});

test("initial loading is coalesced and cannot erase a pending favorite", async () => {
  const initial = deferred<Library>();
  const added = deferred<{ favorites: Track[] }>();
  let reads = 0;
  const store = makeStore({ library: () => { reads++; return initial.promise; }, addFavorite: () => added.promise });
  const one = store.getState().load();
  const two = store.getState().load();
  assert.equal(one, two);
  const favorite = store.getState().toggleFavorite(track(1));
  await flush();
  assert.equal(reads, 1);
  initial.resolve({ ...empty(), favorites: [track(2)] });
  await one;
  assert.deepEqual(store.getState().favorites.map((t) => t.id), [track(1).id, track(2).id]);
  added.resolve({ favorites: [track(1), track(2)] });
  await favorite;
});

test("failed playlist deletion does not roll back a later rename", async () => {
  const deleted = deferred<void>();
  const playlists = [1, 2].map((id) => ({ id: String(id), name: `Mix ${id}`, tracks: [], createdAt: 0, updatedAt: 0 }));
  const store = makeStore({ library: async () => ({ ...empty(), playlists }), deletePlaylist: () => deleted.promise,
    renamePlaylist: async () => ({ ...playlists[1], name: "New name" }) });
  await store.getState().load();
  const a = store.getState().deletePlaylist("1");
  const b = store.getState().renamePlaylist("2", "New name");
  assert.equal(store.getState().playlists.length, 1);
  assert.equal(store.getState().playlists[0].name, "New name");
  await flush(); deleted.reject(new Error("offline"));
  await Promise.all([a, b]);
  assert.deepEqual(store.getState().playlists.map((p) => p.name), ["Mix 1", "New name"]);
});

test("backup import is ordered with pending and subsequent library edits", async () => {
  let data = empty();
  const add = deferred<{ favorites: Track[] }>();
  const calls: string[] = [];
  const store = makeStore({
    addFavorite: async (t) => {
      calls.push(`add:${t.id}`);
      if (t.id === track(1).id) { const result = await add.promise; data.favorites = result.favorites; return result; }
      data = { ...data, favorites: [t, ...data.favorites] };
      return { favorites: data.favorites };
    },
    importLibrary: async () => { calls.push("import"); data = { ...empty(), favorites: [track(3)] };
      return { playlistsAdded: 0, playlistsMerged: 0, tracksAdded: 0, favoritesAdded: 1 }; },
    library: async () => structuredClone(data),
  });
  const a = store.getState().toggleFavorite(track(1));
  const imported = store.getState().importLibrary({}, "replace");
  const b = store.getState().toggleFavorite(track(2));
  await flush(); add.resolve({ favorites: [track(1)] });
  await Promise.all([a, imported, b]);
  assert.deepEqual(calls, [`add:${track(1).id}`, "import", `add:${track(2).id}`]);
  assert.deepEqual(store.getState().favorites.map((t) => t.id), [track(2).id, track(3).id]);
});

test("session cache bounds retention, expires null entries, and supports invalidation", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100 });
  const cache = new SessionCache<string, null | number>(2, 1000);
  cache.set("a", null).set("b", 2).set("c", 3);
  assert.equal(cache.has("a"), false);
  cache.set("b", null);
  assert.equal(cache.has("b"), true);
  assert.equal(cache.get("b"), null);
  t.mock.timers.tick(1000);
  assert.equal(cache.has("b"), false);
  assert.deepEqual([...cache], []);
});

const snapshot = (): SavedPlayer => ({ queue: [track(1)], original: null, index: 0, position: 0, volume: 1,
  muted: false, shuffle: false, repeat: "off", preferVideo: false, quality: "sd", autoRadio: true });

test("playback persistence reuses track serialization and skips unchanged paused saves", () => {
  let serializations = 0;
  let writes = 0;
  let saved = "";
  const data = snapshot();
  Object.assign(data.queue[0], { toJSON() { serializations++; return { ...track(1) }; } });
  const write = playerWriter({ setItem: (_key, value) => { saved = value; writes++; } }, "player");
  write(data); write(data);
  write({ ...data, position: 4 });
  assert.equal(serializations, 1);
  assert.equal(writes, 2);
  assert.equal(JSON.parse(saved).position, 4);
  assert.equal(JSON.parse(saved).queue[0].id, track(1).id);
});

test("saved playback retains the active song beyond row 500 and a matching shuffle order", () => {
  let saved = "";
  const queue = Array.from({ length: 700 }, (_, i) => track(i));
  const data = { ...snapshot(), queue, original: [...queue].reverse(), index: 650, shuffle: true };
  playerWriter({ setItem: (_key, value) => { saved = value; } }, "player")(data);
  const restored = JSON.parse(saved) as SavedPlayer;
  assert.equal(restored.queue.length, 500);
  assert.equal(restored.queue[restored.index].id, track(650).id);
  assert.deepEqual(restored.original!.map((t) => t.id).sort(), restored.queue.map((t) => t.id).sort());
});
