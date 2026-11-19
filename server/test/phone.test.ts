import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { malaysianPhone } from "../src/phone.js";
import { Accounts } from "../src/accounts.js";
import { Database } from "../src/db.js";
import { config } from "../src/config.js";

test("Malaysian local, international and formatted identities converge; foreign and malformed input is rejected", () => {
  for (const input of ["011-300 0675", "+60113000675", "60113000675", "0060113000675", " (011) 300-0675 "])
    assert.equal(malaysianPhone(input), "+60113000675");
  for (const input of ["+6582507737", "6582507737", "006582507737", "+441234567890", "++60123456789", "6012abc", "012", "+600123456789", null])
    assert.throws(() => malaysianPhone(input));
});
async function legacy(phones: string[]) {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-phone-")); const old = config.dataDir; config.dataDir = dir;
  const db = await Database.open(path.join(dir, "musike.sqlite"));
  for (const [n, phone] of phones.entries()) await db.run("INSERT INTO users(id,phone,created_at) VALUES(?,?,?)", [`user-${n}`, phone, Date.now()]);
  await db.run("INSERT INTO libraries(user_id,json,updated_at) VALUES(?,?,?)", ["user-0", JSON.stringify({ favorites: [], playlists: [], history: [] }), 1]);
  await db.run("INSERT INTO invites(hash,phone,expires_at,created_by) VALUES('bound',?,9999999999999,'user-0')", [phones[0]!]);
  await db.run("INSERT INTO otps(id,phone,ip,hash,expires_at,created_at,delivery) VALUES('old',?,'local','hash',9999999999999,1,'sent')", [phones[0]!]);
  await db.close();
  return { dir, cleanup: async () => { config.dataDir = old; await rm(dir, { recursive: true, force: true }); } };
}
test("legacy phone migration backs up consistently, preserves ownership and invites, invalidates OTPs and is idempotent", async () => {
  const f = await legacy(["011-300 0675"]); let a: Accounts | undefined;
  try {
    a = await Accounts.open({ adminPhone: "0113000675", secret: "fixture-secret-".repeat(4) });
    assert.equal((await a.db.get("SELECT phone FROM users WHERE id='user-0'"))!.phone, "+60113000675");
    assert.equal((await a.db.get("SELECT phone FROM invites WHERE hash='bound'"))!.phone, "+60113000675");
    assert.equal((await a.db.get("SELECT count(*) AS n FROM otps"))!.n, 0);
    assert.ok(await a.db.get("SELECT user_id FROM libraries WHERE user_id='user-0'"));
    const files = (await readdir(f.dir)).filter((s) => s.includes("before-malaysia-phone")); assert.equal(files.length, 1);
    const backup = await Database.open(path.join(f.dir, files[0]!));
    assert.equal((await backup.get("SELECT phone FROM users WHERE id='user-0'"))!.phone, "011-300 0675"); await backup.close();
    await a.close(); a = await Accounts.open({ adminPhone: "+60113000675", secret: "fixture-secret-".repeat(4) });
    assert.equal((await readdir(f.dir)).filter((s) => s.includes("before-malaysia-phone")).length, 1);
  } finally { await a?.close(); await f.cleanup(); }
});
test("normalization collisions stop before changing any user, library or migration marker", async () => {
  const f = await legacy(["011-300 0675", "60113000675"]);
  try {
    await assert.rejects(Accounts.open({ secret: "fixture-secret-".repeat(4) }), /duplicate normalized/);
    const db = await Database.open(path.join(f.dir, "musike.sqlite"));
    assert.deepEqual((await db.all("SELECT phone FROM users ORDER BY id")).map((s) => s.phone), ["011-300 0675", "60113000675"]);
    assert.equal(await db.get("SELECT key FROM migrations WHERE key='malaysia-phone-v1'"), undefined);
    assert.equal((await db.get("SELECT count(*) AS n FROM libraries"))!.n, 1); await db.close();
  } finally { await f.cleanup(); }
});
