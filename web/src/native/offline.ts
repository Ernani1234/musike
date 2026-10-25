import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import type { OfflineApi, OfflineEntry } from "../lib/apiTypes";
import type { Track } from "../lib/types";
import { resolveAudio } from "./streams";

/**
 * Tracks saved on the phone.
 *
 * The audio of a saved track lives in the app's private storage (Directory.Data), which survives app updates and
 * needs no permission; the player reads it back through the WebView's local server, so seeking works exactly as it
 * does with a network stream. `index.json` lists what is saved, so a fresh start knows what to offer offline.
 */

const DIR = "offline";
const INDEX = `${DIR}/index.json`;
const where = { directory: Directory.Data } as const;
/** The client googlevideo expects; a bare HttpURLConnection request is refused. */
const UA =
  "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";

/** Everything saved, once read. Also the URL each track plays from, which the player asks for before every load. */
let entries: Record<string, OfflineEntry> | null = null;
let reading: Promise<Record<string, OfflineEntry>> | null = null;
const localSrc = new Map<string, string>();

/** Downloads report their progress by URL; the save in flight listens through this. */
const watchers = new Map<string, (fraction: number) => void>();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  void Filesystem.addListener("progress", ({ url, bytes, contentLength }) => {
    const report = watchers.get(url);
    if (report) report(contentLength > 0 ? Math.min(1, bytes / contentLength) : 0);
  });
}

const name = (id: string, mime: string) => `${DIR}/${id}.${mime.includes("mp4") ? "m4a" : "webm"}`;

/** The folder has to exist before a download or a write lands in it; Capacitor does not create it. */
const ensureDir = () => Filesystem.mkdir({ path: DIR, ...where, recursive: true }).catch(() => {});

/**
 * A saved file's address. Android plays it back through the web view's local server; iOS plays the file directly
 * (its player is AVPlayer, which reads a file URL but cannot go through a web view scheme).
 */
function url(file: string): Promise<string> {
  return Filesystem.getUri({ path: file, ...where }).then(({ uri }) =>
    Capacitor.getPlatform() === "ios" ? uri : Capacitor.convertFileSrc(uri),
  );
}

async function read(): Promise<Record<string, OfflineEntry>> {
  try {
    const { data } = await Filesystem.readFile({ path: INDEX, ...where, encoding: Encoding.UTF8 });
    const parsed: unknown = JSON.parse(typeof data === "string" ? data : await data.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, OfflineEntry>;
  } catch {
    // No index yet: nothing was ever saved (or the app data was cleared, which takes the audio with it).
    return {};
  }
}

async function write(record: Record<string, OfflineEntry>) {
  await ensureDir();
  const tmp = `${INDEX}.tmp`;
  await Filesystem.writeFile({ path: tmp, data: JSON.stringify(record), ...where, encoding: Encoding.UTF8 });
  await Filesystem.deleteFile({ path: INDEX, ...where }).catch(() => {});
  await Filesystem.rename({ from: tmp, to: INDEX, ...where, toDirectory: Directory.Data });
}

function load(): Promise<Record<string, OfflineEntry>> {
  if (entries) return Promise.resolve(entries);
  reading ??= read()
    .then(async (record) => {
      // Addresses are only known once the files exist on this device.
      await Promise.all(
        Object.entries(record).map(([id, e]) =>
          url(e.file)
            .then((src) => localSrc.set(id, src))
            .catch(() => {}),
        ),
      );
      entries = record;
      return record;
    })
    .finally(() => {
      reading = null;
    });
  return reading;
}

/** Forgets a track's cached address (its file is gone or was replaced). */
function forget(id: string) {
  localSrc.delete(id);
}

export const offline: OfflineApi = {
  supported: true,

  load,

  entry: async (id) => (await load())[id] ?? null,

  async save(track: Track, onProgress: (fraction: number) => void): Promise<OfflineEntry> {
    listen();
    const known = await load();
    await ensureDir();
    const resolved = await resolveAudio(track.id);
    const file = name(track.id, resolved.mime);
    // Downloading over an older copy: start clean, so a failed retry can't leave two halves on disk.
    if (known[track.id]) await Filesystem.deleteFile({ path: known[track.id]!.file, ...where }).catch(() => {});

    watchers.set(resolved.url, onProgress);
    try {
      await Filesystem.downloadFile({
        url: resolved.url,
        path: file,
        ...where,
        progress: true,
        // The same client the WebView is: googlevideo serves streams to it, and to nothing else.
        headers: { "User-Agent": UA },
      });
    } catch (e) {
      await Filesystem.deleteFile({ path: file, ...where }).catch(() => {});
      throw e;
    } finally {
      watchers.delete(resolved.url);
    }

    const { size } = await Filesystem.stat({ path: file, ...where });
    const src = await url(file);
    localSrc.set(track.id, src);
    const entry: OfflineEntry = { track, size: Number(size) || 0, at: Date.now(), file };
    const record = { ...known, [track.id]: entry };
    entries = record;
    await write(record);
    return entry;
  },

  async remove(id: string) {
    const record = { ...(await load()) };
    const entry = record[id];
    if (!entry) return;
    await Filesystem.deleteFile({ path: entry.file, ...where }).catch(() => {});
    forget(id);
    delete record[id];
    entries = record;
    await write(record);
  },

  async clear() {
    const record = await load();
    await Promise.all(Object.values(record).map((e) => Filesystem.deleteFile({ path: e.file, ...where }).catch(() => {})));
    localSrc.clear();
    entries = {};
    await Filesystem.deleteFile({ path: INDEX, ...where }).catch(() => {});
  },

  src: async (id) => {
    await load();
    return localSrc.get(id) ?? null;
  },
};
