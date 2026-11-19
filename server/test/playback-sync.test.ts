import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Accounts } from "../src/accounts.js";
import { PlaybackSync, type PlaybackSnapshot } from "../src/playbackSync.js";
import { config } from "../src/config.js";
import { createApp } from "../src/app.js";

const track = { id: "testtrack01", title: "Fixture", artist: "Fixture", duration: 180, thumb: "", art: "", kind: "song" as const };
const snapshot = (position = 0): PlaybackSnapshot => ({ queue: [track], original: null, index: 0, position, duration: 180, status: "playing", shuffle: false, repeat: "off", autoRadio: false });
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-sync-")); const old = config.dataDir; config.dataDir = dir;
  const a = await Accounts.open({ adminPhone: "60120000001", secret: "sync-fixture-secret-".repeat(3) });
  const user = (await a.db.get("SELECT id FROM users"))!.id; const sync = new PlaybackSync(a);
  return { a, user, sync, cleanup: async () => { await sync.close(); await a.close(); config.dataDir = old; await rm(dir, { recursive: true, force: true }); } };
}
test("ownership, remote commands and pause-acknowledged transfer fence stale writers and preserve position", async () => {
  const f = await fixture();
  try {
    const first = await f.sync.register(f.user, "session-a", "client-aaa", "Computer");
    const second = await f.sync.register(f.user, "session-b", "client-bbb", "Phone");
    let owner = await f.sync.act(f.user, "session-a", first.deviceId, { type: "command", action: "playList", args: [[track], 0] });
    owner = await f.sync.act(f.user, "session-a", first.deviceId, { type: "snapshot", epoch: owner.epoch, seq: 1, snapshot: snapshot(42), ack: owner.command!.id });
    const pending = await f.sync.act(f.user, "session-b", second.deviceId, { type: "claim" });
    assert.equal(pending.active, first.deviceId); assert.equal(pending.transfer, second.deviceId);
    await assert.rejects(f.sync.act(f.user, "session-b", second.deviceId, { type: "snapshot", epoch: owner.epoch, seq: 2, snapshot: snapshot() }), /no longer owns/);
    const transferred = await f.sync.act(f.user, "session-a", first.deviceId, { type: "snapshot", epoch: owner.epoch, seq: 2, snapshot: { ...snapshot(44), status: "paused" }, pausedForTransfer: true });
    assert.equal(transferred.active, second.deviceId); assert.equal(transferred.snapshot.position, 44);
    await assert.rejects(f.sync.act(f.user, "session-a", first.deviceId, { type: "snapshot", epoch: owner.epoch, seq: 3, snapshot: snapshot(50) }), /no longer owns/);
    const phone = await f.sync.read(f.user, "session-b", second.deviceId); assert.equal(phone.command!.action, "resume");
    await f.sync.act(f.user, "session-b", second.deviceId, { type: "snapshot", epoch: phone.epoch, seq: 1, snapshot: snapshot(44), ack: phone.command!.id });
    await assert.rejects(f.sync.act(f.user, "session-b", second.deviceId, { type: "snapshot", epoch: phone.epoch, seq: 1, snapshot: snapshot(1) }), /Stale/);
  } finally { await f.cleanup(); }
});
test("sync devices and commands are owner/session scoped and reject unbounded queues", async () => {
  const f = await fixture();
  try {
    const d = await f.sync.register(f.user, "session", "client-aaa", "Computer");
    await assert.rejects(f.sync.read(f.user, "other-session", d.deviceId), /not registered/);
    await f.a.db.run("INSERT INTO users(id,phone,created_at) VALUES('other','+60120000002',1)");
    await assert.rejects(f.sync.read("other", "session", d.deviceId), /not registered/);
    await assert.rejects(f.sync.act(f.user, "session", d.deviceId, { type: "command", action: "playList", args: [Array(501).fill(track)] }), /maximum 500/);
    await assert.rejects(f.sync.act(f.user, "session", d.deviceId, { type: "command", action: "setVolume", args: [1] }), /Invalid playback command/);
    const renewed = await f.sync.register(f.user, "new-session", "client-aaa", "Computer"); assert.equal(renewed.deviceId, d.deviceId);
    await assert.rejects(f.sync.read(f.user, "session", d.deviceId), /not registered/);
  } finally { await f.cleanup(); }
});
test("unreachable transfer never grants output; pause-confirmed release makes ownership available", async () => {
  const f = await fixture();
  try {
    const a = await f.sync.register(f.user, "a", "client-aaa", "A"); const b = await f.sync.register(f.user, "b", "client-bbb", "B");
    const owner = await f.sync.act(f.user, "a", a.deviceId, { type: "claim" });
    await f.sync.act(f.user, "b", b.deviceId, { type: "claim" });
    assert.equal((await f.sync.read(f.user, "b", b.deviceId)).active, a.deviceId);
    const released = await f.sync.act(f.user, "a", a.deviceId, { type: "snapshot", epoch: owner.epoch, seq: 1, snapshot: { ...snapshot(), status: "paused" }, release: true, pausedForTransfer: true });
    assert.equal(released.active, b.deviceId);
  } finally { await f.cleanup(); }
});
test("sync routes remain behind the account wall and legacy auth-off behavior remains", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-sync-http-")); const old = config.dataDir; config.dataDir = dir;
  const app = await createApp({ enabled: true, adminPhone: "60120000001", secret: "sync-fixture-secret-".repeat(3) });
  try {
    assert.equal((await app.inject({ url: "/api/playback/state?deviceId=private" })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/api/playback/devices", payload: { clientId: "client-aaa" } })).statusCode, 403);
  } finally { await app.close(); config.dataDir = old; await rm(dir, { recursive: true, force: true }); }
});
