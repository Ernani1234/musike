import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Accounts } from "../src/accounts.js";
import { PlaybackSync, type PlaybackSnapshot } from "../src/playbackSync.js";
import { config } from "../src/config.js";

const track = { id: "testtrack01", title: "Fixture", artist: "Fixture", duration: 180, thumb: "", art: "", kind: "song" as const };
const snapshot = (position = 0): PlaybackSnapshot => ({ queue: [track], original: null, index: 0, position, duration: 180, status: "playing", shuffle: false, repeat: "off", autoRadio: false });

test("dead output requires explicit takeover and fences the unreachable owner", async () => {
  let clock = Date.now();
  const dir = await mkdtemp(path.join(tmpdir(), "musike-deadlock-")); const old = config.dataDir; config.dataDir = dir;
  const a = await Accounts.open({ adminPhone: "60120000001", secret: "sync-fixture-secret-".repeat(3) });
  const user = (await a.db.get("SELECT id FROM users"))!.id;
  const sync = new PlaybackSync(a, () => clock);
  try {
    const first = await sync.register(user, "session-a", "client-aaa", "Computer");
    const second = await sync.register(user, "session-b", "client-bbb", "Phone");
    await sync.act(user, "session-a", first.deviceId, { type: "claim" });
    await sync.subscribe(user, "session-a", first.deviceId, () => {});
    // A half-open SSE connection and server heartbeat do not prove an inbound client is alive.
    clock += 60_000;
    await sync.read(user, "session-a", first.deviceId, false);
    // Before the fix this was a permanent deadlock: every claim/command 409ed forever.
    await assert.rejects(sync.act(user, "session-b", second.deviceId, { type: "claim" }), /Take over/);
    const claimed = await sync.act(user, "session-b", second.deviceId, { type: "claim", takeover: true });
    assert.equal(claimed.active, second.deviceId);
    await sync.act(user, "session-b", second.deviceId, { type: "command", action: "playList", args: [[track], 0] });
    const state = await sync.read(user, "session-b", second.deviceId);
    assert.equal(state.devices.find((d: any) => d.id === first.deviceId)?.online, false);
  } finally { await sync.close(); await a.close(); config.dataDir = old; await rm(dir, { recursive: true, force: true }); }
});

test("hung transfer from live owner times out so playback is claimable again", async () => {
  let clock = Date.now();
  const dir = await mkdtemp(path.join(tmpdir(), "musike-hang-")); const old = config.dataDir; config.dataDir = dir;
  const a = await Accounts.open({ adminPhone: "60120000001", secret: "sync-fixture-secret-".repeat(3) });
  const user = (await a.db.get("SELECT id FROM users"))!.id;
  const sync = new PlaybackSync(a, () => clock);
  try {
    const first = await sync.register(user, "session-a", "client-aaa", "Computer");
    const second = await sync.register(user, "session-b", "client-bbb", "Phone");
    await sync.act(user, "session-a", first.deviceId, { type: "claim" });
    // B requests a transfer; A goes silent while still "fresh" (seen updated, listener dropped is faked by another read keeping it fresh).
    await sync.act(user, "session-b", second.deviceId, { type: "claim" });
    const pending = await sync.read(user, "session-b", second.deviceId);
    assert.equal(pending.transfer, second.deviceId);
    clock += 35_000;
    await sync.read(user, "session-b", second.deviceId); // B stays fresh; A never acks
    const again = await sync.act(user, "session-b", second.deviceId, { type: "claim" });
    // transfer timed out and the claim re-pended from scratch (not stuck "pending" forever)
    assert.equal(again.transfer, second.deviceId);
    clock += 35_000;
    await sync.read(user, "session-b", second.deviceId); // B fresh; A never acks again
    await assert.rejects(sync.act(user, "session-b", second.deviceId, { type: "claim" }), /Take over/);
    await sync.act(user, "session-b", second.deviceId, { type: "claim", takeover: true });
  } finally { await sync.close(); await a.close(); config.dataDir = old; await rm(dir, { recursive: true, force: true }); }
});
