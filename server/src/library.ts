import { msg } from "./i18n.js";
import { ARTIST_ID, HttpError, VIDEO_ID, type Library, type Playlist, type Track } from "./types.js";

// No Node-only imports here: the Android app runs this same module, with its own storage.

const HISTORY_LIMIT = 60;

/** Where the library is kept: a file on the server and the desktop app, app storage on Android. */
export interface LibraryStorage {
  read(): Promise<string | null>;
  write(json: string): Promise<void>;
}

let storage: LibraryStorage | null = null;
let state: Library | null = null;
let writeChain: Promise<void> = Promise.resolve();

/** Set once at startup, before any request. */
export function useLibraryStorage(s: LibraryStorage) {
  storage = s;
  state = null;
}

const randomUUID = () => globalThis.crypto.randomUUID();

async function load(): Promise<Library> {
  if (state) return state;
  if (!storage) throw new Error("Library storage not configured");
  const json = await storage.read();
  state = json ? (JSON.parse(json) as Library) : { favorites: [], playlists: [], history: [] };
  return state;
}

/** Serialized writes so concurrent requests never interleave. */
function persist(): Promise<void> {
  const snapshot = JSON.stringify(state, null, 2);
  writeChain = writeChain.then(() => storage!.write(snapshot));
  return writeChain;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function sanitizeTrack(input: unknown): Track {
  const t = (input ?? {}) as Record<string, unknown>;
  const id = str(t.id, 11);
  if (!VIDEO_ID.test(id)) throw new HttpError(400, msg("invalidTrack"));
  const url = (v: unknown) => {
    const s = str(v, 500);
    return /^https:\/\//.test(s) ? s : "";
  };
  return {
    id,
    title: str(t.title, 300) || "Untitled",
    artist: str(t.artist, 300),
    album: str(t.album, 300) || undefined,
    artistId: ARTIST_ID.test(str(t.artistId, 30)) ? str(t.artistId, 30) : undefined,
    duration: typeof t.duration === "number" && Number.isFinite(t.duration) ? Math.max(0, Math.round(t.duration)) : 0,
    thumb: url(t.thumb),
    art: url(t.art),
    kind: t.kind === "video" ? "video" : "song",
  };
}

function findPlaylist(lib: Library, pid: string): Playlist {
  const p = lib.playlists.find((x) => x.id === pid);
  if (!p) throw new HttpError(404, msg("playlistNotFound"));
  return p;
}

export async function getLibrary(): Promise<Library> {
  return load();
}

export async function addFavorite(track: Track): Promise<Track[]> {
  const lib = await load();
  lib.favorites = [track, ...lib.favorites.filter((t) => t.id !== track.id)];
  await persist();
  return lib.favorites;
}

/** Adds many at once (in the given order, on top), skipping ones already there. */
export async function addFavorites(tracks: Track[]): Promise<Track[]> {
  const lib = await load();
  const seen = new Set(lib.favorites.map((t) => t.id));
  const added = tracks.filter((t) => !seen.has(t.id) && !!seen.add(t.id));
  lib.favorites = [...added, ...lib.favorites];
  await persist();
  return lib.favorites;
}

export async function removeFavorite(id: string): Promise<Track[]> {
  const lib = await load();
  lib.favorites = lib.favorites.filter((t) => t.id !== id);
  await persist();
  return lib.favorites;
}

export async function pushHistory(track: Track): Promise<Track[]> {
  const lib = await load();
  lib.history = [track, ...lib.history.filter((t) => t.id !== track.id)].slice(0, HISTORY_LIMIT);
  await persist();
  return lib.history;
}

export async function createPlaylist(name: string, tracks: Track[] = []): Promise<Playlist> {
  const lib = await load();
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new HttpError(400, msg("playlistNameRequired"));
  const now = Date.now();
  const playlist: Playlist = { id: randomUUID(), name: clean, createdAt: now, updatedAt: now, tracks };
  lib.playlists.unshift(playlist);
  await persist();
  return playlist;
}

export async function renamePlaylist(pid: string, name: string): Promise<Playlist> {
  const lib = await load();
  const p = findPlaylist(lib, pid);
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new HttpError(400, msg("playlistNameRequired"));
  p.name = clean;
  p.updatedAt = Date.now();
  await persist();
  return p;
}

export async function deletePlaylist(pid: string): Promise<void> {
  const lib = await load();
  findPlaylist(lib, pid);
  lib.playlists = lib.playlists.filter((p) => p.id !== pid);
  await persist();
}

export async function addToPlaylist(pid: string, tracks: Track | Track[]): Promise<Playlist> {
  const lib = await load();
  const p = findPlaylist(lib, pid);
  for (const track of Array.isArray(tracks) ? tracks : [tracks]) {
    if (!p.tracks.some((t) => t.id === track.id)) p.tracks.push(track);
  }
  p.updatedAt = Date.now();
  await persist();
  return p;
}

export async function removeFromPlaylist(pid: string, trackId: string): Promise<Playlist> {
  const lib = await load();
  const p = findPlaylist(lib, pid);
  p.tracks = p.tracks.filter((t) => t.id !== trackId);
  p.updatedAt = Date.now();
  await persist();
  return p;
}

// Backup import: a library exported from any Musike instance (web, desktop, another computer).

const MAX_PLAYLISTS = 1000;
const MAX_TRACKS = 5000;

/** Keeps the valid tracks of an untrusted list, without duplicates. */
function cleanTracks(input: unknown, limit = MAX_TRACKS): Track[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const raw of input.slice(0, limit * 2)) {
    try {
      const t = sanitizeTrack(raw);
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
      if (out.length >= limit) break;
    } catch {
      // skip invalid entries instead of rejecting the whole backup
    }
  }
  return out;
}

function cleanLibrary(input: unknown): Library {
  const lib = (input ?? {}) as Record<string, unknown>;
  const playlists = (Array.isArray(lib.playlists) ? lib.playlists : []).slice(0, MAX_PLAYLISTS).flatMap((raw): Playlist[] => {
    const p = (raw ?? {}) as Record<string, unknown>;
    const name = str(p.name, 80).trim();
    if (!name) return [];
    const now = Date.now();
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : now);
    const id = str(p.id, 64);
    return [{ id: /^[\w-]{8,64}$/.test(id) ? id : randomUUID(), name, createdAt: num(p.createdAt), updatedAt: num(p.updatedAt), tracks: cleanTracks(p.tracks) }];
  });
  return { favorites: cleanTracks(lib.favorites), playlists, history: cleanTracks(lib.history, HISTORY_LIMIT) };
}

export interface ImportResult {
  playlistsAdded: number;
  playlistsMerged: number;
  tracksAdded: number;
  favoritesAdded: number;
}

/**
 * "merge" adds what is missing and never deletes (playlists match by id, then by name).
 * "replace" swaps the whole library for the backup's.
 */
export async function importLibrary(input: unknown, mode: "merge" | "replace"): Promise<ImportResult> {
  const incoming = cleanLibrary(input);
  const lib = await load();
  const result: ImportResult = { playlistsAdded: 0, playlistsMerged: 0, tracksAdded: 0, favoritesAdded: 0 };

  if (mode === "replace") {
    state = incoming;
    result.playlistsAdded = incoming.playlists.length;
    result.favoritesAdded = incoming.favorites.length;
    result.tracksAdded = incoming.playlists.reduce((n, p) => n + p.tracks.length, 0);
    await persist();
    return result;
  }

  const union = (mine: Track[], theirs: Track[]) => {
    const have = new Set(mine.map((t) => t.id));
    const added = theirs.filter((t) => !have.has(t.id));
    return { list: [...mine, ...added], added: added.length };
  };

  const fav = union(lib.favorites, incoming.favorites);
  lib.favorites = fav.list;
  result.favoritesAdded = fav.added;

  for (const p of incoming.playlists) {
    const match =
      lib.playlists.find((x) => x.id === p.id) ??
      lib.playlists.find((x) => x.name.toLocaleLowerCase("pt-BR") === p.name.toLocaleLowerCase("pt-BR"));
    if (match) {
      const merged = union(match.tracks, p.tracks);
      if (!merged.added) continue; // already had every track: nothing changed
      match.tracks = merged.list.slice(0, MAX_TRACKS);
      match.updatedAt = Date.now();
      result.tracksAdded += merged.added;
      result.playlistsMerged++;
    } else {
      lib.playlists.push(p);
      result.tracksAdded += p.tracks.length;
      result.playlistsAdded++;
    }
  }

  lib.history = union(lib.history, incoming.history).list.slice(0, HISTORY_LIMIT);
  await persist();
  return result;
}
