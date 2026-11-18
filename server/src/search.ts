import { Innertube } from "youtubei.js";
import { cached } from "./cache.js";
import { config } from "./config.js";
import { msg, youtubeLang, type Lang } from "./i18n.js";
import type { Track } from "./types.js";
import { HttpError, VIDEO_ID } from "./types.js";
import { ytdlpSearch } from "./ytdlp.js";

// One session per language: YouTube Music words its own texts (genre names, artist bios) in the session's language.
const clients = new Map<string, Promise<Innertube>>();

function yt(hl: string): Promise<Innertube> {
  let client = clients.get(hl);
  if (!client) {
    client = Innertube.create({ retrieve_player: false, lang: hl, location: config.location, fetch: config.fetch }).catch((err) => {
      clients.delete(hl);
      throw err;
    });
    clients.set(hl, client);
  }
  return client;
}

/**
 * Runs `fn` with a YouTube Music session in `lang` (the server default when the caller has none).
 * Retries once with a fresh session, since sessions can go stale.
 */
export async function withClient<T>(fn: (yt: Innertube) => Promise<T>, lang?: Lang): Promise<T> {
  const hl = lang ? youtubeLang(lang) : config.lang;
  try {
    return await fn(await yt(hl));
  } catch {
    clients.delete(hl);
    return fn(await yt(hl));
  }
}

export function sized(url: string | undefined, px: number): string {
  if (!url) return "";
  // googleusercontent / ggpht thumbnails encode their size after "="
  if (/googleusercontent\.com|ggpht\.com/.test(url)) return url.replace(/=w\d+-h\d+[^&]*$/, `=w${px}-h${px}-l90-rj`);
  return url;
}

function videoThumbs(id: string) {
  // mqdefault and hq720 are true 16:9 (hqdefault is letterboxed 4:3). The web app falls back to mqdefault if hq720 is missing.
  return { thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, art: `https://i.ytimg.com/vi/${id}/hq720.jpg` };
}

export const text = (v: unknown): string => (v == null ? "" : typeof v === "string" ? v : String((v as { toString(): string }).toString()));

// youtubei.js node shapes differ between item types, so read them defensively.
export function toTrack(item: any, kind: Track["kind"]): Track | null {
  const id: string | undefined = item.id ?? item.video_id;
  if (!id || !VIDEO_ID.test(id)) return null;
  const artists: string[] = (item.artists ?? item.authors ?? []).map((a: { name: string }) => a.name).filter(Boolean);
  const artist = artists.join(", ") || text(item.author?.name) || "";
  const thumbs = item.thumbnail?.contents ?? item.thumbnail ?? item.thumbnails ?? [];
  const best = Array.isArray(thumbs) ? thumbs[0]?.url : undefined;
  const isSquare = typeof best === "string" && /googleusercontent\.com|ggpht\.com/.test(best);
  const images = isSquare ? { thumb: sized(best, 120), art: sized(best, 544) } : videoThumbs(id);
  return {
    id,
    title: text(item.title) || text(item.name),
    artist,
    album: item.album?.name || undefined,
    duration: item.duration?.seconds ?? 0,
    ...images,
    kind: isSquare ? kind : "video",
  };
}

/** Tracks from every shelf of a search response, not just the first (a "did you mean" block can come first). */
function tracksFrom(result: { contents?: unknown }, kind: Track["kind"]): Track[] {
  const seen = new Set<string>();
  const tracks: Track[] = [];
  const sections = Array.isArray(result.contents) ? (result.contents as { contents?: unknown }[]) : [];
  for (const section of sections) {
    for (const item of Array.isArray(section?.contents) ? section.contents : []) {
      const track = toTrack(item, kind);
      if (track && !seen.has(track.id)) {
        seen.add(track.id);
        tracks.push(track);
      }
    }
  }
  return tracks;
}

/** Short enough for an error message: "HTTP 403" rather than the whole request URL. */
function reason(e: unknown): string {
  const message = (e as Error)?.message || String(e);
  const status = /status code (\d{3})/.exec(message)?.[1];
  return status ? `HTTP ${status}` : message.slice(0, 80);
}

/**
 * YouTube Music first; then plain YouTube search (another endpoint, videos only), which also covers the Android app,
 * where there is no yt-dlp; then yt-dlp on a computer.
 */
export async function search(query: string, type: "song" | "video", lang?: Lang): Promise<Track[]> {
  const failures: string[] = [];
  try {
    const tracks = tracksFrom(await withClient((yt) => yt.music.search(query, { type }), lang), type);
    if (tracks.length) return tracks;
    failures.push("YouTube Music: no results");
  } catch (e) {
    failures.push(`YouTube Music: ${reason(e)}`);
  }
  try {
    const result = await withClient((yt) => yt.search(query, { type: "video" }), lang);
    const tracks = (result.videos ?? []).map((v) => toTrack(v, "video")).filter((t): t is Track => !!t);
    if (tracks.length) return tracks;
    failures.push("YouTube: no results");
  } catch (e) {
    failures.push(`YouTube: ${reason(e)}`);
  }
  let entries: Awaited<ReturnType<typeof ytdlpSearch>>;
  try {
    entries = await ytdlpSearch(query);
  } catch (err) {
    // yt-dlp's own problem (missing, outdated) is what to fix on a computer. On a phone there is no yt-dlp, so say
    // what YouTube answered: that's what a bug report needs.
    if (err instanceof HttpError) throw err;
    throw new HttpError(503, msg("searchFailed", { detail: failures.join("; ") }));
  }
  return entries
    .filter((e) => VIDEO_ID.test(e.id))
    .map((e) => ({
      id: e.id,
      title: e.title,
      artist: e.channel ?? e.uploader ?? "",
      duration: e.duration ?? 0,
      ...videoThumbs(e.id),
      kind: "video" as const,
    }));
}

export async function suggestions(query: string, lang?: Lang): Promise<string[]> {
  const sections = await withClient((yt) => yt.music.getSearchSuggestions(query), lang);
  const first = sections[0] as { contents?: { suggestion?: unknown }[] } | undefined;
  return (first?.contents ?? [])
    .map((s) => text(s.suggestion))
    .filter(Boolean)
    .slice(0, 8);
}

/** Lowercase, accent-free words. Keeps everything, for spotting "(ao vivo)", "(clipe oficial)" etc. */
const flat = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Like `flat`, minus parentheticals, for comparing titles ("Trevo (Tu) (part. X)" → "trevo"). */
const norm = (s: string) => flat(s.replace(/\(.*?\)|\[.*?\]/g, " "));

const NOT_THE_CLIP =
  /\b(cover|karaoke|nightcore|8d|slowed|reverb|sped up|lyrics?|letra|traducao|legendado|tutorial|reaction|ao vivo|live|version|versao|remix|mashup|parody|parodia|instrumental|metal)\b/;
const OFFICIAL_CLIP = /\b(official (music )?video|clipe oficial|videoclipe|music video|video oficial)\b/;
// Parentheticals that don't change which recording it is.
const NEUTRAL_EXTRA = /official|oficial|video|clipe|audio|visualizer|part|feat|ft|with|com|hd|4k|remaster/;

const compact = (s: string) => flat(s).replace(/ /g, "");

/** The uploader is the artist's own channel (also "<Artist>VEVO", "<Artist> Oficial"), not a fan or cover channel. */
function isArtistChannel(channel: string, artist: string): boolean {
  const want = compact(artist);
  if (!want) return false;
  return channel.split(",").some((c) => {
    const have = compact(c);
    return have === want || [want + "vevo", want + "oficial", want + "official", want + "tv", want + "music"].includes(have);
  });
}

const videoForCache = cached(6 * 3600_000, async (key): Promise<Track | null> => {
  const [title, artist, duration] = JSON.parse(key) as [string, string, number];
  let found = pickClip(await videoSearch(`${title} ${artist}`), title, artist, duration);
  found ??= pickClip(await videoSearch(`${artist.split(",")[0]} ${title} clipe`), title, artist, duration);
  return found;
});

/**
 * Finds the music video for a song (YouTube Music "art tracks" are audio with a still cover).
 * Scores video search results by artist, title, duration and red flags like covers or live versions.
 */
export async function findVideoFor(_id: string, title: string, artist: string, duration: number): Promise<Track | null> {
  return videoForCache(JSON.stringify([title, artist, duration]));
}

async function videoSearch(query: string): Promise<Track[]> {
  return tracksFrom(await withClient((yt) => yt.music.search(query, { type: "video" })), "video");
}

function pickClip(candidates: Track[], title: string, artist: string, duration: number): Track | null {
  const wantTitle = norm(title);
  const mainArtist = artist.split(",")[0] ?? "";
  const songWords = flat(title);
  const songRedFlags = NOT_THE_CLIP.test(songWords);

  let best: { track: Track; score: number } | null = null;
  for (const c of candidates.slice(0, 10)) {
    // Must be the artist's own upload of this song; anything else risks covers and fan re-uploads.
    if (!isArtistChannel(c.artist, mainArtist)) continue;
    const bare = norm(c.title);
    if (!wantTitle || !bare.includes(wantTitle)) continue;

    const words = flat(c.title);
    let score = 0;
    // "Artist - Title (Official Video)" reduced to just the title is the cleanest match.
    if (bare.replace(norm(mainArtist), "").trim() === wantTitle) score += 2;
    if (duration && c.duration) {
      const diff = Math.abs(c.duration - duration);
      score += diff <= 10 ? 3 : diff <= 30 ? 1 : diff > 90 ? -2 : 0;
    }
    if (!songRedFlags && NOT_THE_CLIP.test(words)) score -= 3;
    if (OFFICIAL_CLIP.test(words)) score += 3;
    // An "audio" upload is a still image; acceptable, but a real clip wins.
    if (/\baudio\b/.test(words)) score -= 1;
    for (const extra of c.title.match(/\((.*?)\)|\[(.*?)\]/g) ?? []) {
      const e = flat(extra);
      if (!NEUTRAL_EXTRA.test(e) && !songWords.includes(e)) score -= 2;
    }
    if (!best || score > best.score) best = { track: c, score };
  }

  // Better to say "no clip" than to play the wrong one.
  return best?.track ?? null;
}

/** YouTube Music "radio" for a track: related songs to continue playback. */
export async function radio(id: string): Promise<Track[]> {
  const panel = await withClient((yt) => yt.music.getUpNext(id, true));
  return (panel.contents ?? [])
    .map((i) => toTrack(i, "song"))
    .filter((t): t is Track => !!t && t.id !== id);
}
