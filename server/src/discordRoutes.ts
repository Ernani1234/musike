import type { FastifyInstance } from "fastify";
import { fail, type Accounts } from "./accounts.js";
import { DiscordService, type DiscordOptions } from "./discord.js";
import type { PlaybackSync } from "./playbackSync.js";

export function registerDiscord(app: FastifyInstance, accounts: Accounts | null, sync: PlaybackSync | null, options?: DiscordOptions) {
  if (!accounts) return null;
  const log = app.log.child({ component: "discord" }, { level: "info" });
  const discord = new DiscordService(accounts, options, (event) => log.info(event));
  if (sync) sync.onChange = (user, state) => discord.update(user, state);
  const user = (req: import("fastify").FastifyRequest) => { if (!req.musikeUser) throw fail(401, "Login required"); return req.musikeUser.id; };
  app.get("/api/discord/status", (req) => discord.status(user(req)));
  app.post("/api/discord/connect", (req) => discord.connect(user(req)));
  app.get("/api/discord/callback", async (req, reply) => {
    const query = req.query as { state?: unknown; code?: unknown; error?: unknown };
    await discord.callback(user(req), query.state, query.code);
    return reply.redirect("/library?discord=connected");
  });
  app.post("/api/discord/disconnect", async (req) => { await discord.disconnect(user(req)); return { ok: true }; });
  app.addHook("onClose", () => discord.close());
  return discord;
}
