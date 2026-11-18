import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Accounts, fail } from "./accounts.js";
import { googleMusicSource, type GoogleTokens, type ImportSource, type SourceTrack } from "./googleSource.js";
import { ytdlpSearch } from "./ytdlp.js";
import { sanitizeTrack } from "./library.js";
import { VIDEO_ID, type Track } from "./types.js";
import { TaskQueue } from "./taskQueue.js";

export interface GoogleOptions { clientId?: string; clientSecret?: string; redirectUri?: string; transport?: typeof fetch;
  source?: (tokens: GoogleTokens, signal: AbortSignal) => Promise<ImportSource>;
  resolve?: (track: SourceTrack) => Promise<Track | null>; }
interface ItemReport { sourceId: string; kind: string; title: string; status: "imported" | "already-present" | "not-found"; }
interface Report { items: ItemReport[]; unavailable: string[]; imported: number; alreadyPresent: number; notFound: number; }

interface SearchCandidate { id: string; title: string; channel?: string; uploader?: string; duration?: number; }
const normalized = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/\b(?:official|music video|audio|lyrics?|topic|vevo)\b/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Prefer the source ID; otherwise require both title and artist evidence, never the first arbitrary hit. */
export function selectImportMatch(source: SourceTrack, candidates: SearchCandidate[]): SearchCandidate | null {
  const valid = candidates.filter((entry) => VIDEO_ID.test(entry.id));
  const exact = valid.find((entry) => entry.id === source.id); if (exact) return exact;
  const title = normalized(source.title); const artist = normalized(source.artist);
  if (!title || !artist) return null;
  return valid.find((entry) => {
    const candidateTitle = normalized(entry.title); const channel = normalized(entry.channel ?? entry.uploader ?? "");
    const artistMatch = channel === artist || (` ${candidateTitle} `).includes(` ${artist} `);
    return artistMatch && (candidateTitle === title || candidateTitle === `${artist} ${title}` || candidateTitle === `${title} ${artist}`);
  }) ?? null;
}

export class GoogleImport {
  readonly clientId: string; readonly clientSecret: string; readonly redirectUri: string;
  readonly configured: boolean; private transport: typeof fetch;
  private queue = new TaskQueue(2, 20, 60_000);
  private jobs = new Map<string, { id: string; controller: AbortController; promise: Promise<void>; automatic: boolean }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  constructor(readonly accounts: Accounts, readonly options: GoogleOptions = {}) {
    this.clientId = options.clientId ?? process.env.GOOGLE_CLIENT_ID ?? "";
    this.clientSecret = options.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
    this.redirectUri = options.redirectUri ?? process.env.GOOGLE_REDIRECT_URI ?? (accounts.origin ? `${accounts.origin}/api/google/callback` : "");
    this.configured = !!(this.clientId && this.clientSecret && this.redirectUri);
    if (this.configured && new URL(this.redirectUri).protocol !== "https:") throw new Error("Google redirect URI must use HTTPS");
    this.transport = options.transport ?? fetch;
  }
  private async tokenRequest(body: Record<string, string>): Promise<any> {
    const response = await this.transport("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...body, client_id: this.clientId, client_secret: this.clientSecret }), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) { await response.body?.cancel(); throw fail(502, "Google authorization failed"); }
    const data = await response.json(); if (typeof data.access_token !== "string") throw fail(502, "Google authorization failed"); return data;
  }
  async connect(user: string) {
    if (!this.configured) throw fail(503, "Google import is not configured");
    const state = randomBytes(32).toString("base64url"); const verifier = randomBytes(32).toString("base64url");
    await this.accounts.db.run("DELETE FROM oauth_states WHERE expires_at<?", [this.accounts.now()]);
    await this.accounts.db.run("INSERT INTO oauth_states(hash,user_id,verifier_enc,expires_at) VALUES(?,?,?,?)", [this.accounts.box.hash(state), user,
      this.accounts.box.seal(verifier, `oauth:${user}`), this.accounts.now() + 600_000]);
    const query = new URLSearchParams({ client_id: this.clientId, redirect_uri: this.redirectUri, response_type: "code", access_type: "offline", prompt: "consent",
      scope: "https://www.googleapis.com/auth/youtube.readonly", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${query}` };
  }
  async callback(state: unknown, code: unknown, ip = "local", currentUser?: string) {
    if (!this.configured || typeof state !== "string" || state.length > 100 || typeof code !== "string" || code.length > 4096) throw fail(400, "Invalid Google callback");
    return this.accounts.lock(`oauth:${state}`, async () => {
      const row = await this.accounts.db.get("SELECT s.*,u.status FROM oauth_states s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>?", [this.accounts.box.hash(state), this.accounts.now()]);
      if (!row || row.status !== "approved") throw fail(400, "Google authorization has expired");
      if (currentUser !== undefined && row.user_id !== currentUser) throw fail(403, "Google authorization belongs to another account");
      await this.accounts.db.run("DELETE FROM oauth_states WHERE hash=?", [this.accounts.box.hash(state)]);
      const verifier = this.accounts.box.open(row.verifier_enc, `oauth:${row.user_id}`);
      const data = await this.tokenRequest({ grant_type: "authorization_code", code, redirect_uri: this.redirectUri, code_verifier: verifier });
      if (typeof data.refresh_token !== "string" || !data.refresh_token) throw fail(400, "Offline Google consent is required");
      const tokens: GoogleTokens = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: this.accounts.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000 };
      await this.accounts.db.run("INSERT INTO google_tokens(user_id,encrypted) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted=excluded.encrypted",
        [row.user_id, this.accounts.box.seal(JSON.stringify(tokens), `google:${row.user_id}`)]);
      await this.accounts.audit(row.user_id, "google.connected", null, ip);
    });
  }
  async tokens(user: string): Promise<GoogleTokens> {
    return this.accounts.lock(`google-token:${user}`, async () => {
      const row = await this.accounts.db.get("SELECT encrypted FROM google_tokens WHERE user_id=?", [user]); if (!row) throw fail(409, "Google is not connected");
      const tokens = JSON.parse(this.accounts.box.open(row.encrypted, `google:${user}`)) as GoogleTokens;
      if (tokens.expires_at - this.accounts.now() > 60_000) return tokens;
      const data = await this.tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
      tokens.access_token = data.access_token; tokens.expires_at = this.accounts.now() + (Number(data.expires_in) || 3600) * 1000;
      if (data.refresh_token) tokens.refresh_token = data.refresh_token;
      await this.accounts.db.run("UPDATE google_tokens SET encrypted=? WHERE user_id=?", [this.accounts.box.seal(JSON.stringify(tokens), `google:${user}`), user]);
      return tokens;
    });
  }
  async status(user: string) {
    const token = await this.accounts.db.get("SELECT auto_sync,last_sync FROM google_tokens WHERE user_id=?", [user]);
    const run = await this.accounts.db.get("SELECT id,status,report FROM import_runs WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1", [user]);
    return { connected: !!token, autoSync: !!token?.auto_sync, lastSync: token?.last_sync ?? null, runId: run?.id ?? null,
      status: run?.status ?? null, report: run ? JSON.parse(run.report) : null };
  }
  async setSync(user: string, enabled: unknown) {
    if (typeof enabled !== "boolean") throw fail(400, "Invalid sync setting");
    const result = await this.accounts.db.run("UPDATE google_tokens SET auto_sync=?,next_sync=? WHERE user_id=?", [enabled ? 1 : 0, enabled ? this.accounts.now() + 86400_000 : null, user]);
    if (!result.changes) throw fail(409, "Google is not connected");
    if (!enabled && this.jobs.get(user)?.automatic) this.jobs.get(user)!.controller.abort();
    return { autoSync: enabled };
  }
  async disconnect(user: string) {
    this.jobs.get(user)?.controller.abort();
    const row = await this.accounts.db.get("SELECT encrypted FROM google_tokens WHERE user_id=?", [user]);
    await this.accounts.db.batch([{ sql: "DELETE FROM google_tokens WHERE user_id=?", params: [user] }, { sql: "DELETE FROM oauth_states WHERE user_id=?", params: [user] }]);
    if (row) {
      try { const token = JSON.parse(this.accounts.box.open(row.encrypted, `google:${user}`)) as GoogleTokens;
        const response = await this.transport("https://oauth2.googleapis.com/revoke", { method: "POST", body: new URLSearchParams({ token: token.refresh_token }),
          headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(10_000) }); await response.body?.cancel();
        return { ok: true, revoked: response.ok }; } catch { return { ok: true, revoked: false }; }
    }
    return { ok: true, revoked: true };
  }
  async start(user: string, automatic = false) {
    return this.accounts.lock(`google-start:${user}`, async () => {
    if (!this.configured || this.closed) throw fail(503, "Google import is unavailable");
    if (this.jobs.has(user)) return { runId: this.jobs.get(user)!.id };
    if (!await this.accounts.db.get("SELECT user_id FROM google_tokens WHERE user_id=?", [user])) throw fail(409, "Google is not connected");
    const id = randomUUID(); const controller = new AbortController();
    await this.accounts.db.run("DELETE FROM import_runs WHERE user_id=? AND id NOT IN (SELECT id FROM import_runs WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 19)", [user, user]);
    await this.accounts.db.run("INSERT INTO import_runs(id,user_id,status,created_at,report) VALUES(?,?,'running',?,?)", [id, user, this.accounts.now(), JSON.stringify({ items: [], unavailable: [], imported: 0, alreadyPresent: 0, notFound: 0 })]);
    const promise = this.queue.run(async () => {
      if (automatic && !(await this.accounts.db.get("SELECT user_id FROM google_tokens WHERE user_id=? AND auto_sync=1", [user]))) throw new Error("Sync cancelled");
      return this.run(user, id, controller.signal);
    }, controller.signal).catch(async () => {
      await this.accounts.db.run("UPDATE import_runs SET status='error',report=? WHERE id=? AND user_id=?", [JSON.stringify({ unavailable: ["Import failed or cancelled"], items: [] }), id, user]).catch(() => {});
      await this.accounts.audit(user, "google.import-failed", id, "background", "error").catch(() => {});
    }).finally(() => { if (this.jobs.get(user)?.id === id) this.jobs.delete(user); });
    this.jobs.set(user, { id, controller, promise, automatic });
    return { runId: id };
    });
  }
  private async resolve(source: SourceTrack): Promise<Track | null> {
    if (this.options.resolve) return this.options.resolve(source);
    const entries = await ytdlpSearch(`${source.title} ${source.artist}`.trim(), 5);
    const first = selectImportMatch(source, entries);
    return first ? sanitizeTrack({ id: first.id, title: source.title || first.title, artist: source.artist, album: source.album,
      duration: first.duration ?? 0, thumb: `https://i.ytimg.com/vi/${first.id}/mqdefault.jpg`, art: `https://i.ytimg.com/vi/${first.id}/hq720.jpg`, kind: "song" }) : null;
  }
  private async run(user: string, run: string, signal: AbortSignal) {
    const tokens = await this.tokens(user);
    const max = Math.max(1, Math.min(100000, Number(process.env.MUSIKE_IMPORT_MAX_ITEMS ?? 10000) || 10000));
    const source = this.options.source ? await this.options.source(tokens, signal) : await googleMusicSource(tokens, this, this.transport, signal, max);
    const lib = this.accounts.library(user);
    const report: Report = { items: [], unavailable: [...source.unavailable], imported: 0, alreadyPresent: 0, notFound: 0 };
    const existing = new Map((await this.accounts.db.all("SELECT source_id,kind,destination_id FROM import_items WHERE user_id=?", [user]))
      .map((row) => [`${row.kind}:${row.source_id}`, row.destination_id as string]));
    const resolved = new Map<string, Promise<Track | null>>();
    const check = () => { if (signal.aborted || this.closed) throw new Error("Import cancelled"); };
    let processed = 0;
    const group = async (tracks: SourceTrack[], kind: "playlist" | "album" | "like" | "history", collection: string, present: Track[],
      save: (tracks: Track[]) => Promise<unknown>) => {
      const ids = new Set(present.map((track) => track.id));
      const added: Track[] = [];
      const records: { item: SourceTrack; trackId: string; status: "imported" | "already-present" }[] = [];
      for (const item of tracks) {
        check();
        if (++processed > max) { if (!report.unavailable.includes("Import item limit reached")) report.unavailable.push("Import item limit reached"); break; }
        const key = `${collection}:${item.id}`;
        const mapped = existing.get(`${kind}:${key}`);
        if (mapped && ids.has(mapped)) { records.push({ item, trackId: mapped, status: "already-present" }); continue; }
        let resolution = resolved.get(item.id);
        if (!resolution) { resolution = this.resolve(item).catch(() => null); resolved.set(item.id, resolution); }
        const track = await resolution; check();
        if (!track) { report.notFound++; report.items.push({ sourceId: item.id, title: item.title, kind, status: "not-found" }); continue; }
        const status = ids.has(track.id) ? "already-present" as const : "imported" as const;
        if (status === "imported") { added.push({ ...track, origin: { provider: "youtube-music", sourceId: key, kind } }); ids.add(track.id); }
        records.push({ item, trackId: track.id, status });
      }
      check();
      if (added.length) await save(added);
      if (records.length) await this.accounts.db.batch(records.map(({ item, trackId }) => ({
        sql: "INSERT INTO import_items(user_id,source_id,kind,destination_id) VALUES(?,?,?,?) ON CONFLICT(user_id,source_id,kind) DO UPDATE SET destination_id=excluded.destination_id",
        params: [user, `${collection}:${item.id}`, kind, trackId],
      })));
      for (const { item, status } of records) {
        if (status === "imported") report.imported++; else report.alreadyPresent++;
        report.items.push({ sourceId: item.id, title: item.title, kind, status });
      }
    };
    for (const collection of source.collections) {
      check(); const key = `collection:${collection.id}`; const mapped = existing.get(`collection:${key}`);
      let playlist = (await lib.getLibrary()).playlists.find((p) => p.id === mapped ||
        (p.origin?.provider === "youtube-music" && p.origin.sourceId === collection.id && p.origin.kind === collection.kind));
      if (!playlist) playlist = await lib.createPlaylist(collection.name, [], { provider: "youtube-music", sourceId: collection.id, kind: collection.kind });
      await this.accounts.db.run("INSERT INTO import_items(user_id,source_id,kind,destination_id) VALUES(?,?,'collection',?) ON CONFLICT(user_id,source_id,kind) DO UPDATE SET destination_id=excluded.destination_id", [user, key, playlist.id]);
      const pid = playlist.id;
      await group(collection.tracks, collection.kind, collection.id, playlist.tracks, (tracks) => lib.addToPlaylist(pid, tracks));
      if (processed >= max) break;
    }
    await group(source.likes, "like", "likes", (await lib.getLibrary()).favorites, (tracks) => lib.addFavorites(tracks));
    await group([...source.history.slice(0, 60)].reverse(), "history", "history", (await lib.getLibrary()).history, async (tracks) => {
      for (const track of tracks) { check(); await lib.pushHistory(track); }
    });
    check();
    await this.accounts.db.batch([
      { sql: "UPDATE import_runs SET status=?,report=? WHERE id=? AND user_id=?", params: [report.unavailable.length || report.notFound ? "partial" : "done", JSON.stringify(report), run, user] },
      { sql: "UPDATE google_tokens SET last_sync=? WHERE user_id=?", params: [this.accounts.now(), user] },
    ]);
  }
  async syncDue() {
    if (!this.configured || this.closed) return;
    const due = await this.accounts.db.all("SELECT g.user_id FROM google_tokens g JOIN users u ON u.id=g.user_id WHERE g.auto_sync=1 AND g.next_sync<=? AND u.status='approved' LIMIT 20", [this.accounts.now()]);
    for (const row of due) {
      const claim = await this.accounts.db.run("UPDATE google_tokens SET next_sync=? WHERE user_id=? AND auto_sync=1 AND next_sync<=?", [this.accounts.now() + 86400_000, row.user_id, this.accounts.now()]);
      if (claim.changes) await this.start(row.user_id, true);
    }
  }
  async recover() {
    await this.accounts.db.run("UPDATE import_runs SET status='error',report=? WHERE status='running'", [JSON.stringify({ items: [], unavailable: ["Import interrupted by server restart"] })]);
  }
  schedule() { if (!this.configured || this.timer) return; this.timer = setInterval(() => void this.syncDue().catch(() => {}), 60_000); this.timer.unref(); }
  async close() { this.closed = true; if (this.timer) clearInterval(this.timer); this.queue.close(); for (const job of this.jobs.values()) job.controller.abort();
    await Promise.allSettled([...this.jobs.values()].map((job) => job.promise)); }
}

export function registerGoogle(app: FastifyInstance, service: GoogleImport | null) {
  const requireService = () => { if (!service?.configured) throw fail(404, "Google import is disabled"); return service; };
  app.post("/api/google/connect", async (req) => requireService().connect(req.musikeUser!.id));
  app.get("/api/google/callback", async (req, reply) => {
    const query = req.query as { state?: string; code?: string };
    if (!req.musikeUser) throw fail(401, "Login required");
    await requireService().callback(query.state, query.code, req.realClientIp, req.musikeUser.id); return reply.redirect("/library?google=connected");
  });
  app.get("/api/google/status", async (req) => requireService().status(req.musikeUser!.id));
  app.post("/api/google/import", async (req, reply) => reply.code(202).send(await requireService().start(req.musikeUser!.id)));
  app.post("/api/google/sync", async (req) => requireService().setSync(req.musikeUser!.id, (req.body as { enabled?: unknown })?.enabled));
  app.post("/api/google/disconnect", async (req) => requireService().disconnect(req.musikeUser!.id));
}
