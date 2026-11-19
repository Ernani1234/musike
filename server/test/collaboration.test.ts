import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Accounts } from "../src/accounts.js";
import { PlaybackSync, type PlaybackSnapshot } from "../src/playbackSync.js";
import { Social } from "../src/social.js";
import { Jams } from "../src/jams.js";
import { PlaylistImport, playlistId } from "../src/playlistImport.js";
import { config } from "../src/config.js";
const track = (n: number) => ({ id: String(n).padStart(11, "0"), title: `Song ${n}`, artist: "Fixture", duration: 180, art: "", thumb: "", kind: "song" as const });
const state = (): PlaybackSnapshot => ({ queue: [track(1)], index: 0, original: null, position: 10, duration: 180, status: "playing", shuffle: false, repeat: "off", autoRadio: false });
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-collaboration-")); const previous = config.dataDir; config.dataDir = dir; let now = Date.now();
  const a = await Accounts.open({ secret: "collaboration-test-only-secret-".repeat(3), now: () => now });
  for (const [id, number] of [["alice", 1], ["bob", 2], ["carol", 3]] as const) await a.db.run("INSERT INTO users(id,phone,role,created_at) VALUES(?,?,?,?)", [id, `+6012000000${number}`, id === "alice" ? "admin" : "user", now]);
  const sync = new PlaybackSync(a, () => now); const social = new Social(a, sync); const jams = new Jams(a, sync);
  const services: PlaylistImport[] = [];
  return { a, sync, social, jams, dir, advance: (ms: number) => { now += ms; }, service: (options: ConstructorParameters<typeof PlaylistImport>[1]) => { const s = new PlaylistImport(a, options); services.push(s); return s; },
    cleanup: async () => { for (const s of services) await s.close(); await sync.close(); await a.close(); config.dataDir = previous; await rm(dir, { recursive: true, force: true }); } };
}
async function friends(f: Awaited<ReturnType<typeof fixture>>, one = "alice", two = "bob") {
  const { code } = await f.social.state(two); await f.social.request(one, code); await f.social.respond(two, one, true);
}
async function terminal(service: PlaylistImport, owner: string, id: string) {
  for (let n = 0; n < 200; n++) { const result = await service.status(owner, id); if (!['queued','running'].includes(result!.status)) return result!; await new Promise(r => setTimeout(r, 5)); }
  throw new Error("Fixture import did not complete");
}
test("friend codes require acceptance, never expose phones, and presence is opt-in", async () => {
  const f = await fixture(); try {
    const bob = await f.social.state("bob"); await f.social.request("alice", bob.code);
    assert.equal((await f.social.state("alice")).friends.length, 0);
    await assert.rejects(f.social.respond("carol", "alice", true), /not found/);
    await f.social.respond("bob", "alice", true);
    const d = await f.sync.register("bob", "b", "bob-client", "Phone"); let view = await f.sync.act("bob", "b", d.deviceId, { type: "claim" });
    await f.sync.act("bob", "b", d.deviceId, { type: "snapshot", epoch: view.epoch, seq: 1, snapshot: state() });
    let result = await f.social.state("alice"); assert.equal(result.friends[0]!.online, null); assert.equal(result.friends[0]!.track, null); assert.ok(!JSON.stringify(result).includes("6012"));
    await f.social.preferences("bob", { online: true, track: true }); result = await f.social.state("alice"); assert.equal(result.friends[0]!.online, true); assert.equal(result.friends[0]!.track!.id, track(1).id);
    await f.social.removeFriend("alice", "bob"); assert.equal((await f.social.state("bob")).friends.length, 0);
  } finally { await f.cleanup(); }
});
test("shared playlists enforce viewer/editor grants, revision conflicts and explicit independent copies", async () => {
  const f = await fixture(); try {
    const p = await f.a.library("alice").createPlaylist("Original", [track(1)]);
    await assert.rejects(f.social.share("alice", { playlist: p.id, user: "bob" }), /accepted friends/);
    await friends(f); const share = await f.social.share("alice", { playlist: p.id, user: "bob" });
    await assert.rejects(f.social.shared("carol", share.id), /not found/);
    const read = await f.social.shared("bob", share.id); assert.equal(read.permission, "viewer");
    await assert.rejects(f.social.editShared("bob", share.id, { revision: p.updatedAt, name: "Hijacked", tracks: [] }), /read only/);
    await f.social.share("alice", { playlist: p.id, user: "bob", permission: "editor" });
    const revision = p.updatedAt; await f.social.editShared("bob", share.id, { revision, name: "Edited", tracks: [track(2), track(1)] });
    await assert.rejects(f.social.editShared("bob", share.id, { revision, name: "Stale", tracks: [] }), /changed/);
    const copy = await f.social.copy("bob", share.id); await f.social.share("alice", { playlist: p.id, user: "bob", revoke: true });
    await assert.rejects(f.social.shared("bob", share.id), /not found/);
    assert.deepEqual((await f.a.library("bob").getLibrary()).playlists.find(p => p.id === copy.id)!.tracks.map(t => t.id), [track(2).id, track(1).id]);
  } finally { await f.cleanup(); }
});
test("group owner controls membership and revocation immediately removes group playlist access", async () => {
  const f = await fixture(); try {
    await friends(f); const group = await f.social.createGroup("alice", "Family");
    await assert.rejects(f.social.editGroup("alice", group.id, { member: "carol" }), /accepted friends/);
    await f.social.editGroup("alice", group.id, { member: "bob" });
    await assert.rejects(f.social.editGroup("bob", group.id, { name: "Takeover" }), /owner/);
    const p = await f.a.library("alice").createPlaylist("Group music", [track(1)]); const share = await f.social.share("alice", { playlist: p.id, group: group.id });
    assert.equal((await f.social.shared("bob", share.id)).permission, "viewer");
    await f.social.editGroup("bob", group.id, { member: "bob", remove: true }); await assert.rejects(f.social.shared("bob", share.id), /not found/);
  } finally { await f.cleanup(); }
});
test("jam invitation, guest controls, version fencing, host death and explicit replacement never deadlock", async () => {
  const f = await fixture(); try {
    const d = await f.sync.register("alice", "a", "alice-client", "A"); await f.sync.act("alice", "a", d.deviceId, { type: "claim" });
    let room = await f.jams.create("alice"); const invite = await f.jams.invite("alice", room.id); await f.jams.join("bob", invite.code);
    await assert.rejects(f.jams.view("carol", room.id), /not found/);
    await assert.rejects(f.jams.command("bob", room.id, { version: room.version, action: "toggle", args: [] }), /host/);
    room = await f.jams.command("alice", room.id, { version: room.version, action: "playList", args: [[track(1)], 0] });
    room = await f.jams.command("bob", room.id, { version: room.version, action: "addToQueue", args: [track(2)] }); assert.equal(room.snapshot.queue.length, 2);
    await assert.rejects(f.jams.command("alice", room.id, { version: room.version - 1, action: "next", args: [] }), /changed/);
    f.advance(46000); room = await f.jams.view("bob", room.id); assert.equal(room.host, null); assert.equal(room.snapshot.status, "paused");
    room = await f.jams.claim("bob", room.id); assert.equal(room.host, "bob");
    await f.jams.settings("alice", room.id, { revokeInvites: true }); await assert.rejects(f.jams.join("carol", invite.code), /expired or revoked/);
    await f.jams.leave("bob", room.id); room = await f.jams.view("alice", room.id); assert.equal(room.host, null);
  } finally { await f.cleanup(); }
});
test("jam lock and membership capacity prevent unsolicited entry; only granted device receives audio commands", async () => {
  const f = await fixture(); try {
    const a = await f.sync.register("alice", "a", "alice-output", "A"); const b = await f.sync.register("alice", "b", "alice-mirror", "B");
    await f.sync.act("alice", "a", a.deviceId, { type: "claim" }); const room = await f.jams.create("alice"); const invite = await f.jams.invite("alice", room.id);
    await assert.rejects(f.jams.settings("alice", room.id, { remove: "carol", guestControls: true }), /member not found/);
    assert.equal((await f.jams.view("alice", room.id)).guestControls, false);
    await f.jams.settings("alice", room.id, { locked: true }); await assert.rejects(f.jams.join("bob", invite.code), /locked/);
    await f.jams.settings("alice", room.id, { locked: false }); await f.jams.join("bob", invite.code);
    await f.jams.command("alice", room.id, { version: room.version, action: "playList", args: [[track(1)], 0] });
    assert.equal((await f.sync.read("alice", "a", a.deviceId)).command!.action, "jam"); assert.equal((await f.sync.read("alice", "b", b.deviceId)).command, null);
  } finally { await f.cleanup(); }
});
test("public playlist import validates URLs and preserves order, partial failures, ownership and dedup on rerun", async () => {
  const f = await fixture(); try {
    for (const url of ["file:///etc/passwd", "https://youtube.com.evil.test/playlist?list=PLabcdefghij", "https://youtube.com@evil.test/playlist?list=PLabcdefghij", "https://youtube.com:444/playlist?list=PLabcdefghij"]) assert.throws(() => playlistId(url));
    assert.equal(playlistId("https://music.youtube.com/watch?v=00000000001&list=PLabcdefghij"), "PLabcdefghij");
    let failed = true; let resolutions = 0;
    const service = f.service({ extract: async () => ({ title: "Playlist", entries: [track(1), track(2), { id: "private", title: "[Private video]" }, track(3)] }), resolve: async t => { resolutions++; if (t.id === track(2).id && failed) throw new Error("Fixture unavailable"); return t; } });
    const run = await service.start("alice", { url: "https://youtube.com/playlist?list=PLabcdefghij" }); let report = await terminal(service, "alice", run.id);
    assert.equal(report.status, "partial"); assert.equal(report.summary.added, 2); assert.equal(report.summary.skipped, 1); assert.equal(report.summary.failed, 1);
    await assert.rejects(service.status("bob", run.id), /not found/);
    failed = false; await service.resume("alice", run.id); report = await terminal(service, "alice", run.id); assert.equal(report.status, "done");
    const p = (await f.a.library("alice").getLibrary()).playlists[0]!; assert.deepEqual(p.tracks.map(t => t.id), [track(1).id, track(3).id, track(2).id]); // resume appends, preserving completed edits
    const before = resolutions; const second = await service.start("alice", { url: "https://youtube.com/playlist?list=PLabcdefghij" }); await terminal(service, "alice", second.id); assert.equal(resolutions, before); assert.equal((await f.a.library("alice").getLibrary()).playlists.length, 1);
  } finally { await f.cleanup(); }
});
test("playlist import exposes progress before completion and cancellation retains a resumable checkpoint", async () => {
  const f = await fixture(); let release: (() => void) | undefined;
  try {
    const service = f.service({ extract: async () => ({ title: "Progress", entries: [track(1), track(2)] }), resolve: async (t, signal) => { if (t.id === track(2).id) await new Promise<void>((resolve, reject) => { release = resolve; signal.addEventListener("abort", () => reject(new Error("Cancelled")), { once: true }); }); return t; } });
    const run = await service.start("alice", { url: "https://youtube.com/playlist?list=PLprogressxx" });
    for (let n = 0; n < 100 && !release; n++) await new Promise(r => setTimeout(r, 5));
    const progress = await service.status("alice", run.id); assert.equal(progress!.summary.processed, 1); assert.equal(progress!.status, "running");
    await service.cancel("alice", run.id); assert.equal((await service.status("alice", run.id))!.status, "cancelled");
    assert.equal((await f.a.library("alice").getLibrary()).playlists[0]!.tracks.length, 1);
  } finally { release?.(); await f.cleanup(); }
});
test("admin direct Malaysian phone editing rejects collisions, invalidates challenges and preserves UUID ownership", async () => {
  const f = await fixture(); try {
    const p = await f.a.library("bob").createPlaylist("Keep", [track(1)]);
    await f.a.db.run("INSERT INTO otps(id,phone,ip,hash,expires_at,created_at,delivery) VALUES('old-code','+60120000002','local','hash',1,1,'sent')");
    await f.a.db.run("INSERT INTO sessions VALUES('access','refresh','enc','bob',9999999999999,9999999999999,1)");
    await assert.rejects(f.a.changeUser("bob", "carol", { phone: "0120000004" }, "local"), /Administrator/);
    await assert.rejects(f.a.changeUser("alice", "bob", { phone: "+6582507737" }, "local"), /Malaysian/);
    await assert.rejects(f.a.changeUser("alice", "bob", { phone: "+60120000003" }, "local"), /assigned/);
    const changed = await f.a.changeUser("alice", "bob", { phone: "0120000004" }, "local"); assert.equal(changed!.id, "bob"); assert.equal(changed!.phone, "+60120000004");
    assert.equal((await f.a.db.get("SELECT count(*) AS n FROM sessions WHERE user_id='bob'"))!.n, 0); assert.equal((await f.a.db.get("SELECT count(*) AS n FROM otps"))!.n, 0);
    assert.equal((await f.a.library("bob").getLibrary()).playlists[0]!.id, p.id);
  } finally { await f.cleanup(); }
});
test("hard delete removes all owned data with FK restrictions handled and keeps sanitized audit evidence", async () => {
  const f = await fixture(); try {
    await friends(f); const p = await f.a.library("bob").createPlaylist("Delete", [track(1)]); const share = await f.social.share("bob", { playlist: p.id, user: "alice" });
    const group = await f.social.createGroup("bob", "Owned group"); const room = await f.jams.create("bob");
    await f.a.db.run("INSERT INTO invites VALUES('created',NULL,1,NULL,'bob')"); await f.a.db.run("INSERT INTO invites VALUES('used',NULL,1,'bob','alice')");
    await f.sync.applyJam("bob", state());
    f.a.onRevoke = async (user, deleting) => { await f.jams.revokeUser(user, deleting); await f.sync.dropUser(user); };
    await assert.rejects(f.a.deleteUser("alice", "alice", "alice", "local"), /own account/);
    await assert.rejects(f.a.deleteUser("alice", "bob", "wrong", "local"), /Type/);
    await f.a.deleteUser("alice", "bob", "bob", "local");
    for (const [table, column, value] of [["users","id","bob"],["libraries","user_id","bob"],["playback_state","user_id","bob"],["shared_playlists","id",share.id],["social_groups","id",group.id],["jam_rooms","id",room.id]]) assert.equal((await f.a.db.get(`SELECT count(*) AS n FROM ${table} WHERE ${column}=?`, [value!]))!.n, 0);
    assert.equal((await f.a.db.all("PRAGMA foreign_key_check")).length, 0); assert.equal((await f.a.db.get("SELECT count(*) AS n FROM invites"))!.n, 0);
    const audit = await f.a.db.get("SELECT * FROM audit WHERE action='admin.user.delete'"); assert.equal(audit!.target, "bob"); assert.ok(!JSON.stringify(audit).includes("6012"));
  } finally { await f.cleanup(); }
});
test("social migration is backed up for existing data and idempotent on reopen", async () => {
  const f = await fixture(); try {
    const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/db.ts", import.meta.url), "utf8"));
    const ddl = source.split("const socialSchema = `")[1]!.split("INSERT INTO migrations")[0]!;
    const tables = [...ddl.matchAll(/CREATE TABLE (\w+)/g)].map(m => m[1]!).reverse();
    const indexes = [...ddl.matchAll(/CREATE INDEX (\w+) ON (users|invites|clients|otps|oauth_states)\(/g)].map(m => m[1]!);
    await f.a.db.batch([...tables.map(name => ({ sql: `DROP TABLE ${name}` })), ...indexes.map(name => ({ sql: `DROP INDEX ${name}` })), { sql: "DELETE FROM migrations WHERE key='social-import-admin-v1'" }]);
    await f.a.close();
    const reopened = await Accounts.open({ secret: "collaboration-test-only-secret-".repeat(3) });
    try { assert.equal((await reopened.db.get("SELECT count(*) AS n FROM users"))!.n, 3); assert.ok(await reopened.db.get("SELECT value FROM migrations WHERE key='social-import-admin-v1'")); } finally { await reopened.close(); }
    const backups = (await readdir(f.dir)).filter(name => name.includes("before-social-import")); assert.equal(backups.length, 1);
    const again = await Accounts.open({ secret: "collaboration-test-only-secret-".repeat(3) }); await again.close();
    assert.deepEqual((await readdir(f.dir)).filter(name => name.includes("before-social-import")), backups);
  } finally { await f.cleanup(); }
});
