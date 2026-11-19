import type { FastifyInstance, FastifyRequest } from "fastify";
import { fail } from "./accounts.js";
import type { Jams } from "./jams.js";
export function registerJams(app: FastifyInstance, jams: Jams | null) {
  const owner = (req: FastifyRequest) => { if (!jams || !req.musikeUser) throw fail(401, "Login required"); jams.rate(req.musikeUser.id); return req.musikeUser.id; };
  const id = (req: FastifyRequest) => (req.params as { id: string }).id;
  const body = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;
  app.get("/api/jams", req => { const user = owner(req); return jams!.current(user); });
  app.post("/api/jams", req => { const user = owner(req); return jams!.create(user); });
  app.post("/api/jams/join", req => { const user = owner(req); return jams!.join(user, body(req).code); });
  app.get("/api/jams/:id", req => { const user = owner(req); return jams!.view(user, id(req)); });
  app.post("/api/jams/:id/output", req => { const user = owner(req); return jams!.output(user, id(req)); });
  app.post("/api/jams/:id/invite", req => { const user = owner(req); return jams!.invite(user, id(req)); });
  app.post("/api/jams/:id/leave", req => { const user = owner(req); return jams!.leave(user, id(req)); });
  app.post("/api/jams/:id/claim", req => { const user = owner(req); return jams!.claim(user, id(req)); });
  app.patch("/api/jams/:id", req => { const user = owner(req); return jams!.settings(user, id(req), body(req)); });
  app.post("/api/jams/:id/commands", { bodyLimit: 2 * 1024 * 1024 }, req => { const user = owner(req); return jams!.command(user, id(req), body(req)); });
}
