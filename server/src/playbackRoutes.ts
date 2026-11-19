import type { FastifyInstance } from "fastify";
import type { Accounts } from "./accounts.js";
import { fail } from "./accounts.js";
import { PlaybackSync, type SyncView } from "./playbackSync.js";

export function registerPlayback(app: FastifyInstance, accounts: Accounts | null) {
  if (!accounts) return null;
  const sync = new PlaybackSync(accounts); const streams = new Set<() => void>();
  const owner = (req: import("fastify").FastifyRequest) => {
    if (!req.musikeUser || !req.musikeSession) throw fail(401, "Login required");
    return { user: req.musikeUser.id, session: req.musikeSession };
  };
  app.post("/api/playback/devices", { bodyLimit: 1024 }, (req) => {
    const { user, session } = owner(req); const b = (req.body ?? {}) as { clientId?: unknown; name?: unknown };
    return sync.register(user, session, b.clientId, b.name);
  });
  app.post("/api/playback/sync", { bodyLimit: 2 * 1024 * 1024 }, (req) => {
    const { user, session } = owner(req); const b = req.body as Record<string, unknown>;
    if (!b || typeof b.deviceId !== "string") throw fail(400, "Invalid playback device");
    return sync.act(user, session, b.deviceId, b);
  });
  app.get("/api/playback/state", (req) => {
    const { user, session } = owner(req); const id = (req.query as { deviceId?: string }).deviceId;
    if (typeof id !== "string") throw fail(400, "Invalid playback device");
    return sync.read(user, session, id);
  });
  app.get("/api/playback/updates", async (req, reply) => {
    const { user, session } = owner(req); const id = (req.query as { deviceId?: string }).deviceId;
    if (typeof id !== "string") throw fail(400, "Invalid playback device");
    await sync.read(user, session, id);
    let dispose = () => {}; let timer: ReturnType<typeof setInterval>;
    let ended = false; let blocked = false; let pending: SyncView | null = null;
    const close = () => { if (ended) return; ended = true; clearInterval(timer); dispose(); streams.delete(close); reply.raw.end(); };
    const send = (view: SyncView) => {
      if (ended || reply.raw.destroyed) return;
      if (blocked) { pending = view; return; }
      blocked = !reply.raw.write(`data: ${JSON.stringify(view)}\n\n`);
      if (blocked) reply.raw.once("drain", () => { blocked = false; if (pending) { const next = pending; pending = null; send(next); } });
    };
    reply.hijack(); reply.raw.writeHead(200, { ...reply.getHeaders(), "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" } as import("node:http").OutgoingHttpHeaders);
    streams.add(close); reply.raw.once("close", close);
    dispose = await sync.subscribe(user, session, id, send);
    let checking = false;
    timer = setInterval(() => {
      if (checking) return; checking = true;
      void accounts.authenticate(req.headers.cookie).then(async (auth) => {
        if (!auth || auth.user.id !== user || auth.session !== session) return close();
        send(await sync.read(user, session, id, false));
        if (!blocked) reply.raw.write(": heartbeat\n\n");
      }).catch(close).finally(() => { checking = false; });
    }, 15000); timer.unref();
  });
  app.addHook("preClose", async () => { for (const close of [...streams]) close(); });
  app.addHook("onClose", async () => sync.close());
  return sync;
}
