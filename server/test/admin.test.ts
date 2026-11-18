import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";

const phone = (n: number) => `6${String(n).padStart(10, "0")}`;
async function fixture(trustProxy = "") {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-admin-")); const previous = { ...config }; config.dataDir = dir;
  let now = Date.now(); const codes = new Map<string, string>();
  const app = await createApp({ enabled: true, adminPhone: phone(1), secret: "test-only-secret-".repeat(4), trustProxy,
    now: () => now, sendOtp: async (to, code) => { codes.set(to, code); } });
  const call = (url: string, cookie?: string, body?: unknown, method?: string, headers: Record<string, string> = {}, remoteAddress = "127.0.0.1") => app.inject({
    url, method: (method ?? (body === undefined ? "GET" : "POST")) as "GET" | "POST" | "PATCH", remoteAddress,
    headers: { "x-musike-request": "1", ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
  const login = async (n: number, invite?: string) => {
    now += 61_000;
    const request = (await call("/api/auth/request", undefined, { phone: phone(n), invite })).json();
    const response = await call("/api/auth/verify", undefined, { challengeId: request.challengeId, code: codes.get(phone(n)) });
    assert.equal(response.statusCode, 200, response.body);
    return { cookie: (response.headers["set-cookie"] as string[]).map((v) => v.split(";")[0]).join("; "), user: response.json().user };
  };
  return { app, call, login, dir, cleanup: async () => { await app.close(); Object.assign(config, previous); await rm(dir, { recursive: true, force: true }); } };
}

test("admin APIs enforce role, persist validated settings, and scope live clients to real sessions", async () => {
  const f = await fixture();
  try {
    const admin = await f.login(1);
    const invite = (await f.call("/api/admin/invites", admin.cookie, {})).json().code;
    const user = await f.login(2, invite);
    for (const url of ["/api/admin/settings", "/api/admin/users", "/api/admin/ops", "/api/system"]) assert.equal((await f.call(url, user.cookie)).statusCode, 403, url);
    assert.equal((await f.call("/api/system/ytdlp", user.cookie, {})).statusCode, 403);
    assert.equal((await f.call("/api/admin/settings", admin.cookie, { media: { lookahead: 5 } }, "PATCH")).statusCode, 200);
    assert.equal(config.lookahead, 5);
    assert.equal((await f.call("/api/admin/settings", admin.cookie)).json().media.lookahead, 5);
    assert.equal((await f.call("/api/admin/settings", admin.cookie, { media: { lookahead: -1 } }, "PATCH")).statusCode, 400);
    await f.call("/api/presence", admin.cookie, { clientId: "browser-admin" });
    await f.call("/api/presence", user.cookie, { clientId: "browser-user" });
    const ops = (await f.call("/api/admin/ops", admin.cookie)).json();
    assert.equal(ops.users, 2); assert.equal(ops.connectedUsers, 2); assert.equal(ops.clients.length, 2);
    assert.ok(ops.events.some((event: { action: string }) => event.action.startsWith("admin.")));
    assert.equal((await f.call(`/api/admin/users/${user.user.id}`, admin.cookie, { status: "disabled" }, "PATCH")).statusCode, 200);
    assert.equal((await f.call("/api/library", user.cookie)).statusCode, 401);
    assert.equal((await f.call("/api/admin/ops", admin.cookie)).json().clients.length, 1);
  } finally { await f.cleanup(); }
});

test("proxy matrix: direct socket, trusted XFF/CF, and untrusted spoofing resistance", async () => {
  for (const scenario of [
    { trust: "", remote: "127.0.0.1", headers: { "x-forwarded-for": "198.51.100.10", "cf-connecting-ip": "198.51.100.11" }, expected: "127.0.0.1" },
    { trust: "127.0.0.1/32", remote: "127.0.0.1", headers: { "x-forwarded-for": "198.51.100.10" }, expected: "198.51.100.10" },
    { trust: "127.0.0.1/32", remote: "127.0.0.1", headers: { "cf-connecting-ip": "198.51.100.11" }, expected: "198.51.100.11" },
    { trust: "127.0.0.1/32", remote: "192.0.2.20", headers: { "x-forwarded-for": "198.51.100.10", "cf-connecting-ip": "198.51.100.11" }, expected: "192.0.2.20" },
  ]) {
    const f = await fixture(scenario.trust);
    try {
      const admin = await f.login(1);
      await f.call("/api/presence", admin.cookie, { clientId: "proxy-browser" }, undefined, scenario.headers, scenario.remote);
      const ops = (await f.call("/api/admin/ops", admin.cookie, undefined, undefined, scenario.headers, scenario.remote)).json();
      assert.equal(ops.clients[0].ip, scenario.expected);
      assert.equal(ops.events[0].ip, scenario.expected);
    } finally { await f.cleanup(); }
  }
});


test("persisted instance settings and secure sessions survive an app restart", async () => {
  const f = await fixture(); let restarted: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    const admin = await f.login(1);
    assert.equal((await f.call("/api/admin/settings", admin.cookie, { media: { lookahead: 6 }, otpExpiry: 240 }, "PATCH")).statusCode, 200);
    await f.app.close(); config.lookahead = 1;
    restarted = await createApp({ enabled: true, adminPhone: phone(1), secret: "test-only-secret-".repeat(4), trustProxy: "" });
    const response = await restarted.inject({ url: "/api/admin/settings", headers: { cookie: admin.cookie } });
    assert.equal(response.statusCode, 200); assert.equal(response.json().media.lookahead, 6); assert.equal(response.json().otpExpiry, 240);
  } finally { await restarted?.close(); await f.cleanup(); }
});
