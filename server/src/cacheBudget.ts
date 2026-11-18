import { readdir, stat, rm } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

const leases = new Map<string, number>();
const windows = new Map<string, { at: number; ids: string[] }>();
const reservations = new Map<string, number>();
let chain: Promise<unknown> = Promise.resolve();
const locked = <T>(work: () => Promise<T>): Promise<T> => {
  const job = chain.then(work); chain = job.catch(() => {}); return job;
};
/** Serialize publication with budget scans so a rename cannot disappear between readdir and stat. */
export const mutateCache = locked;
/** Streams acquire leases through the eviction lock before checking/opening the path. */
export const acquireFileLease = (file: string) => locked(async () => leaseFile(file));
export function needWindow(client: string, ids: string[]) {
  if (!windows.has(client) && windows.size >= 64) windows.delete(windows.keys().next().value!);
  windows.set(client, { at: Date.now(), ids });
}
export function releaseWindow(client: string) { windows.delete(client); }
function rank(id: string): number {
  let rank = Infinity;
  for (const [client, window] of windows) {
    if (Date.now() - window.at > 90_000) { windows.delete(client); continue; }
    const i = window.ids.indexOf(id);
    if (i >= 0) rank = Math.min(rank, i);
  }
  return rank;
}
export function leaseFile(file: string): () => void {
  leases.set(file, (leases.get(file) ?? 0) + 1);
  let done = false;
  return () => { if (done) return; done = true; const count = (leases.get(file) ?? 1) - 1;
    if (count) leases.set(file, count); else leases.delete(file); };
}
export async function cacheFiles() {
  let names: string[];
  try { names = (await readdir(config.cacheDir)).filter((name) => /^[A-Za-z0-9_-]{11}\.(?:audio\.|720\.|[0-9a-f-]{36}\.part$)/.test(name)); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
  const files: { file: string; size: number; used: number; id: string; media: boolean }[] = [];
  for (let i = 0; i < names.length; i += 8) {
    const batch = await Promise.all(names.slice(i, i + 8).map(async (name) => {
      const file = path.join(config.cacheDir, name);
      try { const info = await stat(file); return info.isFile() ? { file, size: info.size, used: info.mtimeMs,
        id: name.slice(0, 11), media: /\.(?:720\.mp4|audio\.bin)$/.test(name) } : null; }
      catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
    }));
    files.push(...batch.filter((f): f is NonNullable<typeof f> => !!f));
  }
  return files;
}
async function makeSpace(bytes: number, requester: string) {
  const files = await cacheFiles();
  let used = files.reduce((n, f) => n + f.size, 0) + [...reservations.values()].reduce((n, size) => n + size, 0);
  const threshold = requester ? rank(requester) : 0;
  const candidates = files.filter((f) => f.media && f.id !== requester && !leases.has(f.file) && (rank(f.id) === Infinity || rank(f.id) > threshold))
    .sort((a, b) => (rank(b.id) === rank(a.id) ? a.used - b.used : rank(a.id) < rank(b.id) ? 1 : -1));
  for (const f of candidates) {
    if (used + bytes <= config.cacheMaxBytes) break;
    if (leases.has(f.file) || rank(f.id) === 0) continue;
    await rm(f.file, { force: true });
    if (f.file.endsWith(".audio.bin")) await rm(f.file.replace(/\.bin$/, ".json"), { force: true });
    used -= f.size;
  }
  return used + bytes <= config.cacheMaxBytes;
}
export const reserveBytes = (key: string, bytes: number, id: string) => locked(async () => {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || !await makeSpace(bytes, id)) return false;
  reservations.set(key, (reservations.get(key) ?? 0) + bytes); return true;
});
/** Disk bytes replace their reserved amount as chunks are written. */
export const releaseBytes = (key: string) => locked(async () => { reservations.delete(key); });
export const consumeBytes = (key: string, bytes: number) => locked(async () => {
  const next = Math.max(0, (reservations.get(key) ?? 0) - bytes);
  if (next) reservations.set(key, next); else reservations.delete(key);
});
export const trimCache = () => locked(async () => { await makeSpace(0, ""); });
export async function cacheUsage() {
  const files = await cacheFiles();
  return { bytes: files.reduce((n, f) => n + f.size, 0), budget: config.cacheMaxBytes, files: files.filter((f) => f.media).length };
}
