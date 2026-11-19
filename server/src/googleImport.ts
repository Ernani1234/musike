import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Accounts, fail } from "./accounts.js";
import { googleMusicSource, type GoogleTokens, type ImportSource, type SourceTrack } from "./googleSource.js";
import { ytdlpSearch } from "./ytdlp.js";
import { sanitizeTrack } from "./library.js";
import { VIDEO_ID, type Track } from "./types.js";
import { withClient, search } from "./search.js";
import { rankImportCandidates, selectImportMatch, type SearchCandidate, type ScoredCandidate } from "./importMatching.js";
export { selectImportMatch } from "./importMatching.js";
import { TaskQueue, waitForSignal } from "./taskQueue.js";

export interface GoogleOptions { clientId?: string; clientSecret?: string; redirectUri?: string; transport?: typeof fetch;
  source?: (tokens: GoogleTokens, signal: AbortSignal) => Promise<ImportSource>;
  resolve?: (track: SourceTrack, signal?: AbortSignal) => Promise<Track | null>;
  original?: (track: SourceTrack, signal: AbortSignal) => Promise<Track | null>;
  candidates?: (track: SourceTrack, mode: "artist" | "music" | "title", signal: AbortSignal) => Promise<SearchCandidate[]>; }
interface ItemReport { sourceId: string; kind: string; title: string; status: "imported" | "already-present" | "not-found" | "needs-review"; candidates?: ScoredCandidate[]; reason?: string; }
interface Report { items: ItemReport[]; unavailable: string[]; imported: number; alreadyPresent: number; notFound: number; reviewNeeded: number;
  progress: { phase: "queued" | "fetching" | "matching" | "complete" | "cancelled"; processed: number; total: number | null; current?: string; lastCompleted?: { sourceId: string; title: string; status: string }; pending?: number; startedAt: number; updatedAt: number } }
interface Resolution { track: Track | null; candidates: ScoredCandidate[]; reason?: string; }
const newReport = (): Report => ({ items: [], unavailable: [], imported: 0, alreadyPresent: 0, notFound: 0, reviewNeeded: 0,
  progress: { phase: "queued", processed: 0, total: null, startedAt: Date.now(), updatedAt: Date.now() } });

export class GoogleImport {
  readonly clientId: string; readonly clientSecret: string; readonly redirectUri: string;
  readonly configured: boolean; private transport: typeof fetch;
  private queue = new TaskQueue(2, 20, 60_000);
  private jobs = new Map<string, { id: string; controller: AbortController; promise: Promise<void>; automatic: boolean; report: Report }>();
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
  async status(user: string, after?: number, runId?: string) {
    const token = await this.accounts.db.get("SELECT auto_sync,last_sync FROM google_tokens WHERE user_id=?", [user]);
    const active = this.jobs.get(user);
    const run = active ? { id: active.id, status: "running", report: active.report } :
      await this.accounts.db.get("SELECT id,status,report FROM import_runs WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1", [user]);
    const report: Report | null = run ? typeof run.report === "string" ? JSON.parse(run.report) : run.report : null;
    const offset = report && runId === run?.id && Number.isInteger(after) && after! >= 0 ? Math.min(after!, report.items.length) : 0;
    return { connected: !!token, autoSync: !!token?.auto_sync, lastSync: token?.last_sync ?? null, runId: run?.id ?? null,
      status: run?.status ?? null, report: report ? { ...report, items: after === undefined ? report.items : report.items.slice(offset, offset + 100) } : null,
      itemOffset: offset, itemTotal: report?.items.length ?? 0 };
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
    const id = randomUUID(); const controller = new AbortController(); const report = newReport();
    await this.accounts.db.run("DELETE FROM import_runs WHERE user_id=? AND id NOT IN (SELECT id FROM import_runs WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 19)", [user, user]);
    await this.accounts.db.run("INSERT INTO import_runs(id,user_id,status,created_at,report) VALUES(?,?,'running',?,?)", [id, user, this.accounts.now(), JSON.stringify(report)]);
    const promise = this.queue.run(async () => {
      if (automatic && !(await this.accounts.db.get("SELECT user_id FROM google_tokens WHERE user_id=? AND auto_sync=1", [user]))) throw new Error("Sync cancelled");
      return this.run(user, id, controller.signal, report);
    }, controller.signal).catch(async () => {
      report.progress.phase = "cancelled"; report.progress.current = undefined; report.progress.updatedAt = Date.now();
      report.unavailable.push("Import failed or cancelled; completed items retained");
      await this.accounts.db.run("UPDATE import_runs SET status='error',report=? WHERE id=? AND user_id=?", [JSON.stringify(report), id, user]).catch(() => {});
      await this.accounts.audit(user, "google.import-failed", id, "background", "error").catch(() => {});
    }).finally(() => { if (this.jobs.get(user)?.id === id) this.jobs.delete(user); });
    this.jobs.set(user, { id, controller, promise, automatic, report });
    return { runId: id };
    });
  }
  private async resolve(source: SourceTrack, signal: AbortSignal): Promise<Resolution> {
    if (this.options.resolve) return { track: await waitForSignal(this.options.resolve(source, signal), signal), candidates: [] };
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
    const originalSignal = AbortSignal.any([deadline, AbortSignal.timeout(6000)]);
    const original = async () => {
      const info: any = await withClient((yt) => yt.getBasicInfo(source.id), undefined, originalSignal);
      if (info.playability_status?.status !== "OK") return null;
      return sanitizeTrack({ id: source.id, title: source.title || info.basic_info?.title, artist: source.artist,
        album: source.album, duration: source.duration || info.basic_info?.duration || 0,
        thumb: `https://i.ytimg.com/vi/${source.id}/mqdefault.jpg`, art: `https://i.ytimg.com/vi/${source.id}/hq720.jpg`, kind: "song" });
    };
    if (VIDEO_ID.test(source.id)) {
      try { const track = await waitForSignal(this.options.original ? this.options.original(source, originalSignal) : original(), originalSignal); if (track) return { track, candidates: [] }; }
      catch { if (signal.aborted) throw new Error("Import cancelled"); }
    }
    const candidates: SearchCandidate[] = []; let failures = 0;
    for (const mode of ["artist", "music", "title"] as const) {
      if (deadline.aborted) break;
      const attempt = AbortSignal.any([deadline, AbortSignal.timeout(8000)]);
      try {
        const result = this.options.candidates ? this.options.candidates(source, mode, attempt) : mode === "music" ?
          search(`${source.title} ${source.artist}`.trim(), "song").then((tracks) => tracks.slice(0, 8).map((track) => ({ id: track.id, title: track.title, channel: track.artist, duration: track.duration }))) :
          ytdlpSearch(mode === "title" ? source.title : `${source.title} ${source.artist}`.trim(), 8, attempt);
        candidates.push(...(await waitForSignal(result, attempt)).slice(0, 8));
        const match = selectImportMatch(source, candidates);
        if (match) return { track: sanitizeTrack({ id: match.id, title: source.title || match.title, artist: source.artist, album: source.album,
          duration: match.duration ?? source.duration ?? 0, thumb: `https://i.ytimg.com/vi/${match.id}/mqdefault.jpg`, art: `https://i.ytimg.com/vi/${match.id}/hq720.jpg`, kind: "song" }), candidates: [] };
      } catch { failures++; if (signal.aborted) throw new Error("Import cancelled"); }
    }
    return { track: null, reason: failures === 3 || deadline.aborted ? "provider-unavailable" : "no-confident-match", candidates: rankImportCandidates(source, candidates).filter((item) => item.score >= .55).slice(0, 3) };
  }
  private async run(user: string, run: string, signal: AbortSignal, report: Report) {
    report.progress.phase = "fetching";
    const tokens = await this.tokens(user);
    const max = Math.max(1, Math.min(100000, Number(process.env.MUSIKE_IMPORT_MAX_ITEMS ?? 10000) || 10000));
    const source = await waitForSignal(this.options.source ? this.options.source(tokens, signal) : googleMusicSource(tokens, this, this.transport, signal, max), signal);
    const lib = this.accounts.library(user); report.unavailable = [...source.unavailable];
    report.progress.phase = "matching";
    report.progress.total = Math.min(max, source.collections.reduce((n, collection) => n + collection.tracks.length, 0) + source.likes.length + source.history.slice(0, 60).length);
    let checkpointItems = 0;
    const checkpoint = async (force = false) => {
      report.progress.updatedAt = Date.now();
      if (!force && report.items.length - checkpointItems < 20) return;
      await this.accounts.db.run("UPDATE import_runs SET report=? WHERE id=? AND user_id=?", [JSON.stringify(report), run, user]);
      checkpointItems = report.items.length;
    };
    const existing = new Map((await this.accounts.db.all("SELECT source_id,kind,destination_id FROM import_items WHERE user_id=?", [user]))
      .map((row) => [`${row.kind}:${row.source_id}`, row.destination_id as string]));
    const resolved = new Map<string, Promise<Resolution>>();
    const check = () => { if (signal.aborted || this.closed) throw new Error("Import cancelled"); };
    let processed = 0;
    const group = async (tracks: SourceTrack[], kind: "playlist" | "album" | "like" | "history", collection: string, present: Track[],
      save: (tracks: Track[]) => Promise<unknown>) => {
      const ids = new Set(present.map((track) => track.id));
      let added: Track[] = [];
      let records: { item: SourceTrack; trackId: string; status: "imported" | "already-present" }[] = [];
      let savedAt = Date.now();
      const flush = async () => {
        check(); if (added.length) await save(added);
        if (records.length) await this.accounts.db.batch(records.map(({ item, trackId }) => ({
          sql: "INSERT INTO import_items(user_id,source_id,kind,destination_id) VALUES(?,?,?,?) ON CONFLICT(user_id,source_id,kind) DO UPDATE SET destination_id=excluded.destination_id",
          params: [user, `${collection}:${item.id}`, kind, trackId],
        })));
        for (const { item, trackId, status } of records) {
          if (report.progress.lastCompleted?.sourceId === item.id) report.progress.lastCompleted.status = status;
          if (status === "imported") report.imported++; else report.alreadyPresent++;
          report.items.push({ sourceId: item.id, title: item.title, kind, status });
          existing.set(`${kind}:${collection}:${item.id}`, trackId);
        }
        added = []; records = []; report.progress.pending = 0; savedAt = Date.now(); await checkpoint();
      };
      for (const item of tracks) {
        check();
        if (processed >= max) { if (!report.unavailable.includes("Import item limit reached")) report.unavailable.push("Import item limit reached"); break; }
        processed++; report.progress.processed = processed - 1; report.progress.current = item.title;
        let completedStatus = "matched";
        const key = `${collection}:${item.id}`; const mapped = existing.get(`${kind}:${key}`);
        if (mapped && ids.has(mapped)) { completedStatus = "already-present"; records.push({ item, trackId: mapped, status: "already-present" }); }
        else {
          const resolutionKey = `${item.id}:${item.title}:${item.artist}`;
          let resolution = resolved.get(resolutionKey);
          if (!resolution) { resolution = this.resolve(item, signal).catch((): Resolution => ({ track: null, candidates: [], reason: "provider-unavailable" })); resolved.set(resolutionKey, resolution); }
          const result = await resolution; check(); const track = result.track;
          if (!track) {
            const review = result.candidates.length > 0 || result.reason === "provider-unavailable";
            completedStatus = review ? "needs-review" : "not-found";
            if (review) report.reviewNeeded++; else report.notFound++;
            report.items.push({ sourceId: item.id, title: item.title, kind, status: review ? "needs-review" : "not-found", reason: result.reason, ...(review ? { candidates: result.candidates } : {}) });
          } else {
            const status = ids.has(track.id) ? "already-present" as const : "imported" as const;
            completedStatus = status === "already-present" ? status : "matched";
            if (status === "imported") { added.push({ ...track, origin: { provider: "youtube-music", sourceId: key, kind } }); ids.add(track.id); }
            records.push({ item, trackId: track.id, status });
          }
        }
        report.progress.processed = processed; report.progress.updatedAt = Date.now();
        report.progress.lastCompleted = { sourceId: item.id, title: item.title, status: completedStatus };
        report.progress.pending = records.length;
        if (records.length >= 20 || report.items.length === 0 && records.length > 0 || Date.now() - savedAt >= 1000) await flush();
        else await checkpoint();
      }
      await flush();
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
    check(); report.progress.phase = "complete"; report.progress.current = undefined; report.progress.updatedAt = Date.now();
    await this.accounts.db.batch([
      { sql: "UPDATE import_runs SET status=?,report=? WHERE id=? AND user_id=?", params: [report.unavailable.length || report.notFound || report.reviewNeeded ? "partial" : "done", JSON.stringify(report), run, user] },
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
    const rows = await this.accounts.db.all("SELECT id,user_id,report FROM import_runs WHERE status='running'");
    if (!rows.length) return;
    await this.accounts.db.batch(rows.map((row) => {
      let report: Partial<Report>;
      try { report = JSON.parse(row.report); } catch { report = newReport(); }
      report.unavailable = [...(report.unavailable ?? []), "Import interrupted by server restart; completed checkpoints retained"];
      if (report.progress) report.progress = { ...report.progress, phase: "cancelled", current: undefined, pending: 0, updatedAt: Date.now() };
      return { sql: "UPDATE import_runs SET status='error',report=? WHERE id=? AND user_id=?", params: [JSON.stringify(report), row.id, row.user_id] };
    }));
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
  app.get("/api/google/status", { schema: { querystring: { type: "object", additionalProperties: false, properties: {
    after: { type: "integer", minimum: 0, maximum: 100000 }, runId: { type: "string", maxLength: 80 } } } } }, async (req) => {
    const query = req.query as { after?: number; runId?: string }; return requireService().status(req.musikeUser!.id, query.after, query.runId);
  });
  app.post("/api/google/import", async (req, reply) => reply.code(202).send(await requireService().start(req.musikeUser!.id)));
  app.post("/api/google/sync", async (req) => requireService().setSync(req.musikeUser!.id, (req.body as { enabled?: unknown })?.enabled));
  app.post("/api/google/disconnect", async (req) => requireService().disconnect(req.musikeUser!.id));
}
