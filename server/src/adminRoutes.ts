import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Accounts } from "./accounts.js";
import { fail } from "./accounts.js";
import { config } from "./config.js";
import { cacheUsage, trimCache } from "./cacheBudget.js";
import { clearResolved } from "./ytdlp.js";

export const mediaSettings = () => ({ cacheMb: config.cacheMaxBytes / 1048576, lookahead: config.lookahead,
  audioQuality: config.audioQuality, videoQuality: config.videoQuality, ytdlpArgs: config.ytdlpExtraArgs });
type MediaSettings = ReturnType<typeof mediaSettings>;
function applyMedia(settings: MediaSettings) {
  config.cacheMaxBytes = settings.cacheMb * 1048576; config.lookahead = settings.lookahead;
  config.audioQuality = settings.audioQuality; config.videoQuality = settings.videoQuality; config.ytdlpExtraArgs = settings.ytdlpArgs;
}
function validateMedia(value: MediaSettings) {
  if (!Number.isInteger(value.cacheMb) || value.cacheMb < 1 || value.cacheMb > 102400 || !Number.isInteger(value.lookahead) || value.lookahead < 0 || value.lookahead > 10 ||
    !["standard", "high"].includes(value.audioQuality) || !["sd", "hd"].includes(value.videoQuality) || !Array.isArray(value.ytdlpArgs) || value.ytdlpArgs.length > 50 ||
    value.ytdlpArgs.some((arg) => typeof arg !== "string" || arg.length > 500 || /^--(?:exec|exec-before-download|output|paths|config-locations|print-to-file|batch-file|postprocessor-args)(?:=|$)/.test(arg) || ["-o", "-P", "-a"].includes(arg))) throw fail(400, "Invalid server settings");
}
export async function registerAdmin(app: FastifyInstance, accounts: Accounts | null) {
  if (accounts) { const media = await accounts.setting("media", mediaSettings()); validateMedia(media); applyMedia(media); }
  const auditLog = app.log.child({ component: "audit" }, { level: "info" });
  const requireAdmin = async (req: FastifyRequest) => {
    if (!accounts || req.musikeUser?.role !== "admin") throw fail(403, "Administrator access required");
    const action = `admin.${req.method.toLowerCase()}`;
    await accounts.audit(req.musikeUser.id, action, req.routeOptions.url ?? null, req.realClientIp);
    auditLog.info({ event: "admin_action", actor: req.musikeUser.id, action, ip: req.realClientIp });
  };
  const getSettings = async () => ({ media: mediaSettings(), otpEnabled: await accounts!.setting("otpEnabled", true),
    otpExpiry: await accounts!.setting("otpExpiry", 300), otpCooldown: await accounts!.setting("otpCooldown", 60) });
  app.get("/api/admin/settings", { preHandler: requireAdmin }, getSettings);
  app.patch("/api/admin/settings", { preHandler: requireAdmin }, async (req) => {
    const input = req.body as { media?: Partial<MediaSettings>; otpEnabled?: boolean; otpExpiry?: number; otpCooldown?: number };
    if (!input || typeof input !== "object" || Array.isArray(input) || (input.media !== undefined && (!input.media || typeof input.media !== "object" || Array.isArray(input.media)))) throw fail(400, "Invalid server settings");
    const previous = await getSettings(); const next = { ...previous, ...input, media: { ...previous.media, ...input.media } };
    validateMedia(next.media);
    if (typeof next.otpEnabled !== "boolean" || !Number.isInteger(next.otpExpiry) || next.otpExpiry < 60 || next.otpExpiry > 900 ||
      !Number.isInteger(next.otpCooldown) || next.otpCooldown < 30 || next.otpCooldown > 300) throw fail(400, "Invalid OTP settings");
    await accounts!.db.batch(["media", "otpEnabled", "otpExpiry", "otpCooldown"].map((key) => ({
      sql: "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      params: [key, JSON.stringify(next[key as keyof typeof next])],
    })));
    applyMedia(next.media); clearResolved(); await trimCache();
    return next;
  });
  app.get("/api/admin/users", { preHandler: requireAdmin }, async () => ({ users: await accounts!.db.all("SELECT id,phone,name,role,status,last_seen FROM users ORDER BY created_at LIMIT 200") }));
  app.patch("/api/admin/users/:id", { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string }; const body = req.body as { role?: string; status?: string; name?: string };
    return accounts!.changeUser(req.musikeUser!.id, id, body, req.realClientIp);
  });
  app.post("/api/admin/invites", { preHandler: requireAdmin }, async (req) => accounts!.invite(req.musikeUser!.id,
    (req.body as { phone?: unknown } | undefined)?.phone, req.realClientIp));
  app.get("/api/admin/ops", { preHandler: requireAdmin }, async () => {
    const since = accounts!.now() - 45_000;
    const [users, clients, events, errors, usage] = await Promise.all([
      accounts!.db.get("SELECT count(*) AS n FROM users"),
      accounts!.db.all("SELECT c.id,c.user_id,c.ip,c.last_activity,u.name FROM clients c JOIN users u ON u.id=c.user_id WHERE c.last_activity>? AND u.status='approved' ORDER BY c.last_activity DESC LIMIT 100", [since]),
      accounts!.db.all("SELECT at,actor,action,target,ip,level FROM audit ORDER BY id DESC LIMIT 50"),
      accounts!.db.all("SELECT at,actor,action,target,ip,level FROM audit WHERE level='error' ORDER BY id DESC LIMIT 50"), cacheUsage(),
    ]);
    return { users: users!.n, connectedUsers: new Set(clients.map((c) => c.user_id)).size, clients, cache: usage, events, errors };
  });
  return requireAdmin;
}
