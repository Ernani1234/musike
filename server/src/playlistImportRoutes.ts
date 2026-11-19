import type { FastifyInstance, FastifyRequest } from "fastify";
import { fail } from "./accounts.js";
import type { PlaylistImport } from "./playlistImport.js";
export function registerPlaylistImport(app: FastifyInstance, service: PlaylistImport | null) {
  const owner = (req: FastifyRequest) => { if (!service || !req.musikeUser) throw fail(401, "Login required"); return req.musikeUser.id; };
  app.post("/api/playlist-imports", { bodyLimit: 4096 }, async req => { const user = owner(req); return service!.start(user, (req.body ?? {}) as { url?: unknown; destination?: unknown }); });
  app.get("/api/playlist-imports", async req => { const user = owner(req); return service!.status(user); });
  app.get("/api/playlist-imports/:id", async req => { const { id } = req.params as { id: string }; const offset = Number((req.query as { offset?: string }).offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 5000) throw fail(400, "Invalid report offset"); const user = owner(req); return service!.status(user, id, offset); });
  app.post("/api/playlist-imports/:id/resume", async req => { const user = owner(req); return service!.resume(user, (req.params as { id: string }).id); });
  app.post("/api/playlist-imports/:id/cancel", async req => { const user = owner(req); return service!.cancel(user, (req.params as { id: string }).id); });
}
