import { randomUUID } from "node:crypto";
import { fail, type Accounts } from "./accounts.js";
import { sanitizeTrack } from "./library.js";
import { TaskQueue } from "./taskQueue.js";
import { resolveStreams, ytdlpPlaylist } from "./ytdlp.js";
import type { Track } from "./types.js";

export function playlistId(input: unknown) {
  if (typeof input !== "string" || input.length > 2048) throw fail(400, "Enter a YouTube playlist URL");
  let url: URL; try { url = new URL(input); } catch { throw fail(400, "Invalid playlist URL"); }
  const id = url.searchParams.get("list") ?? "";
  if (url.protocol !== "https:" || url.username || url.password || url.port || !["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(url.hostname) ||
    !["/playlist", "/watch"].includes(url.pathname) || !/^[\w-]{10,150}$/.test(id)) throw fail(400, "Enter a supported YouTube playlist URL");
  return id;
}
type Options = { extract?: typeof ytdlpPlaylist; resolve?: (track: Track, signal: AbortSignal) => Promise<Track>; limit?: number };
type Summary = { title: string; total: number; processed: number; added: number; already: number; skipped: number; failed: number; capped: boolean; message?: string };
const fresh = (): Summary => ({ title: "YouTube playlist", total: 0, processed: 0, added: 0, already: 0, skipped: 0, failed: 0, capped: false });
/** Durable item checkpoints make interrupted imports resumable without duplicating library tracks. */
export class PlaylistImport {
  private queue = new TaskQueue(2, 20, 60000);
  private jobs = new Map<string, { controller: AbortController; work: Promise<void> }>();
  private stopped = false;
  readonly limit: number;
  constructor(readonly accounts: Accounts, private options: Options = {}) { this.limit = Math.floor(Math.max(1, Math.min(5000, options.limit ?? (Number(process.env.MUSIKE_IMPORT_MAX_ITEMS) || 1000)))); }
  async recover() { await this.accounts.db.run("UPDATE playlist_imports SET status='interrupted' WHERE status IN ('running','queued')"); }
  async start(user: string, input: { url?: unknown; destination?: unknown }) {
    const source = playlistId(input.url);
    return this.accounts.lock(`playlist-import:${user}`, async () => {
      if (this.stopped) throw fail(503, "Import service is stopping");
      const active = await this.accounts.db.get("SELECT id FROM playlist_imports WHERE user_id=? AND status IN ('queued','running')", [user]);
      if (active) return { id: active.id as string };
      if (this.jobs.size >= 22) throw fail(429, "Import queue is full");
      const lib = await this.accounts.library(user).getLibrary();
      const existing = input.destination ? lib.playlists.find(p => p.id === input.destination) : lib.playlists.find(p => p.origin?.provider === "youtube" && p.origin.sourceId === source);
      if (input.destination && !existing) throw fail(404, "Destination playlist not found");
      const id = randomUUID();
      await this.accounts.db.batch([
        { sql: "DELETE FROM playlist_imports WHERE user_id=? AND status NOT IN ('running','queued') AND id NOT IN (SELECT id FROM playlist_imports WHERE user_id=? ORDER BY created_at DESC LIMIT 19)", params: [user, user] },
        { sql: "INSERT INTO playlist_imports VALUES(?,?,?,?,'queued',?,?,?)", params: [id, user, source, existing?.id ?? null, this.accounts.now(), this.accounts.now(), JSON.stringify(fresh())] },
      ]);
      this.launch(user, id); return { id };
    });
  }
  private launch(user: string, id: string) {
    const controller = new AbortController();
    const work = this.queue.run(() => this.run(user, id, controller.signal), controller.signal).catch(async () => {
      await this.accounts.db.run("UPDATE playlist_imports SET status=?,updated_at=? WHERE id=? AND user_id=?", [controller.signal.aborted ? "cancelled" : "interrupted", this.accounts.now(), id, user]).catch(() => {});
    }).finally(() => this.jobs.delete(id));
    this.jobs.set(id, { controller, work });
  }
  async status(user: string, id?: string, offset = 0) {
    const row = id ? await this.accounts.db.get("SELECT * FROM playlist_imports WHERE user_id=? AND id=?", [user, id]) : await this.accounts.db.get("SELECT * FROM playlist_imports WHERE user_id=? ORDER BY created_at DESC LIMIT 1", [user]);
    if (!row) { if (id) throw fail(404, "Import not found"); return null; }
    const entries = await this.accounts.db.all("SELECT position,json,status FROM playlist_import_entries WHERE run_id=? AND position>=? ORDER BY position LIMIT 100", [row.id, offset]);
    return { id: row.id as string, status: row.status as string, destination: row.destination_id as string | null, summary: JSON.parse(row.summary) as Summary,
      entries: entries.map(e => ({ position: e.position as number, title: JSON.parse(e.json)?.title || "Unavailable item", status: e.status as string })) };
  }
  async resume(user: string, id: string) {
    return this.accounts.lock(`playlist-import:${user}`, async () => {
      const row = await this.status(user, id); if (this.jobs.has(id)) return { id };
      if (this.stopped || this.jobs.size >= 22) throw fail(503, "Import service is busy");
      if (await this.accounts.db.get("SELECT id FROM playlist_imports WHERE user_id=? AND status IN ('queued','running')", [user])) throw fail(409, "Another import is active");
      await this.accounts.db.batch([{ sql: "UPDATE playlist_import_entries SET status='pending' WHERE run_id=? AND status='failed'", params: [id] },
        { sql: "UPDATE playlist_imports SET status='queued' WHERE id=? AND user_id=?", params: [id, user] }]);
      this.launch(user, row!.id); return { id };
    });
  }
  async cancel(user: string, id: string) { await this.status(user, id); const job = this.jobs.get(id); job?.controller.abort(); await job?.work; return { ok: true }; }
  async cancelUser(user: string) { const rows = await this.accounts.db.all("SELECT id FROM playlist_imports WHERE user_id=? AND status IN ('running','queued')", [user]); for (const row of rows) { const job = this.jobs.get(row.id); job?.controller.abort(); await job?.work; } }
  private async run(user: string, id: string, signal: AbortSignal) {
    const db = this.accounts.db; const row = await db.get("SELECT * FROM playlist_imports WHERE id=? AND user_id=?", [id, user]); if (!row) return;
    let summary: Summary = JSON.parse(row.summary); let destination: string | null = row.destination_id;
    await db.run("UPDATE playlist_imports SET status='running' WHERE id=? AND user_id=?", [id, user]);
    let count = await db.get("SELECT count(*) AS n FROM playlist_import_entries WHERE run_id=?", [id]);
    if (!count!.n) {
      const data = await (this.options.extract ?? ytdlpPlaylist)(row.source_id, this.limit + 1, signal);
      signal.throwIfAborted(); summary = { ...fresh(), title: data.title, total: Math.min(data.entries.length, this.limit), capped: data.entries.length > this.limit };
      await db.batch(data.entries.slice(0, this.limit).map((entry, position) => ({ sql: "INSERT INTO playlist_import_entries VALUES(?,?,?,'pending')", params: [id, position, JSON.stringify(entry ?? {})] })));
    }
    const library = this.accounts.library(user);
    if (!destination) { const p = await library.createPlaylist(summary.title, [], { provider: "youtube", sourceId: row.source_id, kind: "playlist" }); destination = p.id; }
    await db.run("UPDATE playlist_imports SET destination_id=?,summary=? WHERE id=? AND user_id=?", [destination, JSON.stringify(summary), id, user]);
    // Checkpoint each item status independently; never reserialize the full report per item.
    const entries = await db.all("SELECT position,json,status FROM playlist_import_entries WHERE run_id=? ORDER BY position", [id]);
    summary.processed = summary.added = summary.already = summary.skipped = summary.failed = 0;
    for (const entry of entries) {
      signal.throwIfAborted(); let status = entry.status as string;
      if (status === "pending") {
        try {
          const raw = JSON.parse(entry.json); const track = sanitizeTrack({ ...raw, artist: raw.channel || raw.uploader, thumb: raw.id ? `https://i.ytimg.com/vi/${raw.id}/hqdefault.jpg` : "", kind: "video" });
          if (["private", "premium_only", "subscriber_only"].includes(raw.availability) || /^(\[Private video\]|\[Deleted video\])$/.test(track.title)) status = "skipped";
          else {
            const playlist = (await library.getLibrary()).playlists.find(p => p.id === destination); if (!playlist) throw fail(404, "Destination playlist was removed");
            if (playlist.tracks.some(t => t.id === track.id)) status = "already";
            else {
              const playable = await (this.options.resolve ? this.options.resolve(track, AbortSignal.any([signal, AbortSignal.timeout(30000)])) : resolveStreams(track.id, AbortSignal.any([signal, AbortSignal.timeout(30000)])).then(r => ({ ...track, title: r.title, duration: r.duration })));
              signal.throwIfAborted(); await library.addToPlaylist(destination, playable); status = "added";
            }
          }
        } catch (e) { if (signal.aborted) throw e; status = [400, 403, 404].includes((e as { status?: number }).status ?? 0) || (e as { statusCode?: number }).statusCode === 400 ? "skipped" : "failed"; }
        await db.run("UPDATE playlist_import_entries SET status=? WHERE run_id=? AND position=?", [status, id, entry.position]);
      }
      summary.processed++; summary[status as "added" | "already" | "skipped" | "failed"]++;
      await db.run("UPDATE playlist_imports SET summary=?,updated_at=? WHERE id=? AND user_id=?", [JSON.stringify(summary), this.accounts.now(), id, user]);
    }
    await db.run("UPDATE playlist_imports SET status=?,updated_at=? WHERE id=? AND user_id=?", [summary.failed || summary.capped ? "partial" : "done", this.accounts.now(), id, user]);
  }
  async close() { this.stopped = true; this.queue.close(); for (const j of this.jobs.values()) j.controller.abort(); await Promise.allSettled([...this.jobs.values()].map(j => j.work)); }
}
