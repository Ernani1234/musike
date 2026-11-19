import { randomUUID, randomBytes, randomInt, timingSafeEqual, createHash } from "node:crypto";
import { readFile, copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { Database } from "./db.js";
import { config } from "./config.js";
import { instanceSecret, secretBox } from "./secret.js";
import { createLibrary } from "./library.js";
import { malaysianPhone } from "./phone.js";

export type User = { id: string; phone: string; name: string; role: "admin" | "user"; status: "approved" | "pending" | "disabled"; last_seen: number | null };
export type AccountOptions = { enabled?: boolean; adminPhone?: string; secret?: string; publicOrigin?: string; transport?: typeof fetch;
  sendOtp?: (phone: string, code: string) => Promise<void>; now?: () => number;
  onAudit?: (event: { event: string; actor: string | null; action: string; target: string | null; ip: string; level: string }) => void };
export const fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
export const emptyLibrary = () => ({ favorites: [], playlists: [], history: [] });
export const phoneOf = malaysianPhone;
export function cookies(header = "") { return Object.fromEntries(header.split(";").map((part) => part.trim().split("=")).filter(([key, value]) => key && value)); }

export class Accounts {
  readonly db: Database;
  readonly box: ReturnType<typeof secretBox>;
  readonly enabled = true;
  readonly adminPhone: string;
  readonly origin: string;
  readonly now: () => number;
  private libraries = new Map<string, ReturnType<typeof createLibrary>>();
  private locks = new Map<string, Promise<unknown>>();
  private constructor(db: Database, secret: string, readonly options: AccountOptions) {
    this.db = db; this.box = secretBox(secret); this.now = options.now ?? Date.now;
    this.adminPhone = options.adminPhone ?? process.env.ADMIN_PHONE ?? "";
    if (this.adminPhone) this.adminPhone = phoneOf(this.adminPhone);
    this.origin = options.publicOrigin ?? process.env.MUSIKE_PUBLIC_ORIGIN ?? "";
    if (this.origin) {
      const origin = new URL(this.origin);
      if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("MUSIKE_PUBLIC_ORIGIN must be an HTTPS origin");
      this.origin = origin.origin;
    }
  }
  static async open(options: AccountOptions = {}) {
    const db = await Database.open(path.join(config.dataDir, "musike.sqlite"));
    try {
      const accounts = new Accounts(db, options.secret ?? await instanceSecret(config.dataDir), options);
      await accounts.normalizePhones(); await accounts.migrate(); return accounts;
    } catch (e) { await db.close(); throw e; }
  }
  async lock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const job = previous.catch(() => {}).then(work); this.locks.set(key, job);
    try { return await job; } finally { if (this.locks.get(key) === job) this.locks.delete(key); }
  }
  async setting<T>(key: string, fallback: T): Promise<T> {
    const row = await this.db.get("SELECT value FROM settings WHERE key=?", [key]);
    return row ? JSON.parse(row.value) as T : fallback;
  }
  async setSetting(key: string, value: unknown) { await this.db.run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [key, JSON.stringify(value)]); }
  private async normalizePhones() {
    if (await this.db.get("SELECT key FROM migrations WHERE key='malaysia-phone-v1'")) return;
    const users = await this.db.all<{ id: string; phone: string }>("SELECT id,phone FROM users");
    const invites = await this.db.all<{ hash: string; phone: string }>("SELECT hash,phone FROM invites WHERE phone IS NOT NULL");
    const seen = new Set<string>();
    const normalize = (value: string) => {
      try { return phoneOf(value); } catch { throw new Error("Phone migration stopped: invalid legacy identity; inspect the protected database backup locally"); }
    };
    const normalized = users.map((user) => ({ ...user, phone: normalize(user.phone) }));
    for (const user of normalized) {
      if (seen.has(user.phone)) throw new Error("Phone migration stopped: duplicate normalized identities; manual resolution required");
      seen.add(user.phone);
    }
    const bound = invites.map((invite) => ({ ...invite, phone: normalize(invite.phone) }));
    if (users.length || invites.length) await this.db.backup(path.join(config.dataDir, `musike.before-malaysia-phone-${randomUUID()}.sqlite`));
    await this.db.batch([
      ...normalized.map((user) => ({ sql: "UPDATE users SET phone=? WHERE id=?", params: [user.phone, user.id] })),
      ...bound.map((invite) => ({ sql: "UPDATE invites SET phone=? WHERE hash=?", params: [invite.phone, invite.hash] })),
      { sql: "DELETE FROM otps" },
      { sql: "INSERT INTO migrations(key,value) VALUES('malaysia-phone-v1',?)", params: [String(this.now())] },
    ]);
  }
  async migrate() {
    if (await this.db.get("SELECT key FROM migrations WHERE key='shared-library-v1'")) return;
    let source: string | null = null;
    const file = path.join(config.dataDir, "library.json");
    try { source = await readFile(file, "utf8"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    const data = source ? JSON.parse(source) : emptyLibrary();
    if (![data.favorites, data.playlists, data.history].every(Array.isArray)) throw new Error("Invalid shared library; migration stopped");
    if (!this.adminPhone) {
      if (source) throw new Error("ADMIN_PHONE is required to migrate the shared library safely");
      return;
    }
    if (source !== null) {
      const backup = `${file}.before-auth.bak`;
      try { await copyFile(file, backup, constants.COPYFILE_EXCL); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        if (await readFile(backup, "utf8") !== source) throw new Error("Existing migration backup differs; manual review required"); }
    }
    const id = randomUUID();
    await this.db.batch([
      { sql: "INSERT INTO users(id,phone,created_at) VALUES(?,?,?) ON CONFLICT(phone) DO NOTHING", params: [id, this.adminPhone, this.now()] },
      { sql: "INSERT INTO libraries(user_id,json,updated_at) SELECT id,?,? FROM users WHERE phone=? ON CONFLICT(user_id) DO NOTHING", params: [JSON.stringify(data), this.now(), this.adminPhone] },
      { sql: "INSERT INTO migrations(key,value) VALUES('shared-library-v1',?)", params: [createHash("sha256").update(source ?? "").digest("hex")] },
      { sql: "INSERT INTO audit(at,action,ip) VALUES(?,'migration.shared-library','local')", params: [this.now()] },
    ]);
  }
  library(user: string) {
    let lib = this.libraries.get(user);
    if (!lib) {
      lib = createLibrary({ read: async () => (await this.db.get("SELECT json FROM libraries WHERE user_id=?", [user]))?.json ?? null,
        write: async (json) => { await this.db.run("INSERT INTO libraries(user_id,json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET json=excluded.json,updated_at=excluded.updated_at", [user, json, this.now()]); } });
      this.libraries.set(user, lib);
    }
    return lib;
  }
  async audit(actor: string | null, action: string, target: string | null, ip: string, level = "info") {
    this.options.onAudit?.({ event: "audit", actor, action, target, ip, level });
    await this.db.run("INSERT INTO audit(at,actor,action,target,ip,level) VALUES(?,?,?,?,?,?)", [this.now(), actor, action, target, ip, level]);
    await this.db.run("DELETE FROM audit WHERE id NOT IN (SELECT id FROM audit ORDER BY id DESC LIMIT 1000)");
  }
  async requestOtp(input: { phone?: unknown; invite?: unknown; remember?: boolean }, ip: string) {
    const phone = phoneOf(input.phone);
    return this.lock(`otp-ip:${ip}`, () => this.lock(`phone:${phone}`, async () => {
      await this.db.batch([
        { sql: "DELETE FROM otps WHERE created_at<?", params: [this.now() - 86400_000] },
        { sql: "DELETE FROM clients WHERE last_activity<?", params: [this.now() - 60_000] },
        { sql: "DELETE FROM sessions WHERE expires_at<=?", params: [this.now()] },
      ]);
      const cooldown = await this.setting("otpCooldown", 60);
      const expiry = await this.setting("otpExpiry", 300);
      if (!await this.setting("otpEnabled", true)) throw fail(503, "OTP sending is disabled");
      const recent = await this.db.get("SELECT created_at FROM otps WHERE phone=? ORDER BY created_at DESC LIMIT 1", [phone]);
      if (recent && this.now() - recent.created_at < cooldown * 1000) throw fail(429, "Wait before requesting another code");
      const counts = await this.db.get("SELECT count(*) AS n FROM otps WHERE ip=? AND created_at>?", [ip, this.now() - 900_000]);
      const phoneCounts = await this.db.get("SELECT count(*) AS n FROM otps WHERE phone=? AND created_at>?", [phone, this.now() - 900_000]);
      if (counts!.n >= 10 || phoneCounts!.n >= 5) throw fail(429, "Too many login requests");
      const user = await this.db.get<User>("SELECT * FROM users WHERE phone=?", [phone]);
      const inviteHash = typeof input.invite === "string" ? this.box.hash(input.invite) : "";
      const invite = inviteHash ? await this.db.get("SELECT * FROM invites WHERE hash=? AND used_by IS NULL AND expires_at>?", [inviteHash, this.now()]) : null;
      const eligible = user ? user.status === "approved" : phone === this.adminPhone || !!(invite && (!invite.phone || invite.phone === phone));
      const id = randomUUID(); const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await this.db.run("INSERT INTO otps(id,phone,ip,hash,invite_hash,expires_at,created_at,delivery,remember) VALUES(?,?,?,?,?,?,?,?,?)",
        [id, phone, ip, this.box.hash(`${id}:${code}`), inviteHash || null, this.now() + expiry * 1000, this.now(), eligible ? "pending" : "decoy", input.remember ? 1 : 0]);
      if (eligible) {
        try { await this.sendOtp(phone, code, expiry); await this.db.run("UPDATE otps SET delivery='sent' WHERE id=?", [id]); }
        catch (e) {
          const rejected = (e as { statusCode?: number }).statusCode === 400;
          await this.db.run("UPDATE otps SET delivery=? WHERE id=?", [rejected ? "rejected" : "uncertain", id]);
          await this.audit(null, "otp.delivery-failed", null, ip, "error");
          return { challengeId: id, cooldown, delivery: "uncertain" };
        }
      }
      return { challengeId: id, cooldown, delivery: "accepted" };
    }));
  }
  private async sendOtp(phone: string, code: string, expiry: number) {
    const recipient = phoneOf(phone).slice(1);
    if (this.options.sendOtp) return this.options.sendOtp(recipient, code);
    const { WASPHERE_URL: base, WASPHERE_API_KEY: key, WASPHERE_WORKSPACE_ID: workspace, WASPHERE_SESSION: session } = process.env;
    if (!base || !key || !workspace || !session) throw fail(503, "OTP provider is not configured");
    const url = new URL(base); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw fail(503, "Invalid OTP provider configuration");
    const response = await (this.options.transport ?? fetch)(`${base.replace(/\/$/, "")}/workspaces/${encodeURIComponent(workspace)}/proxy/api/sessions/${encodeURIComponent(session)}/messages/text`, {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ to: recipient, text: `Musike login code: ${code}. Expires in ${Math.ceil(expiry / 60)} minutes. Do not share this code.` }), signal: AbortSignal.timeout(30_000),
    });
    await response.body?.cancel();
    if (!response.ok) throw fail(response.status >= 400 && response.status < 500 && response.status !== 408 ? 400 : 503, "OTP delivery failed");
  }
  async verifyOtp(challenge: unknown, code: unknown, ip: string) {
    if (typeof challenge !== "string" || challenge.length > 80 || typeof code !== "string" || code.length > 20) throw fail(400, "Invalid login code");
    return this.lock("verify", async () => {
      const row = await this.db.get("SELECT * FROM otps WHERE id=?", [challenge]);
      const expected = row?.hash ?? this.box.hash("unavailable");
      const matches = timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(this.box.hash(`${challenge}:${code}`), "hex"));
      if (!row || row.consumed || row.expires_at <= this.now() || row.attempts >= 5 || !["sent", "uncertain"].includes(row.delivery)) throw fail(400, "Invalid or expired login code");
      await this.db.run("UPDATE otps SET attempts=attempts+1 WHERE id=?", [challenge]);
      if (!matches || !/^\d{6}$/.test(code)) throw fail(400, "Invalid or expired login code");
      await this.db.run("UPDATE otps SET consumed=1 WHERE id=? AND consumed=0", [challenge]);
      let user = await this.db.get<User>("SELECT * FROM users WHERE phone=?", [row.phone]);
      if (user?.status === "disabled" || user?.status === "pending") throw fail(403, "Account is not approved");
      if (!user) {
        const invite = row.invite_hash ? await this.db.get("SELECT * FROM invites WHERE hash=? AND used_by IS NULL AND expires_at>?", [row.invite_hash, this.now()]) : null;
        if (row.phone !== this.adminPhone && (!invite || (invite.phone && invite.phone !== row.phone))) throw fail(403, "Invitation required");
        const id = randomUUID();
        const statements = [
          { sql: "INSERT INTO users(id,phone,created_at) VALUES(?,?,?)", params: [id, row.phone, this.now()] },
          { sql: "INSERT INTO libraries(user_id,json,updated_at) VALUES(?,?,?)", params: [id, JSON.stringify(emptyLibrary()), this.now()] },
        ];
        if (invite) statements.push({ sql: "UPDATE invites SET used_by=? WHERE hash=? AND used_by IS NULL", params: [id, row.invite_hash] });
        await this.db.batch(statements); user = (await this.db.get<User>("SELECT * FROM users WHERE id=?", [id]))!;
      }
      await this.lock("bootstrap", async () => {
        const marker = await this.db.get("SELECT key FROM migrations WHERE key='first-admin-v1'");
        const admins = await this.db.get("SELECT count(*) AS n FROM users WHERE role='admin' AND status='approved'");
        if (!marker && !admins!.n && user!.phone === this.adminPhone) {
          await this.db.batch([{ sql: "UPDATE users SET role='admin' WHERE id=?", params: [user!.id] },
            { sql: "INSERT INTO migrations(key,value) VALUES('first-admin-v1',?)", params: [user!.id] }]); user!.role = "admin";
        }
      });
      const access = randomBytes(32).toString("base64url"); const refresh = randomBytes(32).toString("base64url");
      const ttl = row.remember ? 30 * 86400 : 12 * 3600;
      const hash = this.box.hash(access);
      await this.db.run("INSERT INTO sessions(access_hash,refresh_hash,access_enc,user_id,access_expires,expires_at,created_at) VALUES(?,?,?,?,?,?,?)",
        [hash, this.box.hash(refresh), this.box.seal(access, "session"), user.id, this.now() + 900_000, this.now() + ttl * 1000, this.now()]);
      await this.db.run("UPDATE users SET last_seen=? WHERE id=?", [this.now(), user.id]);
      await this.audit(user.id, "auth.login", null, ip);
      return { user, cookies: this.sessionCookies(access, refresh, ttl) };
    });
  }
  sessionCookies(access: string, refresh: string, ttl: number) {
    return [`__Host-musike=${access}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=900`,
      `__Host-musike-refresh=${refresh}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttl}`];
  }
  async authenticate(header: string | undefined) {
    const values = cookies(header); const access = values["__Host-musike"] ?? ""; const refresh = values["__Host-musike-refresh"] ?? "";
    let session = access ? await this.db.get("SELECT s.*,u.phone,u.name,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.access_hash=? AND s.expires_at>?", [this.box.hash(access), this.now()]) : undefined;
    let setCookies: string[] | undefined;
    if (!session || session.access_expires <= this.now()) {
      session = refresh ? await this.db.get("SELECT s.*,u.phone,u.name,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.refresh_hash=? AND s.expires_at>?", [this.box.hash(refresh), this.now()]) : undefined;
      if (session?.status === "approved") {
        const raw = this.box.open(session.access_enc, "session");
        await this.db.run("UPDATE sessions SET access_expires=? WHERE access_hash=?", [this.now() + 900_000, session.access_hash]);
        setCookies = this.sessionCookies(raw, refresh, Math.max(1, Math.floor((session.expires_at - this.now()) / 1000)));
      }
    }
    if (!session || session.status !== "approved") return null;
    const user: User = { id: session.user_id, phone: session.phone, name: session.name, role: session.role, status: session.status, last_seen: this.now() };
    return { user, session: session.access_hash as string, cookies: setCookies };
  }
  async logout(header: string | undefined) {
    const values = cookies(header);
    const access = this.box.hash(values["__Host-musike"] ?? ""); const refresh = this.box.hash(values["__Host-musike-refresh"] ?? "");
    await this.db.batch([
      { sql: "DELETE FROM clients WHERE session_hash IN (SELECT access_hash FROM sessions WHERE access_hash=? OR refresh_hash=?)", params: [access, refresh] },
      { sql: "DELETE FROM sessions WHERE access_hash=? OR refresh_hash=?", params: [access, refresh] },
    ]);
    return this.sessionCookies("", "", 0).map((cookie) => cookie.replace(/Max-Age=\d+/, "Max-Age=0"));
  }
  async changeUser(actor: string, id: string, patch: { role?: string; status?: string; name?: string }, ip: string) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw fail(400, "Invalid user settings");
    return this.lock("users", async () => {
      const user = await this.db.get<User>("SELECT * FROM users WHERE id=?", [id]); if (!user) throw fail(404, "User not found");
      const role = patch.role ?? user.role; const status = patch.status ?? user.status; const name = patch.name ?? user.name;
      if (!["admin", "user"].includes(role) || !["approved", "pending", "disabled"].includes(status) || typeof name !== "string" || name.length > 80) throw fail(400, "Invalid user settings");
      if (user.role === "admin" && user.status === "approved" && (role !== "admin" || status !== "approved")) {
        const count = await this.db.get("SELECT count(*) AS n FROM users WHERE role='admin' AND status='approved'");
        if (count!.n <= 1) throw fail(409, "Cannot remove the last approved administrator");
      }
      await this.db.run("UPDATE users SET role=?,status=?,name=? WHERE id=?", [role, status, name, id]);
      if (status !== "approved") await this.db.batch([{ sql: "DELETE FROM sessions WHERE user_id=?", params: [id] }, { sql: "DELETE FROM clients WHERE user_id=?", params: [id] }]);
      await this.audit(actor, "admin.user.update", id, ip); return this.db.get<User>("SELECT * FROM users WHERE id=?", [id]);
    });
  }
  async invite(actor: string, phone: unknown, ip: string) {
    const code = randomBytes(18).toString("base64url"); const bound = phone ? phoneOf(phone) : null;
    await this.db.run("INSERT INTO invites(hash,phone,expires_at,created_by) VALUES(?,?,?,?)", [this.box.hash(code), bound, this.now() + 7 * 86400_000, actor]);
    await this.audit(actor, "admin.invite.create", null, ip); return { code, expiresAt: this.now() + 7 * 86400_000 };
  }
  async close() { await this.db.close(); }
}
