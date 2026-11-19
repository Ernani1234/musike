import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";

test("presence service authenticates private traffic, bounds sessions and clears workers without logging tokens", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-presence-"));
  const worker = path.join(dir, "worker.mjs");
  await writeFile(worker, `#!${process.execPath}\nimport{createInterface}from'node:readline';createInterface({input:process.stdin}).on('line',()=>{console.log(JSON.stringify({event:'discord.sdk.status',ready:true}));console.log(JSON.stringify({event:'discord.sdk.updated',ok:true}));});\n`, { mode: 0o700 });
  const socket = createServer(); await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r)); const port = (socket.address() as { port: number }).port; await new Promise<void>((r) => socket.close(() => r()));
  const key = "fixture-service-key-".repeat(3); let output = "";
  const child = spawn(process.execPath, [path.resolve("../services/discord-presence/service.mjs")], { env: { ...process.env, DISCORD_PRESENCE_KEY: key, DISCORD_SDK_WORKER: worker, DISCORD_PRESENCE_MAX_USERS: "1", PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (bytes) => { output += bytes; }); child.stderr.on("data", (bytes) => { output += bytes; });
  const request = (route: string, method = "GET", body?: unknown, authorized = true) => fetch(`http://127.0.0.1:${port}${route}`, {
    method, headers: { ...(authorized ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(2000),
  });
  try {
    for (let n = 0; !output.includes("service.started") && n < 200; n++) await new Promise((r) => setTimeout(r, 5));
    assert.equal((await request("/health", "GET", undefined, false)).status, 401);
    const user = "11111111-1111-4111-8111-111111111111";
    const body = { user, applicationId: "123456789012345678", accessToken: "fixture-access-should-never-be-logged", activity: { title: "Fixture", artist: "Fixture", artwork: "", startedAt: 1 } };
    assert.equal((await request("/presence", "POST", body)).status, 202);
    for (let n = 0; !output.includes('"ready":true') && n < 200; n++) await new Promise((r) => setTimeout(r, 5));
    assert.equal((await request("/presence", "POST", body)).status, 202);
    assert.equal((await request("/presence", "POST", { ...body, user: "22222222-2222-4222-8222-222222222222" })).status, 503);
    assert.equal((await request(`/presence/${user}`, "DELETE")).status, 200);
    assert.equal((await request("/health")).status, 200);
    assert.doesNotMatch(output, /fixture-access|fixture-service-key|Fixture/);
  } finally {
    const ended = new Promise<void>((r) => child.once("exit", () => r())); child.kill("SIGTERM"); await ended;
    await rm(dir, { recursive: true, force: true });
  }
});
