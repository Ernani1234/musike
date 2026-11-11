import type { Track } from "./types";

// Lyrics come from LRCLIB (https://lrclib.net), a free and open lyrics database. Its API is
// CORS-enabled for direct browser calls, so one implementation serves every build: the web app,
// the desktop shell and the mobile apps, which have no Musike server to proxy through.
// API docs: https://lrclib.net/docs — identify the app, honor Retry-After, cache per session.

const LRCLIB = "https://lrclib.net";
const CLIENT = { "Lrclib-Client": "Musike (https://github.com/Ernani1234/musike)" };

export interface LyricsWord {
  text: string;
  time: number;
}

export interface LyricsLine {
  time: number;
  text: string;
  /** Word-level timings when the source carries them (`<mm:ss.xx>` tags), else null. */
  words: LyricsWord[] | null;
}

export interface Lyrics {
  trackId: string;
  /** Line-synced lyrics, or null when the song has no synced text. */
  lines: LyricsLine[] | null;
  /** Unsynced text, shown as a plain scroll when there are no line timings. */
  plain: string | null;
  instrumental: boolean;
}

interface LrcLibRecord {
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  duration?: number;
}

// A timestamp like [01:23] or [01:23.45] (some files use a colon for the fraction).
const STAMP = /\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
// Word tags inside a line, as in `<00:17.00> Hold <00:17.31> the <00:17.52> line`.
const WORD_TAG = /<(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)>/g;

const toSeconds = (minutes: string, seconds: string) => Number(minutes) * 60 + Number(seconds.replace(":", "."));

/** Parses LRC text into lines, carrying word timings along when the file has them. */
export function parseLrc(text: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    STAMP.lastIndex = 0;
    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = STAMP.exec(raw))) stamps.push(toSeconds(match[1], match[2]));
    if (!stamps.length) continue;

    let body = raw.replace(STAMP, "").trim();
    let words: LyricsWord[] | null = null;
    WORD_TAG.lastIndex = 0;
    if (WORD_TAG.test(body)) {
      WORD_TAG.lastIndex = 0;
      const parts = body.split(WORD_TAG); // [text, m, s, text, m, s, …]
      const found: LyricsWord[] = [];
      for (let i = 1; i + 2 < parts.length; i += 3) {
        const word = parts[i + 2].trim();
        if (word) found.push({ text: word, time: toSeconds(parts[i], parts[i + 1]) });
      }
      if (found.length > 1) {
        words = found;
        body = body.replace(WORD_TAG, "").replace(/\s+/g, " ").trim();
      }
    }
    for (const time of stamps) lines.push({ time, text: body, words });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/**
 * YouTube titles carry packaging the lyric database doesn't know: "(Official Video)",
 * "[Lyrics]", remaster years, guest tags. Matching works best without them.
 */
function cleanTitle(title: string): string {
  return title
    .replace(/[([{（【][^)\]}）】]*?(official|video|audio|lyric|mv|hd|4k|visualizer|performance|remaster|explicit)[^)\]}）】]*?[)\]}）】]/gi, " ")
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Auto-generated YouTube Music channels surface as "Artist - Topic"; the suffix breaks matching. */
function cleanArtist(artist: string): string {
  return artist.replace(/\s*-\s*topic$/i, "").trim();
}

// Session cache: one lookup per song, negatives too, so reopening the panel is instant and the
// free API is never asked twice for the same answer.
const cache = new Map<string, Lyrics>();

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(path, { headers: CLIENT, signal });
  if (res.status === 429) {
    // The docs ask for it explicitly: wait out the Retry-After instead of retrying into a ban.
    const after = Number(res.headers.get("Retry-After")) || 15;
    throw new Error(`rate_limited:${after}`);
  }
  if (!res.ok) throw Object.assign(new Error(`lrclib_${res.status}`), { status: res.status });
  return res.json();
}

function recordToLyrics(track: Track, record: LrcLibRecord): Lyrics {
  const synced = typeof record.syncedLyrics === "string" && record.syncedLyrics.trim() ? parseLrc(record.syncedLyrics) : null;
  const plain = typeof record.plainLyrics === "string" && record.plainLyrics.trim() ? record.plainLyrics : null;
  return {
    trackId: track.id,
    lines: synced && synced.length ? synced : null,
    plain: synced ? null : plain,
    instrumental: record.instrumental === true || (!synced && !plain),
  };
}

/** The closest duration wins among synced candidates; any synced record beats a plain one. */
function bestRecord(track: Track, records: LrcLibRecord[]): LrcLibRecord | null {
  if (!records.length) return null;
  const score = (r: LrcLibRecord) => {
    const synced = typeof r.syncedLyrics === "string" && r.syncedLyrics.trim() ? 0 : r.plainLyrics ? 10 : 20;
    const drift = r.duration && track.duration ? Math.abs(r.duration - track.duration) : 5;
    return synced + Math.min(drift, 15);
  };
  return records.reduce((best, r) => (score(r) < score(best) ? r : best));
}

/** Fetches lyrics for a track: exact match first (album + duration), then a search fallback. */
export async function fetchLyrics(track: Track, signal?: AbortSignal): Promise<Lyrics> {
  const cached = cache.get(track.id);
  if (cached) return cached;

  const params = new URLSearchParams({ track_name: cleanTitle(track.title), artist_name: cleanArtist(track.artist) });
  if (track.album) params.set("album_name", track.album);
  if (track.duration >= 1 && track.duration <= 3600) params.set("duration", String(Math.round(track.duration)));

  let record: LrcLibRecord | null = null;
  try {
    record = (await getJson(`${LRCLIB}/api/get?${params}`, signal)) as LrcLibRecord;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    if ((err as { status?: number }).status !== 404) throw err;
    // No exact match: a search over title + artist usually still finds the song.
    const results = (await getJson(`${LRCLIB}/api/search?${params}`, signal)) as LrcLibRecord[];
    record = bestRecord(track, Array.isArray(results) ? results : []);
  }

  const lyrics = record
    ? recordToLyrics(track, record)
    : { trackId: track.id, lines: null, plain: null, instrumental: false };
  cache.set(track.id, lyrics);
  return lyrics;
}

/** The line playing at time t: the last one whose timestamp has passed. */
export function lineAt(lines: LyricsLine[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
