import type { Playlist, Track } from "./types";

export const BUDGETS = [512, 1024, 2048] as const;
export const MIB = 1024 * 1024;
export const MAX_AUDIO = 64 * MIB;
export interface OfflineSettings { owner: string; enabled: boolean; budget: number; eligible: boolean; name: string; }
export interface AudioEntry { owner: string; id: string; track: Track; bytes: number; played: number; }
export interface OfflinePin { owner: string; id: string; playlist: Playlist; pending: Playlist | null; error: string; }
export interface OfflineSummary { settings: OfflineSettings; entries: AudioEntry[]; pins: OfflinePin[]; bytes: number; }
const defaults = (owner: string): OfflineSettings => ({ owner, enabled: false, budget: 1024 * MIB, eligible: false, name: "" });
const request = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new Error("Storage transaction aborted")); tx.onerror = () => {}; });
let opening: Promise<IDBDatabase> | undefined;
function db() {
  return opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Offline storage unavailable")); return; }
    const r = indexedDB.open("musike-offline", 1);
    r.onupgradeneeded = () => {
      for (const name of ["audio", "blobs", "pins"]) {
        const s = r.result.createObjectStore(name, { keyPath: ["owner", "id"] });
        s.createIndex("owner", "owner");
        if (name === "audio") s.createIndex("recent", ["owner", "played"]);
      }
      r.result.createObjectStore("settings", { keyPath: "owner" });
    };
    r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); opening = undefined; }; resolve(r.result); };
    r.onerror = () => { opening = undefined; reject(r.error); };
    r.onblocked = () => { opening = undefined; reject(new Error("Close other Musike tabs to update storage")); };
  });
}
async function transaction<T>(names: string[], mode: IDBTransactionMode, run: (tx: IDBTransaction) => Promise<T>) {
  const tx = (await db()).transaction(names, mode); const complete = done(tx);
  try { const value = await run(tx); await complete; return value; }
  catch (error) { try { tx.abort(); } catch {} await complete.catch(() => {}); throw error; }
}
async function rows<T>(tx: IDBTransaction, store: string, owner: string): Promise<T[]> {
  return request(tx.objectStore(store).index("owner").getAll(IDBKeyRange.only(owner)));
}
export async function offlineSummary(owner: string): Promise<OfflineSummary> {
  return transaction(["settings", "audio", "pins"], "readonly", async tx => {
    const [settings, entries, pins] = await Promise.all([
      request<OfflineSettings | undefined>(tx.objectStore("settings").get(owner)), rows<AudioEntry>(tx, "audio", owner), rows<OfflinePin>(tx, "pins", owner),
    ]);
    return { settings: settings ?? defaults(owner), entries: entries.sort((a, b) => b.played - a.played), pins, bytes: entries.reduce((n, e) => n + e.bytes, 0) };
  });
}
export async function offlineSettings(owner: string, patch: Partial<Omit<OfflineSettings, "owner">> = {}) {
  return transaction(["settings"], "readwrite", async tx => {
    const store = tx.objectStore("settings"); const previous: OfflineSettings = await request(store.get(owner)) ?? defaults(owner);
    const next = { ...previous, ...patch, owner };
    if (!BUDGETS.some(n => n * MIB === next.budget)) throw new Error("Invalid storage budget");
    store.put(next); return next;
  });
}
export async function readOfflineAudio(owner: string, id: string): Promise<Blob | null> {
  return transaction(["blobs"], "readonly", async tx => (await request(tx.objectStore("blobs").get([owner, id])))?.blob ?? null);
}
/** Only complete audio is committed. Budget decisions and eviction share the write transaction across tabs. */
export async function saveOfflineAudio(owner: string, track: Track, blob: Blob, played = 0) {
  if (!blob.size || blob.size > MAX_AUDIO || !/^audio\//i.test(blob.type)) throw new Error("Invalid audio download");
  return transaction(["audio", "blobs", "pins", "settings"], "readwrite", async tx => {
    const [settings, entries, pins] = await Promise.all([
      request<OfflineSettings | undefined>(tx.objectStore("settings").get(owner)), rows<AudioEntry>(tx, "audio", owner), rows<OfflinePin>(tx, "pins", owner),
    ]);
    if (!settings?.enabled) return false;
    const protectedIds = new Set(pins.flatMap(p => [...p.playlist.tracks, ...(p.pending?.tracks ?? [])].map(t => t.id)));
    protectedIds.add(track.id);
    const previous = entries.find(e => e.id === track.id);
    let bytes = entries.reduce((n, e) => n + e.bytes, 0) - (previous?.bytes ?? 0) + blob.size;
    let count = entries.length + (previous ? 0 : 1);
    for (const entry of entries.sort((a, b) => a.played - b.played)) {
      if (bytes <= settings.budget && count <= 2000) break;
      if (protectedIds.has(entry.id)) continue;
      tx.objectStore("audio").delete([owner, entry.id]); tx.objectStore("blobs").delete([owner, entry.id]); bytes -= entry.bytes; count--;
    }
    if (bytes > settings.budget || count > 2000) throw new Error("budget");
    tx.objectStore("audio").put({ owner, id: track.id, track, bytes: blob.size, played: Math.max(played, previous?.played ?? 0) } satisfies AudioEntry);
    tx.objectStore("blobs").put({ owner, id: track.id, blob }); return true;
  });
}
export async function touchOfflineAudio(owner: string, id: string) {
  return transaction(["audio"], "readwrite", async tx => { const s = tx.objectStore("audio"); const row = await request<AudioEntry | undefined>(s.get([owner, id])); if (row) s.put({ ...row, played: Date.now() }); });
}
export async function writeOfflinePin(pin: OfflinePin) {
  if (pin.playlist.tracks.length > 5000 || (pin.pending?.tracks.length ?? 0) > 5000) throw new Error("limit");
  return transaction(["pins"], "readwrite", async tx => {
    const pins = await rows<OfflinePin>(tx, "pins", pin.owner);
    if (!pins.some(p => p.id === pin.id) && pins.length >= 100) throw new Error("limit");
    tx.objectStore("pins").put(pin);
  });
}
export async function removeOfflinePin(owner: string, id: string) {
  return transaction(["pins"], "readwrite", async tx => { tx.objectStore("pins").delete([owner, id]); });
}
/** Lowering a budget never removes pins. Unpinned recents are trimmed oldest first. */
export async function trimOfflineAudio(owner: string, clearRecents = false) {
  return transaction(["settings", "audio", "blobs", "pins"], "readwrite", async tx => {
    const [settings, entries, pins] = await Promise.all([request<OfflineSettings | undefined>(tx.objectStore("settings").get(owner)), rows<AudioEntry>(tx, "audio", owner), rows<OfflinePin>(tx, "pins", owner)]);
    const protectedIds = new Set(pins.flatMap(p => [...p.playlist.tracks, ...(p.pending?.tracks ?? [])].map(t => t.id)));
    let bytes = entries.reduce((n, e) => n + e.bytes, 0);
    for (const entry of entries.sort((a, b) => a.played - b.played)) {
      if (!clearRecents && bytes <= (settings?.budget ?? 0)) break;
      if (protectedIds.has(entry.id)) continue;
      tx.objectStore("audio").delete([owner, entry.id]); tx.objectStore("blobs").delete([owner, entry.id]); bytes -= entry.bytes;
    }
  });
}
export async function purgeOfflineOwner(owner: string) {
  return transaction(["settings", "audio", "blobs", "pins"], "readwrite", async tx => {
    for (const name of ["audio", "blobs", "pins"]) {
      const keys = await request(tx.objectStore(name).index("owner").getAllKeys(IDBKeyRange.only(owner)));
      for (const key of keys) tx.objectStore(name).delete(key);
    }
    tx.objectStore("settings").delete(owner);
  });
}
