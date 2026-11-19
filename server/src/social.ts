import { randomBytes, randomUUID } from "node:crypto";
import { fail, type Accounts } from "./accounts.js";
import { sanitizeTrack } from "./library.js";
import type { PlaybackSync } from "./playbackSync.js";
const text = (value: unknown, max = 80) => { if (typeof value !== "string" || !value.trim() || value.length > max) throw fail(400, "Invalid name"); return value.trim(); };
const permission = (value: unknown) => { if (!["viewer", "editor"].includes(value as string)) throw fail(400, "Invalid playlist permission"); return value as string; };
/** All social access is explicit. Phone numbers and private library contents never enter discovery responses. */
export class Social {
  constructor(readonly accounts: Accounts, private sync: PlaybackSync) {}
  private async friend(user: string, other: string) { const [a, b] = [user, other].sort(); return !!await this.accounts.db.get("SELECT a FROM friendships WHERE a=? AND b=?", [a!, b!]); }
  async state(user: string, offset = 0) {
    const db = this.accounts.db;
    await db.run("INSERT INTO friend_codes VALUES(?,?) ON CONFLICT(user_id) DO NOTHING", [user, randomBytes(12).toString("base64url")]);
    const [code, preferences, friends, requests, groups, owned, incoming] = await Promise.all([
      db.get("SELECT code FROM friend_codes WHERE user_id=?", [user]), db.get("SELECT show_online,show_track FROM social_preferences WHERE user_id=?", [user]),
      db.all("SELECT u.id,u.name,coalesce(p.show_online,0) AS show_online,coalesce(p.show_track,0) AS show_track FROM friendships f JOIN users u ON u.id=CASE WHEN f.a=? THEN f.b ELSE f.a END LEFT JOIN social_preferences p ON p.user_id=u.id WHERE (f.a=? OR f.b=?) AND u.status='approved' ORDER BY u.name,u.id LIMIT 200", [user, user, user]),
      db.all("SELECT r.sender,r.recipient,u.name FROM friend_requests r JOIN users u ON u.id=CASE WHEN r.sender=? THEN r.recipient ELSE r.sender END WHERE r.sender=? OR r.recipient=? ORDER BY r.created_at DESC LIMIT 100", [user, user, user]),
      db.all("SELECT g.id,g.owner_id,g.name FROM group_members m JOIN social_groups g ON g.id=m.group_id WHERE m.user_id=? ORDER BY g.name LIMIT 50", [user]),
      db.all("SELECT id,playlist_id FROM shared_playlists WHERE owner_id=? LIMIT 200", [user]),
      db.all("SELECT id FROM (SELECT s.id FROM playlist_grants p JOIN shared_playlists s ON s.id=p.share_id WHERE p.user_id=? AND s.owner_id<>? UNION SELECT s.id FROM group_members m JOIN playlist_group_grants g ON g.group_id=m.group_id JOIN shared_playlists s ON s.id=g.share_id WHERE m.user_id=? AND s.owner_id<>?) ORDER BY id LIMIT 201 OFFSET ?", [user, user, user, user, offset]),
    ]);
    const shares = [];
    for (const row of incoming.slice(0, 200)) { try { const view = await this.shared(user, row.id); shares.push({ id: row.id, name: view.playlist.name, owner: view.owner, permission: view.permission, tracks: view.playlist.tracks.length }); } catch { /* Revoked/deleted playlist. */ } }
    return { shareOffset: offset, hasMore: incoming.length > 200, code: code!.code as string, preferences: { online: !!preferences?.show_online, track: !!preferences?.show_track },
      friends: friends.map(f => { const current = this.sync.current(f.id); return { id: f.id as string, name: f.name as string, online: f.show_online ? !!current?.online : null, track: f.show_track && current?.online && current.status === "playing" ? current.track : null }; }),
      requests, groups, owned, shares };
  }
  async request(user: string, code: unknown) {
    if (typeof code !== "string" || code.length > 100) throw fail(400, "Invalid friend code");
    return this.accounts.lock("social", async () => {
      const db = this.accounts.db; const other = await db.get("SELECT u.id FROM friend_codes f JOIN users u ON u.id=f.user_id WHERE f.code=? AND u.status='approved'", [code]);
      if (!other || other.id === user) throw fail(404, "Friend code not found");
      if (await this.friend(user, other.id)) return { ok: true };
      const n = await db.get("SELECT count(*) AS n FROM friend_requests WHERE sender=? OR recipient=?", [user, user]);
      const otherCount = await db.get("SELECT count(*) AS n FROM friend_requests WHERE sender=? OR recipient=?", [other.id, other.id]);
      if (n!.n >= 100 || otherCount!.n >= 100) throw fail(429, "Too many friend requests");
      await db.run("INSERT INTO friend_requests VALUES(?,?,?) ON CONFLICT DO NOTHING", [user, other.id, this.accounts.now()]); return { ok: true };
    });
  }
  async respond(user: string, sender: string, accept: unknown) {
    if (typeof accept !== "boolean") throw fail(400, "Invalid friend response");
    return this.accounts.lock("social", async () => {
      const db = this.accounts.db;
      if (!await db.get("SELECT sender FROM friend_requests WHERE sender=? AND recipient=?", [sender, user])) throw fail(404, "Friend request not found");
      const [a, b] = [user, sender].sort();
      if (accept) for (const owner of [user, sender]) if ((await db.get("SELECT count(*) AS n FROM friendships WHERE a=? OR b=?", [owner, owner]))!.n >= 200) throw fail(409, "Friend limit reached");
      await db.batch([...(accept ? [{ sql: "INSERT INTO friendships VALUES(?,?) ON CONFLICT DO NOTHING", params: [a!, b!] }] : []),
        { sql: "DELETE FROM friend_requests WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)", params: [sender, user, user, sender] }]); return { ok: true };
    });
  }
  async removeFriend(user: string, other: string) {
    return this.accounts.lock("social", async () => {
    const [a, b] = [user, other].sort();
    await this.accounts.db.batch([
      { sql: "DELETE FROM friendships WHERE a=? AND b=?", params: [a!, b!] },
      { sql: "DELETE FROM friend_requests WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)", params: [user, other, other, user] },
      { sql: "DELETE FROM playlist_grants WHERE (user_id=? AND share_id IN (SELECT id FROM shared_playlists WHERE owner_id=?)) OR (user_id=? AND share_id IN (SELECT id FROM shared_playlists WHERE owner_id=?))", params: [user, other, other, user] },
      { sql: "DELETE FROM group_members WHERE (user_id=? AND group_id IN (SELECT id FROM social_groups WHERE owner_id=?)) OR (user_id=? AND group_id IN (SELECT id FROM social_groups WHERE owner_id=?))", params: [user, other, other, user] },
    ]); return { ok: true };
    });
  }
  async preferences(user: string, input: { online?: unknown; track?: unknown }) {
    if (typeof input.online !== "boolean" || typeof input.track !== "boolean") throw fail(400, "Invalid presence preferences");
    await this.accounts.db.run("INSERT INTO social_preferences VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET show_online=excluded.show_online,show_track=excluded.show_track", [user, +input.online, +input.track]); return { ok: true };
  }
  async group(user: string, id: string) {
    const db = this.accounts.db;
    const group = await db.get<{ id: string; owner_id: string; name: string }>("SELECT g.* FROM social_groups g JOIN group_members m ON m.group_id=g.id WHERE g.id=? AND m.user_id=?", [id, user]);
    if (!group) throw fail(404, "Group not found");
    const members = await db.all("SELECT u.id,u.name FROM group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY u.name LIMIT 200", [id]); return { ...group, members };
  }
  async createGroup(user: string, name: unknown) {
    const clean = text(name); const db = this.accounts.db;
    return this.accounts.lock("social", async () => {
      if ((await db.get("SELECT count(*) AS n FROM group_members WHERE user_id=?", [user]))!.n >= 50) throw fail(409, "Group limit reached");
      const id = randomUUID(); await db.batch([{ sql: "INSERT INTO social_groups VALUES(?,?,?)", params: [id, user, clean] }, { sql: "INSERT INTO group_members VALUES(?,?)", params: [id, user] }]); return { id };
    });
  }
  async editGroup(user: string, id: string, input: { name?: unknown; member?: unknown; remove?: unknown; delete?: unknown }) {
    return this.accounts.lock("social", async () => {
      const g = await this.group(user, id); const db = this.accounts.db;
      if (g.owner_id !== user) {
        if (input.member === user && input.remove === true) { await db.run("DELETE FROM group_members WHERE group_id=? AND user_id=?", [id, user]); return { ok: true }; }
        throw fail(403, "Only the group owner can edit membership");
      }
      if (input.delete === true) await db.run("DELETE FROM social_groups WHERE id=? AND owner_id=?", [id, user]);
      else if (input.name !== undefined) await db.run("UPDATE social_groups SET name=? WHERE id=? AND owner_id=?", [text(input.name), id, user]);
      else if (typeof input.member === "string" && input.member !== user) {
        if (input.remove === true) await db.run("DELETE FROM group_members WHERE group_id=? AND user_id=?", [id, input.member]);
        else {
          if (!await this.friend(user, input.member)) throw fail(403, "Group members must be accepted friends");
          if ((await db.get("SELECT count(*) AS n FROM group_members WHERE group_id=?", [id]))!.n >= 200 || (await db.get("SELECT count(*) AS n FROM group_members WHERE user_id=?", [input.member]))!.n >= 50) throw fail(409, "Group limit reached");
          await db.run("INSERT INTO group_members VALUES(?,?) ON CONFLICT DO NOTHING", [id, input.member]);
        }
      } else throw fail(400, "Invalid group change");
      return { ok: true };
    });
  }
  async share(user: string, input: { playlist?: unknown; user?: unknown; group?: unknown; permission?: unknown; revoke?: unknown }) {
    return this.accounts.lock("social", async () => {
      const library = await this.accounts.library(user).getLibrary(); const playlist = library.playlists.find(p => p.id === input.playlist);
      if (!playlist) throw fail(404, "Playlist not found");
      const db = this.accounts.db;
      if ((await db.get("SELECT count(*) AS n FROM shared_playlists WHERE owner_id=?", [user]))!.n >= 200 && !await db.get("SELECT id FROM shared_playlists WHERE owner_id=? AND playlist_id=?", [user, playlist.id])) throw fail(409, "Share limit reached");
      const id = randomUUID(); await db.run("INSERT INTO shared_playlists VALUES(?,?,?) ON CONFLICT(owner_id,playlist_id) DO NOTHING", [id, user, playlist.id]);
      const share = (await db.get("SELECT id FROM shared_playlists WHERE owner_id=? AND playlist_id=?", [user, playlist.id]))!;
      const role = permission(input.permission ?? "viewer");
      if (typeof input.user === "string" && !input.group) {
        if (!await this.friend(user, input.user) && input.revoke !== true) throw fail(403, "Share recipients must be accepted friends");
        if (input.revoke === true) await db.run("DELETE FROM playlist_grants WHERE share_id=? AND user_id=?", [share.id, input.user]);
        else await db.run("INSERT INTO playlist_grants VALUES(?,?,?) ON CONFLICT(share_id,user_id) DO UPDATE SET permission=excluded.permission", [share.id, input.user, role]);
      } else if (typeof input.group === "string" && !input.user) {
        if (!await db.get("SELECT id FROM social_groups WHERE id=? AND owner_id=?", [input.group, user])) throw fail(403, "Only your own groups may receive this share");
        if (input.revoke === true) await db.run("DELETE FROM playlist_group_grants WHERE share_id=? AND group_id=?", [share.id, input.group]);
        else await db.run("INSERT INTO playlist_group_grants VALUES(?,?,?) ON CONFLICT(share_id,group_id) DO UPDATE SET permission=excluded.permission", [share.id, input.group, role]);
      } else throw fail(400, "Select one friend or group");
      return { id: share.id as string };
    });
  }
  async shared(user: string, id: string) {
    const db = this.accounts.db; const share = await db.get("SELECT s.*,u.name FROM shared_playlists s JOIN users u ON u.id=s.owner_id WHERE s.id=? AND u.status='approved'", [id]);
    if (!share) throw fail(404, "Shared playlist not found");
    let role = share.owner_id === user ? "owner" : "";
    if (!role) {
      const grants = await db.all("SELECT permission FROM playlist_grants WHERE share_id=? AND user_id=? UNION ALL SELECT g.permission FROM playlist_group_grants g JOIN group_members m ON m.group_id=g.group_id WHERE g.share_id=? AND m.user_id=?", [id, user, id, user]);
      if (!grants.length) throw fail(404, "Shared playlist not found");
      role = grants.some(g => g.permission === "editor") ? "editor" : "viewer";
    }
    const playlist = (await this.accounts.library(share.owner_id).getLibrary()).playlists.find(p => p.id === share.playlist_id);
    if (!playlist) throw fail(404, "Shared playlist was removed");
    return { id, owner: { id: share.owner_id as string, name: share.name as string }, permission: role, playlist };
  }
  async editShared(user: string, id: string, input: { revision?: unknown; name?: unknown; tracks?: unknown }) {
    return this.accounts.lock("social", async () => {
      const view = await this.shared(user, id); if (view.permission === "viewer") throw fail(403, "Playlist is read only");
      if (typeof input.revision !== "number" || !Array.isArray(input.tracks) || input.tracks.length > 5000) throw fail(400, "Invalid playlist edit");
      const playlist = await this.accounts.library(view.owner.id).editPlaylist(view.playlist.id, input.revision, text(input.name), input.tracks.map(sanitizeTrack)); return { ...view, playlist };
    });
  }
  async copy(user: string, id: string) { const view = await this.shared(user, id); const library = this.accounts.library(user); if ((await library.getLibrary()).playlists.length >= 1000) throw fail(409, "Playlist limit reached"); return library.createPlaylist(view.playlist.name, view.playlist.tracks.map(t => ({ ...t }))); }
  async deleteShare(user: string, id: string) { await this.accounts.db.run("DELETE FROM shared_playlists WHERE id=? AND owner_id=?", [id, user]); return { ok: true }; }
}
