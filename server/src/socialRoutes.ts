import type { FastifyInstance, FastifyRequest } from "fastify";
import { fail } from "./accounts.js";
import type { Social } from "./social.js";
export function registerSocial(app: FastifyInstance, social: Social | null) {
  const owner = (req: FastifyRequest) => { if (!social || !req.musikeUser) throw fail(401, "Login required"); return req.musikeUser.id; };
  const id = (req: FastifyRequest) => (req.params as { id: string }).id;
  const body = (req: FastifyRequest) => { if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) throw fail(400, "Invalid request"); return req.body as Record<string, unknown>; };
  app.get("/api/social", req => { const user = owner(req); const offset = Number((req.query as { offset?: string }).offset ?? 0); if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw fail(400, "Invalid share offset"); return social!.state(user, offset); });
  app.post("/api/social/friends", { bodyLimit: 1024 }, req => { const user = owner(req); return social!.request(user, body(req).code); });
  app.post("/api/social/requests/:id", req => { const user = owner(req); return social!.respond(user, id(req), body(req).accept); });
  app.delete("/api/social/friends/:id", req => { const user = owner(req); return social!.removeFriend(user, id(req)); });
  app.patch("/api/social/preferences", req => { const user = owner(req); return social!.preferences(user, body(req)); });
  app.post("/api/social/groups", req => { const user = owner(req); return social!.createGroup(user, body(req).name); });
  app.get("/api/social/groups/:id", req => { const user = owner(req); return social!.group(user, id(req)); });
  app.patch("/api/social/groups/:id", req => { const user = owner(req); return social!.editGroup(user, id(req), body(req)); });
  app.post("/api/social/shares", req => { const user = owner(req); return social!.share(user, body(req)); });
  app.get("/api/shared-playlists/:id", req => { const user = owner(req); return social!.shared(user, id(req)); });
  app.patch("/api/shared-playlists/:id", { bodyLimit: 2 * 1024 * 1024 }, req => { const user = owner(req); return social!.editShared(user, id(req), body(req)); });
  app.post("/api/shared-playlists/:id/copy", req => { const user = owner(req); return social!.copy(user, id(req)); });
  app.delete("/api/shared-playlists/:id", req => { const user = owner(req); return social!.deleteShare(user, id(req)); });
}
