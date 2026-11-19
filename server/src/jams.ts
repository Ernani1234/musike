import { randomBytes, randomUUID } from "node:crypto";
import { fail, type Accounts } from "./accounts.js";
import { cleanCommand, cleanSnapshot, type PlaybackSnapshot, type PlaybackSync } from "./playbackSync.js";
import { radio } from "./search.js";
import { sanitizeTrack } from "./library.js";
const paused = (): PlaybackSnapshot => ({ queue: [], original: null, index: 0, position: 0, duration: 0, status: "paused", shuffle: false, repeat: "off", autoRadio: false });
/** Cross-user membership never changes private device ownership. Only that account's granted device emits audio. */
export class Jams {
  private buckets = new Map<string, { at: number; count: number }>();
  rate(user: string) {
    const now = this.accounts.now(); for (const [key, bucket] of this.buckets) if (now - bucket.at >= 60000) this.buckets.delete(key);
    let bucket = this.buckets.get(user); if (!bucket) { if (this.buckets.size >= 2048) throw fail(503, "Jam service is busy"); bucket = { at: now, count: 0 }; this.buckets.set(user, bucket); }
    if (++bucket.count > 240) throw fail(429, "Jam request limit reached");
  }
  constructor(readonly accounts: Accounts, private sync: PlaybackSync) {}
  private position(state: PlaybackSnapshot, at: number) { return state.status === "playing" ? Math.min(state.duration || 604800, state.position + Math.max(0, this.accounts.now() - at) / 1000) : state.position; }
  private async row(id: string) { const row = await this.accounts.db.get("SELECT * FROM jam_rooms WHERE id=?", [id]); if (!row) throw fail(404, "Jam room not found"); return row; }
  private async membership(user: string, id: string) { if (!await this.accounts.db.get("SELECT user_id FROM jam_members WHERE room_id=? AND user_id=?", [id, user])) throw fail(404, "Jam room not found"); }
  private async publish(id: string, state: PlaybackSnapshot, host?: string | null, exclude?: string) {
    const db = this.accounts.db; const now = this.accounts.now();
    await db.run("UPDATE jam_rooms SET json=?,version=version+1,updated_at=?" + (host === undefined ? "" : ",host_id=?") + " WHERE id=?", host === undefined ? [JSON.stringify(state), now, id] : [JSON.stringify(state), now, host, id]);
    const members = await db.all("SELECT user_id FROM jam_members WHERE room_id=?", [id]);
    await Promise.all(members.filter(m => m.user_id !== exclude).map(m => this.sync.applyJam(m.user_id, state)));
  }
  async recover() {
    const rows = await this.accounts.db.all("SELECT id,json FROM jam_rooms");
    await this.accounts.db.batch(rows.map(row => ({ sql: "UPDATE jam_rooms SET host_id=NULL,json=?,version=version+1,updated_at=? WHERE id=?", params: [JSON.stringify({ ...cleanSnapshot(JSON.parse(row.json)), status: "paused" }), this.accounts.now(), row.id] })));
  }
  async current(user: string) {
    const member = await this.accounts.db.get("SELECT room_id FROM jam_members WHERE user_id=?", [user]); return member ? this.view(user, member.room_id) : null;
  }
  async view(user: string, id: string) {
    return this.accounts.lock(`jam:${id}`, async () => {
      await this.membership(user, id); const db = this.accounts.db;
      await db.run("UPDATE jam_members SET seen=? WHERE room_id=? AND user_id=?", [this.accounts.now(), id, user]);
      let row = await this.row(id);
      if (row.host_id) {
        const host = await db.get("SELECT seen FROM jam_members WHERE room_id=? AND user_id=?", [id, row.host_id]); const output = this.sync.current(row.host_id);
        if (!host || this.accounts.now() - host.seen >= 45000 || JSON.parse(row.json).status === "playing" && output?.track && !output.outputOnline) {
          const state = cleanSnapshot(JSON.parse(row.json)); state.position = this.position(state, row.updated_at); state.status = "paused";
          await this.publish(id, state, null); row = await this.row(id);
        }
      }
      const members = await db.all("SELECT u.id,u.name,m.seen FROM jam_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=? ORDER BY u.name LIMIT 50", [id]);
      return { id, owner: row.owner_id as string, host: row.host_id as string | null, version: row.version as number, updatedAt: row.updated_at as number, serverNow: this.accounts.now(),
        guestControls: !!row.guest_controls, locked: !!row.locked, snapshot: cleanSnapshot(JSON.parse(row.json)),
        members: members.map(m => ({ id: m.id as string, name: m.name as string, online: this.accounts.now() - m.seen < 45000 })) };
    });
  }
  async create(user: string) {
    return this.accounts.lock("jam-membership", async () => {
      const db = this.accounts.db;
      if (await db.get("SELECT room_id FROM jam_members WHERE user_id=?", [user])) throw fail(409, "Leave your current jam first");
      if ((await db.get("SELECT count(*) AS n FROM jam_rooms"))!.n >= 128) throw fail(503, "Jam capacity reached");
      const id = randomUUID(); const state = paused();
      await db.batch([{ sql: "INSERT INTO jam_rooms(id,owner_id,host_id,json,version,updated_at) VALUES(?,?,?,?,1,?)", params: [id, user, user, JSON.stringify(state), this.accounts.now()] },
        { sql: "INSERT INTO jam_members VALUES(?,?,?)", params: [id, user, this.accounts.now()] }]);
      await this.sync.applyJam(user, state); return this.view(user, id);
    });
  }
  async invite(user: string, id: string) {
    return this.accounts.lock(`jam:${id}`, async () => {
      await this.membership(user, id); const row = await this.row(id); if (![row.host_id, row.owner_id].includes(user)) throw fail(403, "Host access required");
      const code = randomBytes(24).toString("base64url"); const expiresAt = this.accounts.now() + 30 * 60000;
      await this.accounts.db.batch([{ sql: "DELETE FROM jam_invites WHERE room_id=? OR expires_at<=?", params: [id, this.accounts.now()] }, { sql: "INSERT INTO jam_invites VALUES(?,?,?)", params: [this.accounts.box.hash(code), id, expiresAt] }]); return { code, expiresAt };
    });
  }
  async join(user: string, code: unknown) {
    if (typeof code !== "string" || code.length > 100) throw fail(400, "Invalid jam invitation");
    return this.accounts.lock("jam-membership", async () => {
      const db = this.accounts.db; const invite = await db.get("SELECT room_id FROM jam_invites WHERE hash=? AND expires_at>?", [this.accounts.box.hash(code), this.accounts.now()]);
      if (!invite) throw fail(404, "Invitation expired or revoked");
      const id = invite.room_id as string;
      await this.accounts.lock(`jam:${id}`, async () => {
        const row = await this.row(id); if (row.locked) throw fail(403, "Jam is locked");
        const member = await db.get("SELECT room_id FROM jam_members WHERE user_id=?", [user]); if (member && member.room_id !== id) throw fail(409, "Leave your current jam first");
        const capacity = Math.floor(Math.max(2, Math.min(50, Number(process.env.MUSIKE_JAM_CAPACITY) || 10)));
        if (!member && (await db.get("SELECT count(*) AS n FROM jam_members WHERE room_id=?", [id]))!.n >= capacity) throw fail(409, "Jam is full");
        await db.run("INSERT INTO jam_members VALUES(?,?,?) ON CONFLICT(room_id,user_id) DO UPDATE SET seen=excluded.seen", [id, user, this.accounts.now()]);
      }); const view = await this.view(user, id); await this.sync.applyJam(user, { ...view.snapshot, position: this.position(view.snapshot, view.updatedAt) }); return view;
    });
  }
  async leave(user: string, id: string) {
    return this.accounts.lock(`jam:${id}`, async () => {
      await this.membership(user, id); const row = await this.row(id); const state = cleanSnapshot(JSON.parse(row.json));
      await this.accounts.db.run("DELETE FROM jam_members WHERE room_id=? AND user_id=?", [id, user]);
      if (row.host_id === user) { state.position = this.position(state, row.updated_at); state.status = "paused"; await this.publish(id, state, null); }
      await this.sync.applyJam(user, { ...state, status: "paused" });
      await this.accounts.db.run("DELETE FROM jam_rooms WHERE id=? AND NOT EXISTS(SELECT 1 FROM jam_members WHERE room_id=?)", [id, id]); return { ok: true };
    });
  }
  async settings(user: string, id: string, input: Record<string, unknown>) {
    await this.accounts.lock(`jam:${id}`, async () => {
      await this.membership(user, id); const row = await this.row(id); const db = this.accounts.db;
      if (![row.host_id, row.owner_id].includes(user)) throw fail(403, "Host access required");
      if (input.guestControls !== undefined && typeof input.guestControls !== "boolean" || input.locked !== undefined && typeof input.locked !== "boolean") throw fail(400, "Invalid jam settings");
      if (input.remove !== undefined) {
        if (typeof input.remove !== "string") throw fail(400, "Invalid jam member");
        if (input.remove === user || input.remove === row.owner_id) throw fail(409, "Owner cannot be removed");
        if (!await db.get("SELECT user_id FROM jam_members WHERE room_id=? AND user_id=?", [id, input.remove])) throw fail(404, "Jam member not found");
      }
      await db.run("UPDATE jam_rooms SET guest_controls=?,locked=? WHERE id=?", [input.guestControls === undefined ? row.guest_controls : +!!input.guestControls, input.locked === undefined ? row.locked : +!!input.locked, id]);
      if (input.revokeInvites === true) await db.run("DELETE FROM jam_invites WHERE room_id=?", [id]);
      if (typeof input.remove === "string") {
        if (input.remove === user || input.remove === row.owner_id) throw fail(409, "Owner cannot be removed");
        await db.run("DELETE FROM jam_members WHERE room_id=? AND user_id=?", [id, input.remove]);
        const state = cleanSnapshot(JSON.parse(row.json)); await this.sync.applyJam(input.remove, { ...state, status: "paused" });
        if (row.host_id === input.remove) await this.publish(id, { ...state, status: "paused" }, null);
      }
    }); return this.view(user, id);
  }
  async claim(user: string, id: string) {
    await this.accounts.lock(`jam:${id}`, async () => {
      await this.membership(user, id); const row = await this.row(id); if (row.host_id && row.host_id !== user) throw fail(409, "Jam already has a host");
      await this.publish(id, { ...cleanSnapshot(JSON.parse(row.json)), status: "paused" }, user);
    }); return this.view(user, id);
  }
  async command(user: string, id: string, input: Record<string, unknown>) {
    await this.accounts.lock(`jam:${id}`, async () => {
      await this.membership(user, id); const row = await this.row(id);
      if (!row.host_id) throw fail(409, "Claim hosting before controlling the jam");
      if (input.version !== row.version) throw fail(409, "Jam changed; retry your action");
      const command = cleanCommand(input.action, input.args); const { action, args } = command;
      if (row.host_id !== user && !row.guest_controls && !["addToQueue", "playNext"].includes(action)) throw fail(403, "Only the host controls playback");
      const s = cleanSnapshot(JSON.parse(row.json)); s.position = this.position(s, row.updated_at);
      const reset = () => { s.position = 0; s.duration = s.queue[s.index]?.duration ?? 0; s.status = s.queue.length ? "playing" : "paused"; };
      if (action === "addToQueue") s.queue.push(args[0] as any);
      else if (action === "playNext") s.queue.splice(s.index + 1, 0, args[0] as any);
      else if (action === "playList") { s.queue = args[0] as any; s.index = (args[1] ?? 0) as number; s.original = null; s.shuffle = false; reset(); }
      else if (action === "playTrack") { s.queue = [args[0] as any]; s.index = 0; reset(); }
      else if (action === "startRadio") { const track = args[0] as any; s.queue = [track, ...(await radio(track.id, AbortSignal.timeout(20000))).slice(0, 499).map(sanitizeTrack)]; s.index = 0; reset(); }
      else if (action === "toggle") s.status = s.status === "playing" ? "paused" : s.queue.length ? "playing" : "paused";
      else if (action === "seek") s.position = Math.min(args[0] as number, s.duration || 604800);
      else if (action === "jumpTo") { if (!s.queue[args[0] as number]) throw fail(400, "Invalid queue position"); s.index = args[0] as number; reset(); }
      else if (action === "next") { if (s.index + 1 < s.queue.length) { s.index++; reset(); } else if (s.repeat === "all") { s.index = 0; reset(); } else { s.status = "paused"; s.position = s.duration; } }
      else if (action === "prev") { if (s.position > 3) s.position = 0; else { s.index = Math.max(0, s.index - 1); reset(); } }
      else if (action === "removeAt") { const at = args[0] as number; const removedCurrent = at === s.index; s.queue.splice(at, 1); if (at < s.index || s.index >= s.queue.length) s.index = Math.max(0, s.index - 1); if (removedCurrent) reset(); }
      else if (action === "clearUpcoming") s.queue = s.queue.slice(0, s.index + 1);
      else if (action === "cycleRepeat") { const modes = ["off", "all", "one"] as const; s.repeat = modes[(modes.indexOf(s.repeat) + 1) % 3]!; }
      else if (action === "toggleShuffle") {
        if (s.shuffle) { const current = s.queue[s.index]?.id; const byId = new Map(s.queue.map(t => [t.id, t])); s.queue = [...(s.original ?? []).map(t => byId.get(t.id)).filter(t => !!t), ...s.queue.filter(t => !s.original?.some(o => o.id === t.id))]; s.original = null; s.shuffle = false; s.index = Math.max(0, s.queue.findIndex(t => t.id === current)); }
        else { s.original = s.queue.slice(); const current = s.queue[s.index]; const rest = s.queue.filter((_, i) => i !== s.index); for (let i = rest.length - 1; i > 0; i--) { const j = randomBytes(4).readUInt32BE() % (i + 1); [rest[i], rest[j]] = [rest[j]!, rest[i]!]; } s.queue = current ? [current, ...rest] : rest; s.shuffle = true; s.index = 0; }
      } else if (action === "setAutoRadio") s.autoRadio = args[0] as boolean;
      await this.publish(id, cleanSnapshot(s));
    }); return this.view(user, id);
  }
  async output(user: string, id: string) {
    const view = await this.view(user, id);
    await this.sync.applyJam(user, { ...view.snapshot, position: this.position(view.snapshot, view.updatedAt) }); return view;
  }
  async observe(user: string, snapshot: PlaybackSnapshot) {
    if (this.sync.hasPendingJam(user)) return;
    const member = await this.accounts.db.get("SELECT room_id FROM jam_members WHERE user_id=?", [user]); if (!member) return;
    await this.accounts.lock(`jam:${member.room_id}`, async () => {
      const row = await this.accounts.db.get("SELECT * FROM jam_rooms WHERE id=? AND host_id=?", [member.room_id, user]); if (!row) return;
      const old = cleanSnapshot(JSON.parse(row.json));
      const structural = old.index !== snapshot.index || old.queue.map(t => t.id).join() !== snapshot.queue.map(t => t.id).join() || (snapshot.status === "paused" && old.status === "playing") || (snapshot.status === "playing" && old.status !== "playing");
      if (structural) await this.publish(row.id, snapshot, undefined, user);
      else if (this.accounts.now() - row.updated_at >= 5000) await this.accounts.db.run("UPDATE jam_rooms SET json=?,updated_at=? WHERE id=? AND host_id=?", [JSON.stringify({ ...snapshot, status: old.status }), this.accounts.now(), row.id, user]);
    });
  }
  async revokeUser(user: string, deleting: boolean) {
    const db = this.accounts.db;
    if (deleting) {
      const owned = await db.all("SELECT id,json FROM jam_rooms WHERE owner_id=?", [user]);
      for (const room of owned) { const state = cleanSnapshot(JSON.parse(room.json)); const members = await db.all("SELECT user_id FROM jam_members WHERE room_id=? AND user_id<>?", [room.id, user]); await Promise.all(members.map(m => this.sync.applyJam(m.user_id, { ...state, status: "paused" }))); }
    }
    const member = await db.get("SELECT room_id FROM jam_members WHERE user_id=?", [user]); if (member) { if (!deleting) await this.leave(user, member.room_id); else { const row = await this.row(member.room_id); if (row.host_id === user && row.owner_id !== user) await this.publish(row.id, { ...cleanSnapshot(JSON.parse(row.json)), status: "paused" }, null, user); } }
  }
}
