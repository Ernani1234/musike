import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";

const key = process.env.DISCORD_PRESENCE_KEY ?? "";
const executable = process.env.DISCORD_SDK_WORKER ?? "/app/discord-worker";
const capacity = Math.max(1, Math.min(64, Number(process.env.DISCORD_PRESENCE_MAX_USERS) || 16));
if (key.length < 32) throw new Error("A private service key of at least 32 characters is required");
const sessions = new Map();
const log = (event, fields = {}) => process.stdout.write(`${JSON.stringify({ at: Date.now(), event, ...fields })}\n`);
const remove = (id) => {
  const session = sessions.get(id); if (!session) return;
  sessions.delete(id); session.child.stdin.end();
  const timer = setTimeout(() => session.child.kill("SIGKILL"), 2000); timer.unref(); session.child.once("exit", () => clearTimeout(timer));
};
const server = createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
  const supplied = Buffer.from(req.headers.authorization ?? ""); const expected = Buffer.from(`Bearer ${key}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(401, { error: "Unauthorized" });
  if (req.method === "GET" && req.url === "/health") return send(existsSync(executable) ? 200 : 503, { workerAvailable: existsSync(executable), users: sessions.size });
  if (req.method === "DELETE" && /^\/presence\/[a-f0-9-]{36}$/.test(req.url ?? "")) { remove(req.url.slice(10)); return send(200, { ok: true }); }
  if (req.method !== "POST" || req.url !== "/presence") return send(404, { error: "Not found" });
  try {
    let body = "";
    for await (const bytes of req) { body += bytes.toString("utf8"); if (Buffer.byteLength(body) > 16384) return send(413, { error: "Payload too large" }); }
    const data = JSON.parse(body);
    if (!/^[a-f0-9-]{36}$/.test(data.user) || !/^\d{10,20}$/.test(data.applicationId) || typeof data.accessToken !== "string" || data.accessToken.length > 8192 || !data.accessToken.length) return send(400, { error: "Invalid command" });
    let activity = null;
    if (data.activity !== null) {
      const a = data.activity;
      if (!a || typeof a.title !== "string" || typeof a.artist !== "string" || !Number.isSafeInteger(a.startedAt) || a.startedAt < 0 ||
        typeof a.artwork !== "string" || a.artwork.length > 500 || a.artwork && !a.artwork.startsWith("https://")) return send(400, { error: "Invalid activity" });
      // Optional fields: older servers omit them and still get the elapsed-only timer.
      const album = typeof a.album === "string" ? a.album.slice(0, 128) : "";
      const url = typeof a.url === "string" && a.url.length <= 256 && a.url.startsWith("https://") ? a.url : "";
      const endsAt = Number.isSafeInteger(a.endsAt) && a.endsAt > a.startedAt ? a.endsAt : 0;
      activity = { title: a.title.slice(0, 128), artist: a.artist.slice(0, 128), album, artwork: a.artwork, url, startedAt: a.startedAt, endsAt };
    }
    let session = sessions.get(data.user);
    if (!session) {
      if (!existsSync(executable)) return send(503, { error: "SDK worker unavailable" });
      if (sessions.size >= capacity) return send(503, { error: "Presence capacity reached" });
      const child = spawn(executable, [], { stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH } });
      session = { child, at: Date.now(), ready: false, published: false }; sessions.set(data.user, session);
      let pending = "";
      child.stdout.setEncoding("utf8"); child.stdout.on("data", (part) => {
        pending += part; if (pending.length > 8192) { remove(data.user); return; }
        let end;
        while ((end = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, end); pending = pending.slice(end + 1);
          try {
            const event = JSON.parse(line);
            if (typeof event.ready === "boolean") session.ready = event.ready;
            if (event.event === "discord.sdk.updated") session.published = event.ok === true;
            const codes = {};
            for (const key of ["status", "error", "code"]) if (Number.isSafeInteger(event[key]) && Math.abs(event[key]) <= 2147483647) codes[key] = event[key];
            log("discord.sdk", { user: data.user, ready: session.ready, published: session.published, ...codes });
          } catch { log("discord.sdk.protocol_error", { user: data.user }); }
        }
      });
      // Native library stderr is intentionally not forwarded: it can include provider diagnostics.
      child.stderr.resume(); child.stdin.on("error", () => {});
      child.once("error", () => { log("discord.sdk.start_failed", { user: data.user }); if (sessions.get(data.user) === session) remove(data.user); });
      child.once("exit", () => { if (sessions.get(data.user) === session) sessions.delete(data.user); log("discord.sdk.stopped", { user: data.user }); });
    }
    session.at = Date.now();
    if (!session.child.stdin.write(`${JSON.stringify({ applicationId: data.applicationId, accessToken: data.accessToken, activity })}\n`)) { remove(data.user); return send(503, { error: "SDK worker busy" }); }
    return send(202, { accepted: true, ready: session.ready && (activity === null || session.published) });
  } catch { return send(400, { error: "Invalid command" }); }
});
server.requestTimeout = 10000; server.headersTimeout = 5000; server.maxConnections = 64;
const prune = setInterval(() => { for (const [id, s] of sessions) if (Date.now() - s.at > 60000) remove(id); }, 10000); prune.unref();
server.listen(Number(process.env.PORT) || 8091, "0.0.0.0", () => log("discord.service.started"));
const stop = () => { clearInterval(prune); for (const id of sessions.keys()) remove(id); server.close(); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
