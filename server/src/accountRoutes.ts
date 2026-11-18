import type { FastifyInstance } from "fastify";
import { Accounts, fail, type AccountOptions, type User } from "./accounts.js";
import { trustedProxies } from "./proxy.js";

declare module "fastify" {
  interface FastifyRequest { musikeUser: User | null; musikeSession: string | null; realClientIp: string; }
}

export async function registerAccounts(app: FastifyInstance, options: AccountOptions, proxy: ReturnType<typeof trustedProxies>) {
  const enabled = options.enabled ?? process.env.AUTH_ENABLED === "true";
  const accounts = enabled ? await Accounts.open(options) : null;
  app.decorateRequest("musikeUser", null); app.decorateRequest("musikeSession", null); app.decorateRequest("realClientIp", "");
  const publicPaths = new Set(["/api/health", "/api/auth/me", "/api/auth/request", "/api/auth/verify", "/api/auth/logout", "/api/google/callback"]);
  app.addHook("onRequest", async (req, reply) => {
    req.realClientIp = proxy.realIp(req);
    if (!accounts || !req.url.startsWith("/api/")) return;
    const pathname = req.url.split("?")[0]!;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin; const expected = accounts.origin || `${req.protocol}://${req.headers.host}`;
      if (req.headers["x-musike-request"] !== "1" || (origin && origin !== expected)) throw fail(403, "Request origin is not allowed");
    }
    const session = await accounts.authenticate(req.headers.cookie);
    if (session) {
      req.musikeUser = session.user; req.musikeSession = session.session;
      if (session.cookies) reply.header("set-cookie", session.cookies);
    }
    if (!publicPaths.has(pathname) && !req.musikeUser) throw fail(401, "Login required");
  });
  app.get("/api/auth/me", async (req) => ({ enabled, user: req.musikeUser, google: !!(accounts && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && (process.env.GOOGLE_REDIRECT_URI || accounts.origin)),
    admin: req.musikeUser?.role === "admin" }));
  app.post("/api/auth/request", { schema: { body: {
    type: "object", required: ["phone"], additionalProperties: false,
    properties: { phone: { type: "string", maxLength: 40 }, invite: { type: "string", maxLength: 100 }, remember: { type: "boolean" } },
  } } }, async (req, reply) => {
    if (!accounts) throw fail(404, "Accounts are disabled");
    const result = await accounts.requestOtp(req.body as { phone: string; invite?: string; remember?: boolean }, req.realClientIp);
    return reply.code(202).send(result);
  });
  app.post("/api/auth/verify", { schema: { body: {
    type: "object", required: ["challengeId", "code"], additionalProperties: false,
    properties: { challengeId: { type: "string", maxLength: 80 }, code: { type: "string", maxLength: 20 } },
  } } }, async (req, reply) => {
    if (!accounts) throw fail(404, "Accounts are disabled");
    const body = req.body as { challengeId: string; code: string };
    const result = await accounts.verifyOtp(body.challengeId, body.code, req.realClientIp);
    reply.header("set-cookie", result.cookies); return { user: result.user };
  });
  app.post("/api/auth/logout", async (req, reply) => {
    if (accounts) reply.header("set-cookie", await accounts.logout(req.headers.cookie));
    return { ok: true };
  });
  app.post("/api/presence", async (req) => {
    if (!accounts || !req.musikeUser) return { ok: true };
    const { clientId } = req.body as { clientId?: unknown } ?? {};
    if (typeof clientId !== "string" || !/^[\w-]{8,80}$/.test(clientId)) throw fail(400, "Invalid client identity");
    await accounts.db.batch([
      { sql: "INSERT INTO clients(id,user_id,session_hash,ip,last_activity) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,session_hash=excluded.session_hash,ip=excluded.ip,last_activity=excluded.last_activity",
        params: [accounts.box.hash(`${req.musikeSession}:${clientId}`), req.musikeUser.id, req.musikeSession!, req.realClientIp, accounts.now()] },
      { sql: "UPDATE users SET last_seen=? WHERE id=?", params: [accounts.now(), req.musikeUser.id] },
      { sql: "DELETE FROM clients WHERE last_activity<?", params: [accounts.now() - 60_000] },
    ]);
    return { ok: true, user: req.musikeUser };
  });
  return accounts;
}
