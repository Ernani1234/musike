/**
 * Lyrics for the track being played, timed or plain, from LRCLIB (https://lrclib.net): a community database
 * that is free, needs no key and allows this kind of use, as long as every client identifies itself.
 *
 * This module is plain fetch + string handling on purpose: the Android build imports it directly
 * (see web/src/native/api.ts) and runs it on the phone, so it must not reach for Node.
 */

export interface LyricLine {
  /** Seconds into the track where the line starts. 0 for every line when the lyrics aren't synced. */
  time: number;
  text: string;
}

export interface Lyrics {
  /** True when each line carries its own time, so the app can highlight the line being sung. */
  synced: boolean;
  /** No singing by design (a jam, a classical piece): say so instead of "not found". */
  instrumental: boolean;
  lines: LyricLine[];
  /** The recording the lyrics were timed against, when the source knows it. */
  sourceDuration: number | null;
  source: string;
}

export interface LyricsRequest {
  /** The track's YouTube id: the same video always gets the same lyrics, so it's the cache key. */
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
}

const ENDPOINT = "https://lrclib.net/api";
/** LRCLIB asks every client to identify itself: https://lrclib.net/docs */
const USER_AGENT = "Musike/1.5.1 (https://github.com/Ernani1234/musike)";
const TIMEOUT_MS = 7000;
const CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 400;
const MAX_LINES = 600;
const MAX_LINE = 400;

interface Hit {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string | null;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

/** [mm:ss.xx], [mm:ss.xxx] and the rare [hh:mm:ss.xx] stamps LRC files use. */
const STAMP = /\[((?:\d{1,3}:)?\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?\]/g;
/** Enhanced LRC times each word: those inline stamps are dropped, the line keeps its own time. */
const WORD_STAMP = /<\d{1,3}:[0-5]?\d(?:[.:]\d{1,3})?>/g;

/** The timed lines of an LRC file, in order. Lines without a stamp (the [ar:], [ti:] header) are skipped. */
export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(STAMP)];
    if (!stamps.length) continue;
    const body = raw.replace(STAMP, "").replace(WORD_STAMP, "").trim();
    if (!body) continue;
    for (const stamp of stamps) {
      // The first group is "mm", or "hh:mm" in files that time with hours.
      const [first, second] = stamp[1].split(":").map(Number);
      const seconds = (second === undefined ? first : first * 60 + second) * 60 + Number(stamp[2]);
      const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0;
      lines.push({ time: seconds + fraction, text: body.slice(0, MAX_LINE) });
    }
    if (lines.length >= MAX_LINES) break;
  }
  lines.sort((a, b) => a.time - b.time);
  // Duplicated stamps are common in hand-made files; identical rows at the same second add nothing.
  return lines.filter((line, i) => !i || line.time !== lines[i - 1].time || line.text !== lines[i - 1].text);
}

/** Plain lyrics as lines: what the app shows when there is no timing to follow. */
function plainLines(text: string): LyricLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES)
    .map((text) => ({ time: 0, text: text.slice(0, MAX_LINE) }));
}

function toLyrics(hit: Hit): Lyrics | null {
  const sourceDuration = typeof hit.duration === "number" && hit.duration > 0 ? hit.duration : null;
  const synced = hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : [];
  if (synced.length > 1) {
    return { synced: true, instrumental: false, lines: synced, sourceDuration, source: "LRCLIB" };
  }
  if (hit.instrumental) return { synced: false, instrumental: true, lines: [], sourceDuration, source: "LRCLIB" };
  const plain = hit.plainLyrics ? plainLines(hit.plainLyrics) : [];
  if (plain.length) return { synced: false, instrumental: false, lines: plain, sourceDuration, source: "LRCLIB" };
  return null;
}

const qs = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
};

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${ENDPOINT}${path}`, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // A 404 is LRCLIB's "no lyrics for this one", not a failure.
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** "(Official Music Video)", "(Remastered 2011)", "(Lyrics)"… none of it is part of the song's name. */
const NOISE =
  /[([][^)\]]*(?:official|lyric(?:s|video)?|audio|video|visuali[sz]er|remaster(?:ed)?|hd|hq|4k|8k|explicit|clean|music video|mv|m\/v|performance|clip)[^)\]]*[)\]]/gi;

function stripNoise(title: string): string {
  return title
    .replace(NOISE, " ")
    .replace(/[([]\s*(?:feat|ft)\.?[^)\]]*[)\]]/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 200);
}

/** YouTube videos often carry "Artist - Song" in the title; LRCLIB knows the song by its own name. */
function titleVariants(title: string): string[] {
  const base = stripNoise(title) || title.trim().slice(0, 200);
  const variants = new Set<string>([base]);
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length > 1) variants.add(parts.slice(1).join(" - ").trim());
  return [...variants].filter(Boolean).slice(0, 3);
}

function cleanArtist(artist: string): string {
  return artist
    .split(",")[0]
    .replace(/\s*-\s*topic$/i, "")
    .replace(/vevo$/i, "")
    .trim()
    .slice(0, 200);
}

/** The best of several LRCLIB hits: timed lyrics first, then the recording closest in length. */
function pick(hits: Hit[], duration: number): Lyrics | null {
  const ranked = hits
    .map((hit) => ({ hit, lyrics: toLyrics(hit) }))
    .filter((entry): entry is { hit: Hit; lyrics: Lyrics } => entry.lyrics !== null);
  if (!ranked.length) return null;
  const distance = (hit: Hit) => (duration > 20 && hit.duration ? Math.abs(hit.duration - duration) : 0);
  ranked.sort((a, b) => Number(b.lyrics.synced) - Number(a.lyrics.synced) || distance(a.hit) - distance(b.hit));
  const best = ranked[0];
  // A different recording means the timing would drift: rather say nothing than highlight the wrong line.
  if (best.lyrics.synced && duration > 20 && best.hit.duration && Math.abs(best.hit.duration - duration) > 15) {
    return null;
  }
  return best.lyrics;
}

async function lookup(request: LyricsRequest): Promise<Lyrics | null> {
  const artist = cleanArtist(request.artist ?? "");
  const duration = request.duration && request.duration > 0 ? Math.round(request.duration) : 0;
  for (const track_name of titleVariants(request.title)) {
    const exact = await getJson<Hit>(`/get?${qs({ artist_name: artist || undefined, track_name, duration: duration || undefined })}`);
    const exactLyrics = exact ? toLyrics(exact) : null;
    if (exactLyrics?.synced) return exactLyrics;
    // The exact lookup only accepts one recording; the search finds the same song timed for another edition.
    const hits = await getJson<Hit[]>(`/search?${qs({ track_name, artist_name: artist || undefined })}`);
    const found = pick(hits ?? [], duration);
    if (found) return found;
    if (exactLyrics) return exactLyrics;
  }
  return null;
}

interface Cached {
  at: number;
  lyrics: Lyrics | null;
}

const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<Lyrics | null>>();

/** Lyrics for a track, from the 24 h cache or LRCLIB; null when there are none. Never throws. */
export function lyricsFor(request: LyricsRequest): Promise<Lyrics | null> {
  const cached = cache.get(request.id);
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.lyrics);
  const running = inflight.get(request.id);
  if (running) return running;

  const job = lookup(request)
    .catch(() => null)
    .then((lyrics) => {
      cache.set(request.id, { at: Date.now(), lyrics });
      if (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      return lyrics;
    })
    .finally(() => inflight.delete(request.id));
  inflight.set(request.id, job);
  return job;
}
