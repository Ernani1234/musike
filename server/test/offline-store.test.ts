import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";
import { MIB, offlineSettings, offlineSummary, purgeOfflineOwner, readOfflineAudio, saveOfflineAudio, trimOfflineAudio, writeOfflinePin } from "../../web/src/lib/offlineStore.ts";

const track = (n: number) => ({ id: String(n).padStart(11, "0"), title: `Fixture ${n}`, artist: "Fixture", duration: 180, thumb: "", art: "", kind: "song" as const });
const playlist = (ids: number[]) => ({ id: "personal", name: "Pinned", createdAt: 1, updatedAt: 1, tracks: ids.map(track) });
test("offline audio is atomic, budgeted, owner-scoped and evicts the oldest unpinned body", async () => {
  const owner = "budget-owner"; const other = "isolated-owner";
  const blob = new Blob([new Uint8Array(64 * MIB)], { type: "audio/mp4" });
  await offlineSettings(owner, { enabled: true, budget: 512 * MIB });
  await offlineSettings(other, { enabled: true });
  try {
    for (let n = 1; n <= 8; n++) await saveOfflineAudio(owner, track(n), blob, n);
    await writeOfflinePin({ owner, id: "personal", playlist: playlist([1]), pending: null, error: "" });
    await saveOfflineAudio(owner, track(9), blob, 9);
    const summary = await offlineSummary(owner);
    assert.equal(summary.bytes, 512 * MIB);
    assert.equal(summary.entries.length, 8);
    assert.equal(await readOfflineAudio(owner, track(2).id), null);
    assert.equal((await readOfflineAudio(owner, track(1).id))?.size, blob.size);
    assert.equal(await readOfflineAudio(other, track(1).id), null);
    await saveOfflineAudio(other, track(1), new Blob(["other"], { type: "audio/webm" }));
    await trimOfflineAudio(owner, true);
    assert.deepEqual((await offlineSummary(owner)).entries.map(e => e.id), [track(1).id]);
    await purgeOfflineOwner(owner);
    assert.equal((await offlineSummary(owner)).bytes, 0);
    assert.equal((await offlineSummary(owner)).settings.enabled, false);
    assert.equal(await (await readOfflineAudio(other, track(1).id))!.text(), "other");
  } finally { await purgeOfflineOwner(owner); await purgeOfflineOwner(other); }
});
test("lowering budget preserves all pinned and pending-update audio and rejects an over-budget addition", async () => {
  const owner = "pinned-owner"; const blob = new Blob([new Uint8Array(64 * MIB)], { type: "audio/webm" });
  await offlineSettings(owner, { enabled: true, budget: 1024 * MIB });
  try {
    for (let n = 1; n <= 9; n++) await saveOfflineAudio(owner, track(n), blob, n);
    await writeOfflinePin({ owner, id: "personal", playlist: playlist([1]), pending: playlist([2, 3, 4, 5, 6, 7, 8, 9]), error: "" });
    await offlineSettings(owner, { budget: 512 * MIB }); await trimOfflineAudio(owner);
    assert.equal((await offlineSummary(owner)).bytes, 576 * MIB);
    await assert.rejects(saveOfflineAudio(owner, track(10), blob), /budget/);
    assert.equal((await offlineSummary(owner)).entries.length, 9);
    assert.equal(await readOfflineAudio(owner, track(10).id), null);
    await assert.rejects(saveOfflineAudio(owner, track(11), new Blob(["video"], { type: "video/mp4" })), /Invalid audio/);
    await offlineSettings(owner, { enabled: false });
    assert.equal(await saveOfflineAudio(owner, track(10), blob), false);
  } finally { await purgeOfflineOwner(owner); }
});
test("concurrent offline writes serialize budget admission without evicting pins", async () => {
  const owner = "concurrent-owner"; const blob = new Blob([new Uint8Array(64 * MIB)], { type: "audio/mp4" });
  await offlineSettings(owner, { enabled: true, budget: 512 * MIB });
  try {
    await writeOfflinePin({ owner, id: "personal", playlist: playlist([1]), pending: null, error: "" });
    await Promise.all(Array.from({ length: 10 }, (_, n) => saveOfflineAudio(owner, track(n + 1), blob, n + 1)));
    const summary = await offlineSummary(owner);
    assert.equal(summary.bytes, 512 * MIB); assert.equal(summary.entries.length, 8);
    assert.ok(summary.entries.some(e => e.id === track(1).id));
  } finally { await purgeOfflineOwner(owner); }
});
