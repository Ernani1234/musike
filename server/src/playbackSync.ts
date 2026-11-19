import { randomUUID } from "node:crypto";
import type { Accounts } from "./accounts.js";
import { fail } from "./accounts.js";
import { sanitizeTrack } from "./library.js";
import type { Track } from "./types.js";

export interface PlaybackSnapshot {
  queue: Track[]; original: Track[] | null; index: number; position: number; duration: number;
  status: "idle" | "loading" | "playing" | "paused" | "error"; shuffle: boolean; repeat: "off" | "all" | "one"; autoRadio: boolean;
}
export interface PlaybackCommand { id: string; action: string; args: unknown[]; at: number; }
export interface SyncView {
  deviceId: string; active: string | null; epoch: number; revision: number; updatedAt: number; snapshot: PlaybackSnapshot;
  takeoverAvailable: boolean; devices: { id: string; name: string; online: boolean }[]; command: PlaybackCommand | null; transfer: string | null;
}
type Device = { id: string; session: string; name: string; seen: number; bucketAt: number; count: number; listeners: Set<(view: SyncView) => void> };
type Room = { active: string | null; epoch: number; revision: number; updatedAt: number; snapshot: PlaybackSnapshot;
  devices: Map<string, Device>; commands: PlaybackCommand[]; transfer: string | null; transferAt: number; seq: number; savedAt: number; };
const empty = (): PlaybackSnapshot => ({ queue: [], original: null, index: 0, position: 0, duration: 0, status: "idle", shuffle: false, repeat: "off", autoRadio: true });
const finite = (v: unknown, max: number) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
function tracks(value: unknown): Track[] {
  if (!Array.isArray(value) || value.length > 500) throw fail(400, "Invalid playback queue (maximum 500)");
  return value.map(sanitizeTrack);
}
export function cleanSnapshot(value: unknown): PlaybackSnapshot {
  const s = value as PlaybackSnapshot;
  if (!s || typeof s !== "object" || !finite(s.position, 604800) || !finite(s.duration, 604800) || !Number.isInteger(s.index) ||
    !["idle", "loading", "playing", "paused", "error"].includes(s.status) || !["off", "all", "one"].includes(s.repeat) ||
    typeof s.shuffle !== "boolean" || typeof s.autoRadio !== "boolean") throw fail(400, "Invalid playback state");
  const queue = tracks(s.queue); const original = s.original === null ? null : tracks(s.original);
  if (s.index < 0 || s.index >= Math.max(1, queue.length)) throw fail(400, "Invalid playback index");
  return { queue, original, index: s.index, position: s.position, duration: s.duration, status: s.status, shuffle: s.shuffle, repeat: s.repeat, autoRadio: s.autoRadio };
}
export function cleanCommand(action: unknown, args: unknown): { action: string; args: unknown[] } {
  if (typeof action !== "string" || !Array.isArray(args)) throw fail(400, "Invalid playback command");
  if (["toggle", "next", "prev", "clearUpcoming", "toggleShuffle", "cycleRepeat"].includes(action) && !args.length) return { action, args: [] };
  if (["playTrack", "playNext", "addToQueue", "startRadio"].includes(action) && args.length === 1) return { action, args: [sanitizeTrack(args[0])] };
  if (action === "playList" && args.length <= 2 && Array.isArray(args[0])) {
    const queue = tracks(args[0]); const index = args[1] ?? 0;
    if (!queue.length || !Number.isInteger(index) || (index as number) < 0 || (index as number) >= queue.length) throw fail(400, "Invalid playback index");
    return { action, args: [queue, index] };
  }
  if (["jumpTo", "removeAt"].includes(action) && args.length === 1 && Number.isInteger(args[0]) && finite(args[0], 499)) return { action, args };
  if (action === "seek" && args.length === 1 && finite(args[0], 604800)) return { action, args };
  if (action === "setAutoRadio" && args.length === 1 && typeof args[0] === "boolean") return { action, args };
  throw fail(400, "Invalid playback command");
}

/** One application process owns these bounded rooms. SQLite is accessed only via async worker RPC. */
export class PlaybackSync {
  private rooms = new Map<string, Room>();
  private stopped = false;
  onChange?: (user: string, snapshot: PlaybackSnapshot) => void;
  constructor(readonly accounts: Accounts, private now = Date.now) {}
  private live(d?: Device) { return !!d && this.now() - d.seen < 45000; }
  /** A stale output remains fenced until the user explicitly takes over. SSE writes prove no client activity. */
  private async reconcile(user: string, room: Room) {
    let changed = false;
    for (const [id, d] of room.devices) if (id !== room.active && this.now() - d.seen > 180000 && !d.listeners.size) { room.devices.delete(id); changed = true; }
    if (room.transfer && this.now() - room.transferAt > 30000) { room.transfer = null; changed = true; }
    if (changed) await this.changed(user, room, true);
  }
  private async room(user: string): Promise<Room> {
    let room = this.rooms.get(user); if (room) return room;
    for (const [owner, old] of this.rooms) {
      if (![...old.devices.values()].some((d) => d.listeners.size || this.now() - d.seen < 180000)) this.rooms.delete(owner);
    }
    if (this.stopped || this.rooms.size >= 128) throw fail(503, "Playback synchronization is busy");
    const row = await this.accounts.db.get("SELECT json FROM playback_state WHERE user_id=?", [user]);
    const saved = row ? JSON.parse(row.json) : null;
    room = { active: saved?.active ?? null, epoch: (saved?.epoch ?? 0) + 1, revision: saved?.revision ?? 0, updatedAt: this.now(),
      snapshot: saved ? { ...cleanSnapshot(saved.snapshot), status: "paused" } : empty(), devices: new Map(), commands: [], transfer: null, transferAt: 0, seq: 0, savedAt: 0 };
    this.rooms.set(user, room); return room;
  }
  private view(room: Room, id: string): SyncView {
    return { deviceId: id, active: room.active, epoch: room.epoch, revision: room.revision, updatedAt: room.updatedAt, snapshot: room.snapshot,
      takeoverAvailable: !!room.active && !this.live(room.devices.get(room.active)), devices: [...room.devices.values()].map((d) => ({ id: d.id, name: d.name, online: this.live(d) })),
      command: room.active === id && room.commands[0] && this.now() - room.commands[0].at < 15000 ? room.commands[0] : null, transfer: room.transfer };
  }
  private async save(user: string, room: Room) {
    await this.accounts.db.run("INSERT INTO playback_state(user_id,json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET json=excluded.json,updated_at=excluded.updated_at",
      [user, JSON.stringify({ active: room.active, epoch: room.epoch, revision: room.revision, snapshot: room.snapshot }), this.now()]);
    room.savedAt = this.now();
  }
  private async changed(user: string, room: Room, durable = true, notify = true) {
    room.revision++; room.updatedAt = this.now();
    if (durable || this.now() - room.savedAt >= 5000) await this.save(user, room);
    for (const d of room.devices.values()) for (const send of d.listeners) send(this.view(room, d.id));
    if (notify && room.active && this.now() - (room.devices.get(room.active)?.seen ?? 0) < 45000) this.onChange?.(user, room.snapshot);
  }
  async register(user: string, session: string, clientId: unknown, name: unknown) {
    if (typeof clientId !== "string" || !/^[\w-]{8,80}$/.test(clientId)) throw fail(400, "Invalid client identity");
    return this.accounts.lock(`playback:${user}`, async () => {
      const room = await this.room(user); await this.reconcile(user, room); const id = this.accounts.box.hash(`${user}:${clientId}`);
      for (const [key, d] of room.devices) if (key !== room.active && !d.listeners.size && this.now() - d.seen > 180000) room.devices.delete(key);
      let device = room.devices.get(id);
      if (!device) {
        if (room.devices.size >= 8) throw fail(429, "Too many playback devices");
        device = { id, session, name: typeof name === "string" ? name.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 40) || "Browser" : "Browser", seen: this.now(), bucketAt: this.now(), count: 0, listeners: new Set() };
        room.devices.set(id, device);
      }
      device.session = session; device.seen = this.now(); return this.view(room, id);
    });
  }
  async read(user: string, session: string, id: string, touch = true) {
    const room = this.rooms.get(user); const d = room?.devices.get(id);
    if (!room || !d || d.session !== session) throw fail(404, "Playback device not registered");
    if (touch) d.seen = this.now(); return this.view(room, id);
  }
  async subscribe(user: string, session: string, id: string, send: (view: SyncView) => void) {
    await this.read(user, session, id); const room = this.rooms.get(user)!; const device = room.devices.get(id)!;
    if (device.listeners.size >= 2) throw fail(429, "Too many playback connections");
    device.listeners.add(send); send(this.view(room, id)); return () => device.listeners.delete(send);
  }
  async act(user: string, session: string, id: string, input: Record<string, unknown>) {
    return this.accounts.lock(`playback:${user}`, async () => {
      await this.read(user, session, id); const room = this.rooms.get(user)!;
      const device = room.devices.get(id)!;
      await this.reconcile(user, room);
      if (this.now() - device.bucketAt >= 60000) { device.bucketAt = this.now(); device.count = 0; }
      if (++device.count > 120) throw fail(429, "Playback command rate limit reached");
      if (input.type === "ping") return this.view(room, id);
      if (input.type === "claim") {
        if (room.active && room.active !== id && !this.live(room.devices.get(room.active))) {
          if (input.takeover !== true) throw fail(409, "Previous output is unreachable. Use Take over playback.");
          room.active = id; room.snapshot = { ...room.snapshot, status: "paused" }; room.epoch++; room.seq = 0; room.commands = []; room.transfer = null;
          if (room.snapshot.queue.length) room.commands.push({ id: randomUUID(), action: "resume", args: [], at: this.now() });
          await this.changed(user, room); return this.view(room, id);
        }
        if (room.transfer && room.transfer !== id) throw fail(409, "Another playback transfer is pending");
        if (room.active && room.active !== id) {
          room.transfer = id; room.transferAt = this.now(); // The old device must actually pause and acknowledge before a grant.
        } else if (!room.active) {
          room.active = id; room.epoch++; room.seq = 0;
          if (room.snapshot.queue.length) room.commands.push({ id: randomUUID(), action: "resume", args: [], at: this.now() });
        }
        await this.changed(user, room); return this.view(room, id);
      }
      if (input.type === "snapshot") {
        if (room.active !== id || input.epoch !== room.epoch) throw fail(409, "Playback device no longer owns output");
        if (!Number.isSafeInteger(input.seq) || (input.seq as number) <= room.seq) throw fail(409, "Stale playback update");
        const snapshot = cleanSnapshot(input.release === true ? { ...room.snapshot, position: (input.snapshot as { position?: unknown })?.position, status: "paused" } : input.snapshot); room.seq = input.seq as number;
        const queueChanged = JSON.stringify(snapshot.queue) !== JSON.stringify(room.snapshot.queue);
        const statusChanged = snapshot.status !== room.snapshot.status;
        room.snapshot = snapshot;
        if (input.ack && room.commands[0]?.id === input.ack) room.commands.shift();
        if ((input.pausedForTransfer === true || input.release === true) && room.transfer && ["paused", "idle"].includes(snapshot.status)) {
          room.active = room.transfer; room.transfer = null; room.epoch++; room.seq = 0; room.commands = [];
          room.commands.push({ id: randomUUID(), action: "resume", args: [], at: this.now() });
        } else if (input.release === true && ["paused", "idle"].includes(snapshot.status)) {
          room.active = null; room.epoch++; room.seq = 0; room.commands = [];
        }
        await this.changed(user, room, queueChanged || statusChanged || input.pausedForTransfer === true || input.release === true || !!input.ack);
        return this.view(room, id);
      }
      if (input.type === "command") {
        const command = cleanCommand(input.action, input.args);
        if (room.transfer) throw fail(409, "Wait for playback transfer");
        if (room.active && this.now() - (room.devices.get(room.active)?.seen ?? 0) >= 45000) throw fail(409, "The active device is offline");
        room.commands = room.commands.filter((c) => this.now() - c.at < 15000);
        if (!room.active) { room.active = id; room.epoch++; room.seq = 0; }
        if (room.commands.length >= 20) throw fail(429, "Too many playback commands");
        room.commands.push({ ...command, id: randomUUID(), at: this.now() });
        await this.changed(user, room); return this.view(room, id);
      }
      throw fail(400, "Invalid synchronization action");
    });
  }
  hasPendingJam(user: string) { return this.rooms.get(user)?.commands.some(c => c.action === "jam" || c.action === "resume") ?? false; }
  async applyJam(user: string, snapshot: PlaybackSnapshot) {
    return this.accounts.lock(`playback:${user}`, async () => {
      const room = await this.room(user); room.snapshot = cleanSnapshot(snapshot);
      room.commands = room.active ? [{ id: randomUUID(), action: "jam", args: [room.snapshot], at: this.now() }] : [];
      await this.changed(user, room, true, false);
    });
  }
  current(user: string) {
    const room = this.rooms.get(user); if (!room) return null;
    const device = room.active ? room.devices.get(room.active) : null;
    return { outputOnline: this.live(device ?? undefined), track: room.snapshot.queue[room.snapshot.index] ?? null, status: this.live(device ?? undefined) ? room.snapshot.status : "paused", device: device?.name ?? null, online: [...room.devices.values()].some(d => this.live(d)) };
  }
  async dropUser(user: string) { this.rooms.delete(user); }
  async close() {
    this.stopped = true;
    for (const [user, room] of this.rooms) await this.accounts.lock(`playback:${user}`, () => this.save(user, room));
    this.rooms.clear();
  }
}
