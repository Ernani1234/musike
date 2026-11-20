import { randomBytes, createHash } from "node:crypto";
import type { Accounts } from "./accounts.js";
import { fail } from "./accounts.js";
import type { PlaybackSnapshot } from "./playbackSync.js";

export interface DiscordOptions { clientId?: string; clientSecret?: string; redirectUri?: string; presenceUrl?: string; presenceKey?: string; transport?: typeof fetch; }
interface Tokens { access_token: string; refresh_token: string; expires_at: number; }
type Activity = { title: string; artist: string; album: string; artwork: string; url: string; startedAt: number; endsAt: number } | null;
/** OAuth and encrypted credentials stay in the server. Only an internal authenticated service sees access tokens. */
export class DiscordService {
  readonly configured: boolean;
  private clientId: string; private clientSecret: string; private redirectUri: string; private presenceUrl: string; private presenceKey: string;
  private transport: typeof fetch; private latest = new Map<string, { activity: Activity; at: number; ready: boolean; timer?: ReturnType<typeof setTimeout> }>();
  private timer: ReturnType<typeof setInterval>; private closed = false;
  private delivering = new Set<string>();
  constructor(readonly accounts: Accounts, options: DiscordOptions = {}, private log: (event: Record<string, unknown>) => void = () => {}) {
    this.clientId = options.clientId ?? process.env.DISCORD_CLIENT_ID ?? ""; this.clientSecret = options.clientSecret ?? process.env.DISCORD_CLIENT_SECRET ?? "";
    this.redirectUri = options.redirectUri ?? process.env.DISCORD_REDIRECT_URI ?? (accounts.origin ? `${accounts.origin}/api/discord/callback` : "");
    this.presenceUrl = options.presenceUrl ?? process.env.DISCORD_PRESENCE_URL ?? ""; this.presenceKey = options.presenceKey ?? process.env.DISCORD_PRESENCE_KEY ?? "";
    this.transport = options.transport ?? fetch;
    this.configured = !!(this.clientId && this.clientSecret && this.redirectUri && this.presenceUrl && this.presenceKey.length >= 32);
    if (this.configured) {
      const redirect = new URL(this.redirectUri); const service = new URL(this.presenceUrl);
      if (!/^\d{10,25}$/.test(this.clientId) || redirect.protocol !== "https:" || redirect.username || redirect.password ||
        !["http:", "https:"].includes(service.protocol) || service.username || service.password || service.search || service.hash) throw new Error("Invalid Discord configuration");
    }
    this.timer = setInterval(() => {
      for (const [user, state] of this.latest) if (Date.now() - state.at > 60000) { if (state.timer) clearTimeout(state.timer); this.latest.delete(user); void this.clear(user); }
    }, 15000); this.timer.unref();
  }
  async status(user: string) {
    const row = await this.accounts.db.get("SELECT discord_id FROM discord_connections WHERE user_id=?", [user]);
    return { configured: this.configured, connected: !!row, ready: this.latest.get(user)?.ready ?? false };
  }
  async connect(user: string) {
    if (!this.configured) throw fail(503, "Discord presence is not configured");
    const state = randomBytes(32).toString("base64url"); const verifier = randomBytes(48).toString("base64url");
    await this.accounts.db.batch([
      { sql: "DELETE FROM discord_states WHERE expires_at<? OR user_id=?", params: [Date.now(), user] },
      { sql: "INSERT INTO discord_states(hash,user_id,verifier_enc,expires_at) VALUES(?,?,?,?)", params: [this.accounts.box.hash(state), user, this.accounts.box.seal(verifier, `discord-state:${user}`), Date.now() + 600000] },
    ]);
    const url = new URL("https://discord.com/oauth2/authorize");
    url.search = new URLSearchParams({ client_id: this.clientId, redirect_uri: this.redirectUri, response_type: "code", scope: "openid identify sdk.social_layer_presence",
      state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", prompt: "consent" }).toString();
    return { url: url.href };
  }
  private async token(params: Record<string, string>): Promise<Tokens> {
    const response = await this.transport("https://discord.com/api/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, client_id: this.clientId, client_secret: this.clientSecret }), signal: AbortSignal.timeout(20000), redirect: "error" });
    if (!response.ok) { await response.body?.cancel(); throw fail(502, "Discord authorization failed"); }
    const data = await response.json() as Record<string, unknown>;
    if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string" || typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in) || data.expires_in <= 0 ||
      typeof data.scope !== "string" || !data.scope.split(" ").includes("sdk.social_layer_presence")) throw fail(502, "Discord did not grant presence access");
    return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 };
  }
  async callback(user: string, state: unknown, code: unknown) {
    if (!this.configured || typeof state !== "string" || state.length > 100 || typeof code !== "string" || code.length > 2048) throw fail(400, "Invalid Discord authorization");
    const row = await this.accounts.db.get("DELETE FROM discord_states WHERE hash=? AND user_id=? AND expires_at>? RETURNING verifier_enc", [this.accounts.box.hash(state), user, Date.now()]);
    if (!row) throw fail(400, "Discord authorization expired");
    const token = await this.token({ grant_type: "authorization_code", code, redirect_uri: this.redirectUri, code_verifier: this.accounts.box.open(row.verifier_enc, `discord-state:${user}`) });
    const response = await this.transport("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(20000), redirect: "error" });
    if (!response.ok) { await response.body?.cancel(); throw fail(502, "Discord identity verification failed"); }
    const identity = await response.json() as { id?: unknown };
    if (typeof identity.id !== "string" || !/^\d{10,25}$/.test(identity.id)) throw fail(502, "Discord identity verification failed");
    await this.accounts.lock("discord-link", async () => {
      const conflict = await this.accounts.db.get("SELECT user_id FROM discord_connections WHERE discord_id=?", [identity.id as string]);
      if (conflict && conflict.user_id !== user) throw fail(409, "This Discord account is already linked");
      await this.accounts.db.run("INSERT INTO discord_connections(user_id,discord_id,encrypted,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET discord_id=excluded.discord_id,encrypted=excluded.encrypted,updated_at=excluded.updated_at",
        [user, identity.id as string, this.accounts.box.seal(JSON.stringify(token), `discord:${user}`), Date.now()]);
    });
  }
  update(user: string, snapshot: PlaybackSnapshot) {
    if (!this.configured || this.closed) return;
    const track = snapshot.queue[snapshot.index];
    let activity: Activity = null;
    if (snapshot.status === "playing" && track) {
      // Start and end together make Discord draw a Spotify-style progress bar (elapsed / total).
      const startedAt = Math.floor(Date.now() / 1000 - snapshot.position);
      const known = [snapshot.duration, track.duration].find((value) => Number.isFinite(value) && value > 0);
      const duration = known ? Math.round(known) : 0;
      activity = { title: track.title, artist: track.artist, album: track.album ?? "", artwork: track.art || track.thumb,
        url: `https://music.youtube.com/watch?v=${track.id}`, startedAt, endsAt: duration ? startedAt + duration : 0 };
    }
    let state = this.latest.get(user);
    if (!state) { if (this.latest.size >= 128) return; state = { activity, at: Date.now(), ready: false }; this.latest.set(user, state); }
    state.activity = activity; state.at = Date.now();
    if (!state.timer) state.timer = setTimeout(() => { state!.timer = undefined; void this.deliver(user); }, activity ? 1000 : 0);
  }
  private async deliver(user: string) {
    if (this.delivering.has(user)) return;
    this.delivering.add(user);
    try { await this.accounts.lock(`discord:${user}`, async () => {
      const current = this.latest.get(user); if (!current || this.closed) return;
      try {
        const row = await this.accounts.db.get("SELECT d.encrypted FROM discord_connections d JOIN users u ON u.id=d.user_id WHERE d.user_id=? AND u.status='approved'", [user]);
        if (!row) { this.latest.delete(user); await this.clear(user); return; }
        let token = JSON.parse(this.accounts.box.open(row.encrypted, `discord:${user}`)) as Tokens;
        if (token.expires_at - Date.now() < 60000) {
          token = await this.token({ grant_type: "refresh_token", refresh_token: token.refresh_token });
          await this.accounts.db.run("UPDATE discord_connections SET encrypted=?,updated_at=? WHERE user_id=?", [this.accounts.box.seal(JSON.stringify(token), `discord:${user}`), Date.now(), user]);
        }
        const response = await this.transport(`${this.presenceUrl.replace(/\/$/, "")}/presence`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
          headers: { authorization: `Bearer ${this.presenceKey}`, "content-type": "application/json" }, body: JSON.stringify({ user, applicationId: this.clientId, accessToken: token.access_token, activity: current.activity }) });
        const result = await response.json().catch(() => null) as { ready?: boolean } | null;
        current.ready = response.ok && result?.ready === true;
        this.log({ event: "discord.presence", user, outcome: current.ready ? "ready" : "pending", status: response.status });
      } catch { current.ready = false; this.log({ event: "discord.presence", user, outcome: "unavailable" }); }
    }); } finally { this.delivering.delete(user); }
  }
  private async clear(user: string) {
    if (!this.configured) return;
    try { const response = await this.transport(`${this.presenceUrl.replace(/\/$/, "")}/presence/${encodeURIComponent(user)}`, { method: "DELETE", redirect: "error", headers: { authorization: `Bearer ${this.presenceKey}` }, signal: AbortSignal.timeout(5000) }); await response.body?.cancel(); }
    catch { this.log({ event: "discord.clear", user, outcome: "unavailable" }); }
  }
  async disconnect(user: string) {
    await this.accounts.lock(`discord:${user}`, async () => {
      const state = this.latest.get(user); if (state?.timer) clearTimeout(state.timer); this.latest.delete(user);
      const row = await this.accounts.db.get("DELETE FROM discord_connections WHERE user_id=? RETURNING encrypted", [user]);
      await this.accounts.db.run("DELETE FROM discord_states WHERE user_id=?", [user]); await this.clear(user);
      if (row) {
        try {
          const token = JSON.parse(this.accounts.box.open(row.encrypted, `discord:${user}`)) as Tokens;
          const response = await this.transport("https://discord.com/api/oauth2/token/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, token: token.refresh_token }), signal: AbortSignal.timeout(5000), redirect: "error" });
          await response.body?.cancel();
        } catch { this.log({ event: "discord.revoke", user, outcome: "unavailable" }); }
      }
    });
  }
  async close() {
    this.closed = true; clearInterval(this.timer);
    for (const [user, state] of this.latest) { if (state.timer) clearTimeout(state.timer); await this.accounts.lock(`discord:${user}`, () => this.clear(user)); }
    this.latest.clear();
  }
}
