import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { Accounts } from "../src/accounts.js";
import { config } from "../src/config.js";
import { createApp } from "../src/app.js";
import { secretBox } from "../src/secret.js";

const phone = (n: number) => `6${String(n).padStart(10, "0")}`;
const secret = "test-only-secret-".repeat(4);
const track = { id: "testtrack01", title: "Existing song", artist: "Test artist", duration: 10, thumb: "", art: "", kind: "song" as const };
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-accounts-")); const previous = config.dataDir; config.dataDir = dir;
  let now = Date.now(); const codes = new Map<string, string>();
  const options = { enabled: true, adminPhone: phone(1), secret, now: () => now, sendOtp: async (to: string, code: string) => { codes.set(to, code); } };
  return { dir, options, codes, advance: (ms: number) => { now += ms; }, restore: async () => { config.dataDir = previous; await rm(dir, { recursive: true, force: true }); } };
}

test("auth migration backs up original once and remains idempotent across restarts", async () => {
  const f = await fixture(); let account: Accounts | undefined;
  try {
    const json = JSON.stringify({ favorites: [track], playlists: [], history: [] });
    await writeFile(path.join(f.dir, "library.json"), json);
    account = await Accounts.open(f.options);
    const owner = await account.db.get("SELECT * FROM users WHERE phone=?", [phone(1)]);
    assert.equal((await account.library(owner!.id).getLibrary()).favorites.length, 1);
    assert.equal(await readFile(path.join(f.dir, "library.json.before-auth.bak"), "utf8"), json);
    await account.library(owner!.id).removeFavorite(track.id); await account.close();
    account = await Accounts.open(f.options);
    assert.equal((await account.library(owner!.id).getLibrary()).favorites.length, 0);
    assert.equal((await account.db.get("SELECT count(*) AS n FROM migrations WHERE key='shared-library-v1'"))!.n, 1);
    assert.equal(await readFile(path.join(f.dir, "library.json"), "utf8"), json);
  } finally { await account?.close(); await f.restore(); }
});

test("invalid migration rolls back without corrupting shared data or marking success", async () => {
  const f = await fixture();
  try {
    await writeFile(path.join(f.dir, "library.json"), "{broken");
    await assert.rejects(Accounts.open(f.options));
    assert.equal(await readFile(path.join(f.dir, "library.json"), "utf8"), "{broken");
    await writeFile(path.join(f.dir, "library.json"), JSON.stringify({ favorites: [], playlists: [], history: [] }));
    const account = await Accounts.open(f.options); await account.close();
  } finally { await f.restore(); }
});

test("OTP bootstrap, invitation, per-user libraries, refresh and server-side logout", async () => {
  const f = await fixture(); const a = await Accounts.open(f.options);
  try {
    const request = await a.requestOtp({ phone: `+${phone(1)}`, remember: true }, "direct");
    assert.equal(f.codes.get(phone(1))!.length, 6);
    const login = await a.verifyOtp(request.challengeId, f.codes.get(phone(1)), "direct");
    assert.equal(login.user.role, "admin");
    assert.ok(login.cookies.every((v) => v.includes("HttpOnly") && v.includes("Secure")));
    const cookie = login.cookies.map((v) => v.split(";")[0]).join("; ");
    assert.equal((await a.authenticate(cookie))?.user.id, login.user.id);
    await assert.rejects(a.verifyOtp(request.challengeId, f.codes.get(phone(1)), "direct"));
    const invite = await a.invite(login.user.id, null, "direct");
    const second = await a.requestOtp({ phone: phone(2), invite: invite.code }, "second");
    const other = await a.verifyOtp(second.challengeId, f.codes.get(phone(2)), "second");
    assert.equal(other.user.role, "user");
    assert.deepEqual(await a.library(other.user.id).getLibrary(), { favorites: [], playlists: [], history: [] });
    await a.library(login.user.id).addFavorite(track);
    assert.equal((await a.library(other.user.id).getLibrary()).favorites.length, 0);
    f.advance(901_000);
    const refreshed = await a.authenticate(cookie); assert.ok(refreshed?.cookies);
    await a.logout(cookie); assert.equal(await a.authenticate(cookie), null);
    await assert.rejects(a.changeUser(login.user.id, login.user.id, { role: "user" }, "direct"), /last approved/);
  } finally { await a.close(); await f.restore(); }
});

test("uninvited phones get no OTP; cooldown, attempt cap and expiry are enforced", async () => {
  const f = await fixture(); const a = await Accounts.open(f.options);
  try {
    const outsider = await a.requestOtp({ phone: phone(9) }, "outside");
    assert.equal(f.codes.has(phone(9)), false);
    await assert.rejects(a.verifyOtp(outsider.challengeId, "000000", "outside"));
    const requested = await a.requestOtp({ phone: phone(1) }, "admin");
    await assert.rejects(a.requestOtp({ phone: phone(1) }, "admin"), /Wait/);
    const correct = f.codes.get(phone(1))!;
    const wrong = correct === "000000" ? "111111" : "000000";
    for (let n = 0; n < 5; n++) await assert.rejects(a.verifyOtp(requested.challengeId, wrong, "admin"));
    await assert.rejects(a.verifyOtp(requested.challengeId, correct, "admin"));
    f.advance(61_000); const expired = await a.requestOtp({ phone: phone(1) }, "admin");
    f.advance(301_000); await assert.rejects(a.verifyOtp(expired.challengeId, f.codes.get(phone(1)), "admin"));
  } finally { await a.close(); await f.restore(); }
});

test("auth wall scopes every legacy library endpoint and old behavior remains when off", async () => {
  const f = await fixture(); const app = await createApp(f.options);
  const request = (url: string, body?: unknown, cookie?: string) => app.inject({ url, method: body === undefined ? "GET" : "POST", headers: {
    "x-musike-request": "1", ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}),
  }, ...(body === undefined ? {} : { payload: JSON.stringify(body) }) });
  try {
    assert.equal((await request("/api/library")).statusCode, 401);
    assert.equal((await request("/api/search?q=test")).statusCode, 401);
    assert.equal((await request("/api/health")).statusCode, 200);
    const challenge = (await request("/api/auth/request", { phone: phone(1) })).json();
    const login = await request("/api/auth/verify", { challengeId: challenge.challengeId, code: f.codes.get(phone(1)) });
    assert.equal(login.statusCode, 200);
    const cookies = login.headers["set-cookie"] as string[];
    const cookie = cookies.map((v) => v.split(";")[0]).join("; ");
    assert.equal((await request("/api/library", undefined, cookie)).statusCode, 200);
    const csrf = await app.inject({ url: "/api/playlists", method: "POST", headers: { cookie, "content-type": "application/json", origin: "https://untrusted.invalid" }, payload: JSON.stringify({ name: "Mix" }) });
    assert.equal(csrf.statusCode, 403);
    await request("/api/auth/logout", {}, cookie);
    assert.equal((await request("/api/library", undefined, cookie)).statusCode, 401);
  } finally { await app.close(); await f.restore(); }
});

test("token encryption is bound to its owner/context and no plaintext is stored", () => {
  const box = secretBox(secret); const token = "not-a-real-provider-token"; const encrypted = box.seal(token, "user-A");
  assert.equal(encrypted.includes(token), false); assert.equal(box.open(encrypted, "user-A"), token);
  assert.throws(() => box.open(encrypted, "user-B"));
});


test("wasphere sends the exact contract once and never retries an ambiguous result", async () => {
  const f = await fixture();
  const keys = ["WASPHERE_URL", "WASPHERE_API_KEY", "WASPHERE_WORKSPACE_ID", "WASPHERE_SESSION"];
  const previous = keys.map((key) => process.env[key]);
  process.env.WASPHERE_URL = "https://wasphere.invalid"; process.env.WASPHERE_API_KEY = "fixture-only-key";
  process.env.WASPHERE_WORKSPACE_ID = "fixture-workspace"; process.env.WASPHERE_SESSION = "fixture-session";
  const calls: { url: string; init: RequestInit }[] = []; let status = 201;
  const a = await Accounts.open({ ...f.options, sendOtp: undefined, transport: (async (url, init) => {
    calls.push({ url: String(url), init: init! }); return new Response(null, { status });
  }) as typeof fetch });
  try {
    const request = await a.requestOtp({ phone: `+${phone(1)}` }, "provider-ip");
    assert.equal(request.delivery, "accepted"); assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "https://wasphere.invalid/workspaces/fixture-workspace/proxy/api/sessions/fixture-session/messages/text");
    assert.equal(calls[0]!.init.method, "POST");
    assert.equal((calls[0]!.init.headers as Record<string, string>).authorization, "Bearer fixture-only-key");
    const body = JSON.parse(String(calls[0]!.init.body)); assert.equal(body.to, phone(1)); assert.match(body.text, /\b\d{6}\b/);
    for (const code of [408, 503, 400]) { f.advance(61_000); status = code;
      const result = await a.requestOtp({ phone: phone(1) }, "provider-ip"); assert.equal(result.delivery, "uncertain");
    }
    assert.equal(calls.length, 4);
  } finally { await a.close(); await f.restore(); keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }); }
});

test("concurrent phones share the resolved-IP rate bucket without exceeding its limit", async () => {
  const f = await fixture(); const a = await Accounts.open(f.options);
  try {
    const result = await Promise.allSettled(Array.from({ length: 15 }, (_, n) => a.requestOtp({ phone: phone(n + 20) }, "shared-ip")));
    assert.equal(result.filter((item) => item.status === "fulfilled").length, 10);
    assert.equal(result.filter((item) => item.status === "rejected").length, 5);
    assert.equal((await a.db.get("SELECT count(*) AS n FROM otps WHERE ip=?", ["shared-ip"]))!.n, 10);
  } finally { await a.close(); await f.restore(); }
});


test("missing migration owner and conflicting backup fail without altering original data", async () => {
  const f = await fixture();
  try {
    const original = JSON.stringify({ favorites: [track], playlists: [], history: [] });
    await writeFile(path.join(f.dir, "library.json"), original);
    await assert.rejects(Accounts.open({ ...f.options, adminPhone: "" }), /ADMIN_PHONE/);
    await writeFile(path.join(f.dir, "library.json.before-auth.bak"), "operator backup");
    await assert.rejects(Accounts.open(f.options), /backup differs/);
    assert.equal(await readFile(path.join(f.dir, "library.json"), "utf8"), original);
    assert.equal(await readFile(path.join(f.dir, "library.json.before-auth.bak"), "utf8"), "operator backup");
  } finally { await f.restore(); }
});

test("a single invitation cannot create two accounts during concurrent verification", async () => {
  const f = await fixture(); const a = await Accounts.open(f.options);
  try {
    const first = await a.requestOtp({ phone: phone(1) }, "admin");
    const admin = await a.verifyOtp(first.challengeId, f.codes.get(phone(1)), "admin");
    const invite = await a.invite(admin.user.id, null, "admin");
    const requests = await Promise.all([2, 3].map((n) => a.requestOtp({ phone: phone(n), invite: invite.code }, `client-${n}`)));
    const result = await Promise.allSettled(requests.map((request, index) => a.verifyOtp(request.challengeId, f.codes.get(phone(index + 2)), `client-${index + 2}`)));
    assert.equal(result.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal((await a.db.get("SELECT count(*) AS n FROM users"))!.n, 2);
  } finally { await a.close(); await f.restore(); }
});

test("playback diagnostics ingestion respects the hard login and CSRF wall", async () => {
  const f = await fixture(); const app = await createApp(f.options);
  try {
    const response = await app.inject({ url: "/api/playback/events", method: "POST", headers: { "x-musike-request": "1" }, payload: { events: [] } });
    assert.equal(response.statusCode, 401);
  } finally { await app.close(); await f.restore(); }
});

test("a playback error probe cannot read another account's failure even with the same trace ID", async () => {
  const f = await fixture(); const app = await createApp({ ...f.options, audio: { candidates: async () => [] } });
  const call = (url: string, cookie?: string, payload?: unknown) => app.inject({ url, method: payload === undefined ? "GET" : "POST", headers: { "x-musike-request": "1", ...(cookie ? { cookie } : {}) }, ...(payload === undefined ? {} : { payload }) });
  const login = async (n: number, invite?: string) => {
    const challenge = (await call("/api/auth/request", undefined, { phone: phone(n), invite })).json();
    const response = await call("/api/auth/verify", undefined, { challengeId: challenge.challengeId, code: f.codes.get(phone(n)) });
    return (response.headers["set-cookie"] as string[]).map((value) => value.split(";")[0]).join("; ");
  };
  try {
    const admin = await login(1); const invite = (await call("/api/admin/invites", admin, {})).json().code; const user = await login(2, invite);
    const url = "/api/stream/probe-test1/audio?trace=d2d17377-7115-4d83-a23d-142b82415e43";
    assert.equal((await call(url, admin)).statusCode, 502);
    assert.equal((await call(`${url}&probe=1`, admin)).statusCode, 502);
    assert.equal((await call(`${url}&probe=1`, user)).statusCode, 200);
  } finally { await app.close(); await f.restore(); }
});
