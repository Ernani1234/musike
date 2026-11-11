import type { Innertube } from "youtubei.js";
import { isLang, msg, type Lang } from "./i18n.js";
import { sized, text, toTrack, withClient } from "./search.js";
import type { Track } from "./types.js";
import { HttpError, VIDEO_ID } from "./types.js";

export interface Genre {
  /** YouTube Music's opaque "params" for the genre page. */
  id: string;
  name: string;
}

export interface GenreArtist {
  id: string;
  name: string;
  /** Cover of one of their releases in this genre (artist photos would cost a request each). */
  thumb: string;
  art: string;
  /** A few of their songs in this genre, to recognize them by. */
  hits: string[];
}

export interface GenrePage {
  id: string;
  name: string;
  /** The first page of artists; more come from `genreArtists`. */
  artists: GenreArtist[];
  hasMoreArtists: boolean;
  tracks: Track[];
}

/** An album or single as a cover in a list (artist page, search). */
export interface AlbumCard {
  id: string;
  title: string;
  /** Empty on an artist's own page, where it goes without saying. */
  artist: string;
  year: string;
  thumb: string;
  art: string;
}

export interface ArtistPage {
  id: string;
  name: string;
  description: string;
  banner: string;
  tracks: Track[];
  albums: AlbumCard[];
  singles: AlbumCard[];
}

export interface AlbumPage {
  id: string;
  title: string;
  artist: string;
  artistId: string | null;
  /** YouTube Music's own lines, in the request's language: "Album • 1991", "13 songs • 49 minutes". */
  kind: string;
  info: string;
  thumb: string;
  art: string;
  tracks: Track[];
}

export const ALBUM_ID = /^MPRE[\w-]{6,60}$/;

export const GENRE_ID = /^[\w-]{8,120}={0,2}$/;
export const ARTIST_ID = /^UC[\w-]{22}$/;

const MINUTE = 60_000;
const ARTISTS_PAGE = 40;
/** Enough for anyone browsing; stops reading playlists after that. */
const MAX_ARTISTS = 600;
const PLAYLISTS_PER_ROUND = 4;
const MAX_GENRE_TRACKS = 150;
const MAX_HITS = 50;

/** Time-boxed memo: these pages change slowly, and going back and forth between them should be instant. */
function cached<T>(ttl: number, load: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const memo = new Map<string, { at: number; value: Promise<T> }>();
  return (key) => {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    if (memo.size > 200) memo.delete(memo.keys().next().value!);
    const value = load(key);
    memo.set(key, { at: Date.now(), value });
    // Failures are not cached, so the next visit tries again.
    value.catch(() => memo.get(key)?.value === value && memo.delete(key));
    return value;
  };
}

// youtubei.js has no typed helper for the genre pages, so these responses are read defensively.
const browse = (yt: Innertube, payload: Record<string, unknown>): Promise<any> =>
  yt.actions.execute("/browse", { ...payload, client: "YTMUSIC", parse: true });

function shelvesOf(page: any): any[] {
  const root = typeof page?.contents?.item === "function" ? page.contents.item() : page?.contents;
  return root?.tabs?.[0]?.content?.contents ?? [];
}

const itemsOf = (shelf: any): any[] => shelf?.contents ?? shelf?.items ?? [];

function imagesOf(item: any): { thumb: string; art: string } {
  const thumbs = item?.thumbnail?.contents ?? item?.thumbnail ?? item?.thumbnails ?? [];
  const url: string | undefined = Array.isArray(thumbs) ? thumbs[0]?.url : undefined;
  return { thumb: sized(url, 240), art: sized(url, 544) };
}

/** Same song twice (another upload, a playlist repeat) only shows once. */
function uniqueTracks(tracks: (Track | null)[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((t): t is Track => {
    if (!t) return false;
    const key = `${t.title}|${t.artist}`.toLocaleLowerCase("pt-BR");
    if (seen.has(t.id) || seen.has(key)) return false;
    seen.add(t.id);
    seen.add(key);
    return true;
  });
}

/** [[a1, a2], [b1]] → [a1, b1, a2] */
function roundRobin<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]!);
  return out;
}

/** "Céu Azul (Ao Vivo)" → "Céu Azul": enough to recognize the song in a short preview. */
const bareTitle = (title: string) => title.replace(/\s*[([].*?[)\]]/g, "").trim() || title;

// Pages are cached per language: YouTube Music words genre names and bios in the session's language.
const keyOf = (lang: Lang, id = "") => `${lang}|${id}`;
function parseKey(key: string): { lang: Lang; id: string } {
  const [lang = "", ...rest] = key.split("|");
  return { lang: isLang(lang) ? lang : "en", id: rest.join("|") };
}

const genreList = cached(6 * 60 * MINUTE, async (key): Promise<Genre[]> => {
  const { lang } = parseKey(key);
  const page = await withClient((yt) => browse(yt, { browseId: "FEmusic_moods_and_genres" }), lang).catch(() => {
    throw new HttpError(502, msg("genresUnavailable"));
  });
  const grids = shelvesOf(page);
  // The page has "moods" then "genres"; match the title in any language, falling back to the last grid.
  const grid = grids.find((g) => /g[eéê]ne?r/i.test(text(g.header?.title ?? g.title))) ?? grids.at(-1);
  return itemsOf(grid)
    .map((b) => ({ id: String(b.endpoint?.payload?.params ?? ""), name: text(b.button_text ?? b.title) }))
    .filter((g) => GENRE_ID.test(g.id) && g.name);
});

export const genres = (lang: Lang) => genreList(keyOf(lang));

async function playlistItems(id: string, limit: number, lang: Lang): Promise<any[]> {
  try {
    const list = await withClient((yt) => yt.music.getPlaylist(id), lang);
    return ((list as any).items ?? (list as any).contents ?? []).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Ranks the artists credited on `sources` by how often they show up (times the source's weight),
 * skipping the ones already `known`. Channels that are not artist pages (labels, uploaders) are left out.
 */
function rankArtists(sources: { items: any[]; weight: number; hits: boolean }[], known: Set<string>): GenreArtist[] {
  const ranked = new Map<string, GenreArtist & { score: number }>();
  for (const { items, weight, hits } of sources) {
    for (const item of items) {
      const hit = hits ? bareTitle(text(item.title)) : "";
      for (const a of item.artists ?? []) {
        const pageType = a?.endpoint?.payload?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
        if (!ARTIST_ID.test(a?.channel_id ?? "") || known.has(a.channel_id)) continue;
        if (pageType && pageType !== "MUSIC_PAGE_TYPE_ARTIST") continue;
        let entry = ranked.get(a.channel_id);
        if (!entry) {
          entry = { id: a.channel_id, name: text(a.name), ...imagesOf(item), hits: [], score: 0 };
          ranked.set(a.channel_id, entry);
        }
        entry.score += weight;
        if (hit && entry.hits.length < 3 && !entry.hits.includes(hit)) entry.hits.push(hit);
      }
    }
  }
  return [...ranked.values()]
    .filter((a) => a.name)
    .sort((a, b) => b.score - a.score)
    .map(({ score: _, ...a }) => a);
}

/** What a genre has turned up so far. "Load more" keeps reading its playlists for artists not seen yet. */
interface GenreState {
  page: GenrePage;
  /** Every artist found so far, in a fixed order: later pages append, never reshuffle earlier ones. */
  pool: GenreArtist[];
  /** Playlists not read yet. */
  queue: string[];
  lang: Lang;
  extending?: Promise<void>;
}

/**
 * A genre's songs and the artists behind them. The page lists ~50 songs, playlists and albums;
 * two editorial playlists widen the song list (and are all there is for pages like "Décadas").
 */
const genreState = cached(30 * MINUTE, async (key): Promise<GenreState> => {
  const { lang, id } = parseKey(key);
  const [all, page] = await Promise.all([
    genres(lang).catch(() => [] as Genre[]),
    withClient((yt) => browse(yt, { browseId: "FEmusic_moods_and_genres_category", params: id }), lang).catch(() => {
      throw new HttpError(502, msg("genreUnavailable"));
    }),
  ]);
  const shelves = shelvesOf(page);
  const items = shelves.flatMap(itemsOf);
  const songs = items.filter((i) => i.item_type === "song");
  const albums = items.filter((i) => i.item_type === "album");

  // One playlist from each shelf in turn (so "Décadas" mixes decades), editorial ("RDCLAK...") before
  // community ones, which are hit and miss.
  const perShelf = shelves.map((s) => itemsOf(s).filter((i) => i.item_type === "playlist" && typeof i.id === "string"));
  const editorial = (p: any) => /RDCLAK/.test(p.id);
  const playlists = [
    ...new Set(
      [...roundRobin(perShelf.map((list) => list.filter(editorial))), ...roundRobin(perShelf.map((list) => list.filter((p) => !editorial(p))))].map(
        (p): string => p.id,
      ),
    ),
  ];
  const first = songs.length >= 10 ? 2 : 4;
  const fromPlaylists = (await Promise.all(playlists.slice(0, first).map((p) => playlistItems(p, 60, lang)))).flat();

  const tracks = uniqueTracks([...songs, ...fromPlaylists].map((i) => toTrack(i, "song"))).slice(0, MAX_GENRE_TRACKS);
  if (!tracks.length && !albums.length) throw new HttpError(404, msg("genreEmpty"));

  // The genre's own song and album shelves weigh more than playlists.
  const pool = rankArtists(
    [
      { items: songs, weight: 2, hits: true },
      { items: albums, weight: 2, hits: false },
      { items: fromPlaylists, weight: 1, hits: true },
    ],
    new Set(),
  );
  // More artists come from the remaining editorial playlists; community ones only when there is nothing else.
  const rest = playlists.slice(first);
  const queue = rest.some((p) => /RDCLAK/.test(p)) ? rest.filter((p) => /RDCLAK/.test(p)) : rest;

  return {
    page: {
      id,
      name: all.find((g) => g.id === id)?.name ?? "",
      artists: pool.slice(0, ARTISTS_PAGE),
      hasMoreArtists: pool.length > ARTISTS_PAGE || queue.length > 0,
      tracks,
    },
    pool,
    queue,
    lang,
  };
});

export const genre = async (id: string, lang: Lang): Promise<GenrePage> => (await genreState(keyOf(lang, id))).page;

/** Reads the next few playlists of the genre and appends the artists they bring. */
async function extend(state: GenreState): Promise<void> {
  const batch = state.queue.splice(0, PLAYLISTS_PER_ROUND);
  const items = (await Promise.all(batch.map((p) => playlistItems(p, 100, state.lang)))).flat();
  state.pool.push(...rankArtists([{ items, weight: 1, hits: true }], new Set(state.pool.map((a) => a.id))));
  if (state.pool.length >= MAX_ARTISTS) state.queue.length = 0;
}

/** The next page of a genre's artists, reading more of its playlists when the ones found so far run out. */
export async function genreArtists(id: string, offset: number, lang: Lang): Promise<{ artists: GenreArtist[]; hasMore: boolean }> {
  const state = await genreState(keyOf(lang, id));
  // A few rounds at most per request, so a run of playlists with no new names can't stall it.
  for (let round = 0; round < 5 && state.pool.length < offset + ARTISTS_PAGE && state.queue.length; round++) {
    // Two "load more" taps at once share the same read instead of skipping playlists.
    state.extending ??= extend(state).finally(() => (state.extending = undefined));
    await state.extending;
  }
  return {
    artists: state.pool.slice(offset, offset + ARTISTS_PAGE),
    hasMore: state.pool.length > offset + ARTISTS_PAGE || state.queue.length > 0,
  };
}

function flexArtist(item: any): string {
  const sub = text(item?.flex_columns?.[1]?.title);
  if (!sub) return "";
  const parts = sub
    .split(/\s+[•·]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return "";
  const rest = parts.slice(1);
  if (rest.length && /^(19|20)\d\d$/.test(rest[rest.length - 1]!)) rest.pop();
  return rest.join(", ");
}

/** An artist's most played songs (the "Top songs" shelf, expanded to its full list). */
function albumCard(item: any): AlbumCard | null {
  const rawId = item?.id ?? item?.endpoint?.payload?.browseId;
  const id = typeof rawId === "string" ? rawId : "";
  if (!ALBUM_ID.test(id)) return null;
  const subtitle = text(item.subtitle);
  const meta = `${subtitle} ${text(item?.flex_columns?.[1]?.title)}`;
  const artists: string[] = (item.artists ?? item.authors ?? []).map((a: { name?: string }) => text(a?.name)).filter(Boolean);
  return {
    id,
    title: text(item.title),
    artist: artists.join(", ") || text(item.author?.name) || flexArtist(item),
    year: String(item.year || (meta.match(/\b(19|20)\d\d\b/)?.[0] ?? "")),
    ...imagesOf(item),
  };
}

const albumCards = (items: any[]) => items.map(albumCard).filter((a): a is AlbumCard => !!a && !!a.title);

/** Every album of an artist: the page shows ten, its "more" link opens the whole discography. */
async function allAlbums(shelf: any, lang: Lang): Promise<AlbumCard[]> {
  const shown = albumCards(itemsOf(shelf));
  const more = shelf?.header?.more_content?.endpoint?.payload;
  if (!more?.browseId) return shown;
  try {
    const page = await withClient((yt) => browse(yt, { browseId: more.browseId, params: more.params }), lang);
    const all = albumCards(page.contents_memo?.get("MusicTwoRowItem") ?? []);
    return all.length >= shown.length ? all : shown;
  } catch {
    return shown;
  }
}

const artistPage = cached(30 * MINUTE, async (key): Promise<ArtistPage> => {
  const { lang, id } = parseKey(key);
  const page = await withClient((yt) => yt.music.getArtist(id), lang).catch(() => {
    throw new HttpError(502, msg("artistUnavailable"));
  });
  const header: any = page.header;
  const shelf: any = page.sections.find((s) => s.type === "MusicShelf");
  // Album shelves are told apart by what they hold, not by their (translated) titles: albums come first, then singles.
  const releaseShelves: any[] = page.sections.filter((s: any) => itemsOf(s).some((i) => i.item_type === "album"));
  let items: any[] = itemsOf(shelf);
  // The shelf shows 5; its "show all" link is a playlist with the full ranking.
  const fullList = shelf?.endpoint?.payload?.browseId;
  const [more, albums] = await Promise.all([
    typeof fullList === "string" && fullList.startsWith("VL") ? playlistItems(fullList, MAX_HITS * 2, lang) : Promise.resolve([]),
    releaseShelves[0] ? allAlbums(releaseShelves[0], lang) : Promise.resolve([]),
  ]);
  if (more.length) items = more;
  const banner = (header?.thumbnail?.contents ?? header?.thumbnail ?? [])[0]?.url;
  const name = text(header?.title);
  const tracks = uniqueTracks(items.map((i) => toTrack(i, "song"))).slice(0, MAX_HITS);
  if (!name && !tracks.length) throw new HttpError(404, msg("artistNotFound"));
  return {
    id,
    name,
    description: text(header?.description),
    banner: typeof banner === "string" && banner.startsWith("https://") ? banner : "",
    tracks,
    albums,
    singles: releaseShelves[1] ? albumCards(itemsOf(releaseShelves[1])) : [],
  };
});

export const artist = (id: string, lang: Lang) => artistPage(keyOf(lang, id));

/** An album's tracks in order. Its tracks carry no cover or artist of their own: they get the album's. */
const albumPage = cached(60 * MINUTE, async (key): Promise<AlbumPage> => {
  const { lang, id } = parseKey(key);
  const album: any = await withClient((yt) => yt.music.getAlbum(id), lang).catch(() => {
    throw new HttpError(502, msg("albumUnavailable"));
  });
  const header = album.header;
  const title = text(header?.title);
  const artistRuns: any[] = header?.strapline_text_one?.runs ?? [];
  const artist = text(header?.strapline_text_one) || text(header?.author?.name);
  const artistId: string | null = artistRuns.map((r) => r?.endpoint?.payload?.browseId).find((b) => ARTIST_ID.test(b ?? "")) ?? null;
  const cover = imagesOf(header);
  const tracks = (album.contents ?? [])
    .filter((i: any) => typeof i?.id === "string" && VIDEO_ID.test(i.id))
    .map(
      (i: any): Track => ({
        id: i.id,
        title: text(i.title) || "Untitled",
        artist: (i.artists ?? []).map((a: { name?: string }) => text(a?.name)).filter(Boolean).join(", ") || artist,
        album: title,
        duration: i.duration?.seconds ?? 0,
        thumb: sized(cover.art, 120),
        art: cover.art,
        kind: "song",
      }),
    );
  if (!title && !tracks.length) throw new HttpError(404, msg("albumNotFound"));
  return {
    id,
    title,
    artist,
    artistId,
    kind: text(header?.subtitle),
    info: text(header?.second_subtitle),
    thumb: cover.thumb,
    art: cover.art,
    tracks,
  };
});

export const album = (id: string, lang: Lang) => albumPage(keyOf(lang, id));

// Search results can start with non-album sections (messages, "Showing results for") before the MusicShelf.
export async function searchAlbums(query: string, lang: Lang): Promise<AlbumCard[]> {
  const result: any = await withClient((yt) => yt.music.search(query, { type: "album" }), lang);
  const sections: any[] = Array.isArray(result?.contents) ? result.contents : [];
  const seen = new Set<string>();
  return albumCards(sections.flatMap(itemsOf)).filter((a) => !seen.has(a.id) && seen.add(a.id));
}
