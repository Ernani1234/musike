import { api } from "./api";
import type { Backup } from "./backup";
import type { Playlist, Track } from "./types";

/**
 * Spotify import: reads the CSV files Exportify (exportify.net) saves — one per playlist, or all of them in a zip —
 * finds every song on YouTube Music with the regular search, and turns the result into a Musike backup,
 * so it goes through the same merge import as any other backup.
 */

export const EXPORTIFY_URL = "https://exportify.net";

export interface SpotifySong {
  title: string;
  artist: string;
  album: string;
  /** Seconds. */
  duration: number;
}

export interface SpotifyExport {
  /** Every distinct song, keyed by its Spotify URI (or title + artist when a row has none). */
  songs: Map<string, SpotifySong>;
  /** In file order. `liked` marks Spotify's "Liked Songs", which becomes Musike's Favorites. */
  playlists: { name: string; keys: string[]; liked: boolean }[];
}

export class SpotifyFileError extends Error {
  constructor(public reason: "unreadable" | "noCsv" | "notExportify") {
    super(reason);
  }
}

/** RFC 4180 CSV: quoted fields, doubled quotes, line breaks inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') (field += '"'), i++;
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim()));
}

/** The files inside a zip (stored or deflated), read with the browser's own DecompressionStream: no library needed. */
export async function unzip(data: ArrayBuffer): Promise<{ name: string; text: () => Promise<string> }[]> {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);
  // End of central directory: the last 0x06054b50 signature (a comment of up to 64 KB may follow it).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SpotifyFileError("unreadable");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const utf8 = new TextDecoder();
  const files: { name: string; text: () => Promise<string> }[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new SpotifyFileError("unreadable");
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/") || (method !== 0 && method !== 8)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.slice(start, start + size);
    files.push({
      name,
      text: async () => {
        if (method === 0) return utf8.decode(raw);
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Response(stream).text();
      },
    });
  }
  return files;
}

const baseName = (path: string) => path.split(/[\\/]/).pop()!.replace(/\.csv$/i, "");

/** Reads Exportify CSVs, picked one by one or zipped (Exportify's "Export All" saves a zip). */
export async function readSpotifyFiles(picked: File[]): Promise<SpotifyExport> {
  const csvs: { name: string; text: () => Promise<string> }[] = [];
  for (const file of picked) {
    if (/\.zip$/i.test(file.name)) {
      const inside = await unzip(await file.arrayBuffer()).catch(() => {
        throw new SpotifyFileError("unreadable");
      });
      csvs.push(...inside.filter((f) => /\.csv$/i.test(f.name) && !/(^|\/)__MACOSX\//.test(f.name)));
    } else if (/\.csv$/i.test(file.name)) csvs.push({ name: file.name, text: () => file.text() });
  }
  if (!csvs.length) throw new SpotifyFileError("noCsv");

  const songs = new Map<string, SpotifySong>();
  const playlists: SpotifyExport["playlists"] = [];
  for (const csv of csvs.sort((a, b) => a.name.localeCompare(b.name))) {
    let text: string;
    try {
      text = await csv.text();
    } catch {
      throw new SpotifyFileError("unreadable");
    }
    const [header, ...rows] = parseCsv(text);
    const col = (name: string) => header?.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase()) ?? -1;
    const [uri, title, artist, album, ms] = [col("Track URI"), col("Track Name"), col("Artist Name(s)"), col("Album Name"), col("Duration (ms)")];
    if (title < 0) continue; // not an Exportify CSV
    const keys = new Set<string>();
    for (const r of rows) {
      const song: SpotifySong = {
        title: r[title]?.trim() ?? "",
        artist: (r[artist] ?? "").split(";").map((a) => a.trim()).filter(Boolean).join(", "),
        album: r[album]?.trim() ?? "",
        duration: Math.round(Number(r[ms]) / 1000) || 0,
      };
      if (!song.title) continue;
      const key = r[uri]?.trim() || `${song.title}|${song.artist}`.toLowerCase();
      if (!songs.has(key)) songs.set(key, song);
      keys.add(key);
    }
    const name = baseName(csv.name).replace(/_/g, " ").trim();
    playlists.push({ name, keys: [...keys], liked: /^liked songs$/i.test(name) });
  }
  if (!playlists.length) throw new SpotifyFileError("notExportify");
  return { songs, playlists };
}

/** Artists are stored "A, B" (Exportify writes "A;B"). The first one is the main artist. */
const mainArtist = (artist: string) => artist.split(",")[0].trim();

/** One automatic retry: with thousands of searches in a row, YouTube now and then fails one. */
async function searchSongs(query: string): Promise<Track[]> {
  try {
    return await api.search(query, "song");
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    return api.search(query, "song");
  }
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\(.*?\)|\[.*?\]| - .*$/g, " ") // "(feat. x)", "[Live]", "- Remastered 2011"
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const RED_FLAGS = ["cover", "karaoke", "instrumental", "remix", "live", "sped up", "slowed", "nightcore", "8d"];

/** How well a search result matches a Spotify song: title, main artist and length, minus covers and remixes. */
export function scoreMatch(candidate: Track, song: SpotifySong): number {
  const [t, ct, ca] = [norm(song.title), norm(candidate.title), norm(candidate.artist)];
  let score = 0;
  if (ct === t) score += 3;
  else if (t && ct && (ct.includes(t) || t.includes(ct))) score += 1.5;
  const first = norm(mainArtist(song.artist));
  const words = new Set(ca.split(" "));
  if (first && ca.includes(first)) score += 3;
  else if (norm(song.artist).split(" ").some((w) => w && words.has(w))) score += 1;
  if (song.duration && candidate.duration) {
    const diff = Math.abs(candidate.duration - song.duration);
    score += diff <= 3 ? 2 : diff <= 10 ? 1 : diff > 30 ? -1 : 0;
  }
  const lower = candidate.title.toLowerCase();
  const asked = song.title.toLowerCase();
  for (const flag of RED_FLAGS) if (lower.includes(flag) && !asked.includes(flag)) score -= 2;
  return score;
}

/** A sure match stops early; below `MIN_SCORE` the song counts as not found rather than risk a wrong one. */
const SURE_SCORE = 6;
const MIN_SCORE = 3.5;

/** The best YouTube Music match for a song, or null when nothing is close enough. Throws when the search itself fails. */
export async function matchSong(song: SpotifySong): Promise<Track | null> {
  const artist = mainArtist(song.artist);
  let best: { score: number; track: Track } | null = null;
  for (const query of [`${song.title} ${artist}`, `${song.title} ${artist} ${song.album}`]) {
    for (const track of (await searchSongs(query.trim())).slice(0, 8)) {
      const score = scoreMatch(track, song);
      if (!best || score > best.score) best = { score, track };
    }
    if (best && best.score >= SURE_SCORE) break;
  }
  return best && best.score >= MIN_SCORE ? best.track : null;
}

/** The server keeps up to this many tracks per playlist (and in Favorites): longer lists are split into parts. */
const MAX_TRACKS = 5000;

/** The matched songs as a Musike backup: one playlist per CSV, "Liked Songs" as Favorites. */
export function toBackup(data: SpotifyExport, matches: Map<string, Track | null>, untitled: (n: number) => string): Backup {
  const now = Date.now();
  let favorites: Track[] = [];
  const playlists: Playlist[] = [];
  data.playlists.forEach((p, i) => {
    const seen = new Set<string>();
    let tracks = p.keys.map((k) => matches.get(k)).filter((t): t is Track => !!t && !seen.has(t.id) && !!seen.add(t.id));
    // Exportify replaces some characters in file names; a name with no letters left gets a numbered one.
    const name = /[\p{L}\p{N}]/u.test(p.name) ? p.name.slice(0, 72) : untitled(i + 1);
    if (p.liked) {
      favorites = tracks.slice(0, MAX_TRACKS);
      tracks = tracks.slice(MAX_TRACKS); // what doesn't fit in Favorites goes to "Liked Songs (2)", "(3)"…
    }
    for (let start = 0, part = p.liked ? 2 : 1; start < tracks.length; start += MAX_TRACKS, part++) {
      const partName = part === 1 ? name : `${name} (${part})`;
      playlists.push({ id: crypto.randomUUID(), name: partName, createdAt: now, updatedAt: now, tracks: tracks.slice(start, start + MAX_TRACKS) });
    }
  });
  return {
    format: "musike-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    app: "Spotify (Exportify)",
    library: { favorites, playlists, history: [] },
  };
}
