import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Accounts } from "../src/accounts.js";
import { DiscordService } from "../src/discord.js";
import { config } from "../src/config.js";

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-discord-")); const old = config.dataDir; config.dataDir = dir;
  const accounts = await Accounts.open({ adminPhone: "60120000001", secret: "discord-fixture-secret-".repeat(3) });
  const user = (await accounts.db.get("SELECT id FROM users"))!.id as string;
  const calls: { url: string; init?: RequestInit }[] = []; const logs: unknown[] = [];
  const transport = (async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/token")) return Response.json({ access_token: "fixture-access-not-real", refresh_token: "fixture-refresh-not-real", expires_in: 3600, scope: "openid identify sdk.social_layer_presence" });
    if (String(url).includes("users/@me")) return Response.json({ id: "123456789012345678" });
    return Response.json({ ready: true });
  }) as typeof fetch;
  const options = { clientId: "123456789012345679", clientSecret: "fixture-client-not-real", redirectUri: "https://musike.invalid/api/discord/callback", presenceUrl: "http://presence.invalid:8091", presenceKey: "fixture-internal-secret-".repeat(3), transport };
  const discord = new DiscordService(accounts, options, (event) => logs.push(event));
  return { accounts, user, discord, calls, logs, cleanup: async () => { await discord.close(); await accounts.close(); config.dataDir = old; await rm(dir, { recursive: true, force: true }); } };
}
test("Discord PKCE state is owner-bound/single-use and stored tokens are encrypted", async () => {
  const f = await fixture();
  try {
    const url = new URL((await f.discord.connect(f.user)).url);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256"); assert.match(url.searchParams.get("scope")!, /sdk.social_layer_presence/);
    const state = url.searchParams.get("state")!;
    await assert.rejects(f.discord.callback("other-user", state, "code"), /expired/);
    await f.discord.callback(f.user, state, "code");
    await assert.rejects(f.discord.callback(f.user, state, "code"), /expired/);
    const row = await f.accounts.db.get("SELECT encrypted FROM discord_connections WHERE user_id=?", [f.user]);
    assert.ok(!row!.encrypted.includes("fixture-access")); assert.equal((await f.discord.status(f.user)).connected, true);
    const tokenBody = f.calls.find((call) => call.url.endsWith("/token"))!.init!.body as URLSearchParams;
    assert.ok(tokenBody.get("code_verifier")); assert.equal(tokenBody.get("grant_type"), "authorization_code");
  } finally { await f.cleanup(); }
});
test("Discord identity cannot be attached to two Musike accounts", async () => {
  const f = await fixture();
  try {
    await f.accounts.db.run("INSERT INTO users(id,phone,created_at) VALUES('second','+60120000002',1)");
    const first = new URL((await f.discord.connect(f.user)).url); await f.discord.callback(f.user, first.searchParams.get("state"), "code");
    const second = new URL((await f.discord.connect("second")).url); await assert.rejects(f.discord.callback("second", second.searchParams.get("state"), "code"), /already linked/);
    assert.equal((await f.discord.status("second")).connected, false);
  } finally { await f.cleanup(); }
});
test("Discord receives confirmed playback, pause clears activity, disconnect deletes credentials and logs exclude tokens", async () => {
  const f = await fixture();
  try {
    const url = new URL((await f.discord.connect(f.user)).url); await f.discord.callback(f.user, url.searchParams.get("state"), "code");
    const snapshot = { queue: [{ id: "testtrack01", title: "Fixture title", artist: "Fixture artist", duration: 180, thumb: "", art: "", kind: "song" as const }], original: null, index: 0, position: 42, duration: 180, status: "playing" as const, shuffle: false, repeat: "off" as const, autoRadio: false };
    f.discord.update(f.user, snapshot); await new Promise((r) => setTimeout(r, 1100));
    const delivery = f.calls.find((call) => call.url.endsWith("/presence"))!; assert.ok(delivery);
    const body = JSON.parse(String(delivery.init!.body)); assert.equal(body.user, f.user); assert.equal(body.activity.title, "Fixture title");
    assert.equal(body.activity.endsAt - body.activity.startedAt, 180); assert.ok(Math.abs(Date.now() / 1000 - 42 - body.activity.startedAt) < 3);
    assert.equal(body.activity.url, "https://music.youtube.com/watch?v=testtrack01");
    assert.equal((await f.discord.status(f.user)).ready, true);
    f.discord.update(f.user, { ...snapshot, status: "paused" }); await new Promise((r) => setTimeout(r, 50));
    assert.equal(JSON.parse(String(f.calls.filter((call) => call.url.endsWith("/presence")).at(-1)!.init!.body)).activity, null);
    await f.discord.disconnect(f.user); assert.equal((await f.discord.status(f.user)).connected, false);
    assert.ok(f.calls.some((call) => call.init?.method === "DELETE")); assert.ok(f.calls.some((call) => call.url.endsWith("/revoke")));
    assert.doesNotMatch(JSON.stringify(f.logs), /fixture-access|fixture-refresh|authorization|Fixture title/);
  } finally { await f.cleanup(); }
});
