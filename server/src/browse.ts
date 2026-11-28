import type { Innertube } from "youtubei.js";
import { config } from "./config.js";
import { isLang, msg, tr, youtubeLang, type Lang } from "./i18n.js";
import * as library from "./library.js";
import { radio, sized, text, toTrack, withClient } from "./search.js";
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
/** Curated/editorial playlist ids from the home feed and charts (e.g. "VLRDCLAK...", "VLOLAK..."). */
export const PLAYLIST_ID = /^[\w-]{10,120}$/;

/** A curated playlist as a cover in a shelf (home feed, charts): not one of the person's own library playlists. */
export interface PlaylistCard {
  id: string;
  title: string;
  /** YouTube Music's own line: a curator, track count or short description. */
  subtitle: string;
  thumb: string;
  art: string;
}

export interface PlaylistPreview {
  id: string;
  title: string;
  subtitle: string;
  thumb: string;
  art: string;
  tracks: Track[];
}

export type HomeSection =
  | { title: string; kind: "tracks"; items: Track[] }
  | { title: string; kind: "albums"; items: AlbumCard[] }
  | { title: string; kind: "playlists"; items: PlaylistCard[] }
  | { title: string; kind: "artists"; items: GenreArtist[] };

export interface HomeFeed {
  sections: HomeSection[];
}

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

/** A grid of buttons (genres, or moods) as plain id/name pairs — opened the same way either kind. */
const buttonList = (grid: any): Genre[] =>
  itemsOf(grid)
    .map((b: any) => ({ id: String(b.endpoint?.payload?.params ?? ""), name: text(b.button_text ?? b.title) }))
    .filter((g: Genre) => GENRE_ID.test(g.id) && g.name);

/**
 * One page holds both grids ("Moods & moments" then "Genres"); fetched once and split here so `genres()` and
 * `moods()` share the same cache instead of hitting YouTube twice for the same page.
 */
const moodsAndGenres = cached(6 * 60 * MINUTE, async (key): Promise<{ genres: Genre[]; moods: Genre[] }> => {
  const { lang } = parseKey(key);
  const page = await withClient((yt) => browse(yt, { browseId: "FEmusic_moods_and_genres" }), lang).catch(() => {
    throw new HttpError(502, msg("genresUnavailable"));
  });
  const grids = shelvesOf(page);
  // The page has "moods" then "genres"; match the genres title in any language, falling back to the last grid.
  const genreGrid = grids.find((g) => /g[eéê]ne?r/i.test(text(g.header?.title ?? g.title))) ?? grids.at(-1);
  const moodGrid = grids.find((g) => g !== genreGrid) ?? grids[0];
  return { genres: buttonList(genreGrid), moods: buttonList(moodGrid) };
});

export const genres = async (lang: Lang) => (await moodsAndGenres(keyOf(lang))).genres;
/** Same mechanism as genres — a mood's id opens through the exact same `genre()`/`FEmusic_moods_and_genres_category` page. */
export const moods = async (lang: Lang) => (await moodsAndGenres(keyOf(lang))).moods;

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

/** An artist's most played songs (the "Top songs" shelf, expanded to its full list). */
function albumCard(item: any): AlbumCard | null {
  const id = typeof item?.id === "string" ? item.id : "";
  if (!ALBUM_ID.test(id)) return null;
  const subtitle = text(item.subtitle);
  const artists: string[] = (item.artists ?? []).map((a: { name?: string }) => text(a?.name)).filter(Boolean);
  return {
    id,
    title: text(item.title),
    artist: artists.join(", ") || text(item.author?.name),
    year: String(item.year ?? subtitle.match(/\b(19|20)\d\d\b/)?.[0] ?? ""),
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

export async function searchAlbums(query: string, lang: Lang): Promise<AlbumCard[]> {
  const result: any = await withClient((yt) => yt.music.search(query, { type: "album" }), lang);
  return albumCards(itemsOf(result.contents?.[0]));
}

function playlistCard(item: any): PlaylistCard | null {
  const id = typeof item?.id === "string" ? item.id : "";
  if (!PLAYLIST_ID.test(id)) return null;
  return { id, title: text(item.title), subtitle: text(item.subtitle) || text(item.author?.name), ...imagesOf(item) };
}

/** "Top artists" (charts): a plain list row, unlike the typed cards carousels give song/playlist shelves. */
function chartArtist(item: any): GenreArtist | null {
  const id = item?.endpoint?.payload?.browseId;
  const name = text(item?.flex_columns?.[0]?.title);
  if (!ARTIST_ID.test(id ?? "") || !name) return null;
  return { id, name, ...imagesOf(item), hits: [] };
}

/**
 * The literal code YouTube Music's own charts page uses for its "Global" scope (its country-selector menu
 * has no real ISO code for that option — picking it just sends this literal string).
 */
const WORLD_CHART = "ZZ";

/** "BR" -> "Brazil" in the request's language; "ZZ" (YouTube Music's own "Global" scope) -> a translated "World". */
function regionName(code: string, lang: Lang): string {
  if (code === WORLD_CHART) return tr(lang, msg("worldRegion"));
  try {
    return new Intl.DisplayNames(youtubeLang(lang), { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * YouTube Music's charts page, scoped to one country (or "ZZ" for its "Global" scope). Guest sessions get the
 * "Top artists" and "Video charts" shelves; the per-song chart comes back empty without a signed-in session.
 */
async function chartShelves(code: string, lang: Lang): Promise<{ artists: any; videos: any }> {
  const page = await withClient((yt) => browse(yt, { browseId: "FEmusic_charts", formData: { selectedValues: [code] } }), lang).catch(
    () => null,
  );
  const shelves = page ? shelvesOf(page) : [];
  return {
    artists: shelves.find((s) => itemsOf(s).some((i) => i.item_type === "artist")),
    videos: shelves.find((s) => itemsOf(s).some((i) => i.item_type === "playlist")),
  };
}

const MAX_HOME_TRACKS = 25;
const MAX_NEW_RELEASES = 30;

/**
 * The catalog's own picks, not the person's library: YouTube Music's guest home feed (quick picks, a mood
 * playlist or two), its new-release albums, and its charts (top artists, video charts) for this server's own
 * region and for its "Global" scope. No sign-in, so nothing personalized, and no per-song numbered chart (see
 * `chartShelves`).
 */
const homeFeed = cached(15 * MINUTE, async (lang): Promise<HomeFeed> => {
  const sections: HomeSection[] = [];

  const [homePage, releasesPage, ownCharts, worldCharts, mix, moodSecs] = await Promise.all([
    withClient((yt) => browse(yt, { browseId: "FEmusic_home" }), lang as Lang).catch(() => null),
    withClient((yt) => browse(yt, { browseId: "FEmusic_new_releases_albums" }), lang as Lang).catch(() => null),
    chartShelves(config.location, lang as Lang),
    chartShelves(WORLD_CHART, lang as Lang),
    weeklyMix(lang as Lang).catch(() => null),
    moodSections(lang as Lang).catch(() => [] as HomeSection[]),
  ]);

  // Built from this install's own favorites/history — leads the feed when it exists, as the most relevant shelf.
  if (mix) sections.push(mix);

  if (homePage) {
    for (const shelf of shelvesOf(homePage)) {
      const title = text(shelf?.header?.title ?? shelf?.title);
      const items = itemsOf(shelf);
      if (!title || !items.length) continue;
      if (items[0]?.item_type === "song") {
        const tracks = uniqueTracks(items.map((i: any) => toTrack(i, "song"))).slice(0, MAX_HOME_TRACKS);
        if (tracks.length) sections.push({ title, kind: "tracks", items: tracks });
      } else if (items[0]?.item_type === "playlist") {
        const cards = items.map(playlistCard).filter((c: PlaylistCard | null): c is PlaylistCard => !!c && !!c.title);
        if (cards.length) sections.push({ title, kind: "playlists", items: cards });
      }
    }
  }

  if (releasesPage) {
    const cards = albumCards(itemsOf(shelvesOf(releasesPage)[0])).slice(0, MAX_NEW_RELEASES);
    if (cards.length) sections.push({ title: tr(lang as Lang, msg("newReleasesTitle")), kind: "albums", items: cards });
  }

  // A few YouTube Music moods, each as its own shelf.
  for (const section of moodSecs) sections.push(section);

  // Both scopes, each disambiguated with its own region name: YouTube's own shelf title ("Top artists",
  // "Video charts") says what the chart is, not which country — that part is ours to add.
  for (const [code, charts] of [
    [config.location, ownCharts],
    [WORLD_CHART, worldCharts],
  ] as const) {
    const region = regionName(code, lang as Lang);
    if (charts.artists) {
      const base = text(charts.artists.header?.title ?? charts.artists.title);
      const cards = itemsOf(charts.artists).map(chartArtist).filter((c: GenreArtist | null): c is GenreArtist => !!c);
      if (base && cards.length) sections.push({ title: `${base} — ${region}`, kind: "artists", items: cards });
    }
    if (charts.videos) {
      const base = text(charts.videos.header?.title ?? charts.videos.title);
      const cards = itemsOf(charts.videos).map(playlistCard).filter((c: PlaylistCard | null): c is PlaylistCard => !!c && !!c.title);
      if (base && cards.length) sections.push({ title: `${base} — ${region}`, kind: "playlists", items: cards });
    }
  }

  return { sections };
});

export const home = (lang: Lang) => homeFeed(lang);

/** How many of YouTube Music's moods get their own Home shelf (the full list is on the Search page). */
const MOOD_HOME_SHELVES = 3;
const MAX_MOOD_TRACKS = 40;

/**
 * The first few moods' tracks, each its own section — the same `genre()` page a mood's id opens, capped for Home.
 * Taken in YouTube Music's own order rather than picked by name, since mood names come back in the app language.
 */
async function moodSections(lang: Lang): Promise<HomeSection[]> {
  const picked = (await moods(lang).catch(() => [] as Genre[])).slice(0, MOOD_HOME_SHELVES);
  const pages = await Promise.all(picked.map((m) => genre(m.id, lang).catch(() => null)));
  const sections: HomeSection[] = [];
  for (const [i, page] of pages.entries()) {
    if (page?.tracks.length) sections.push({ title: picked[i]!.name, kind: "tracks", items: page.tracks.slice(0, MAX_MOOD_TRACKS) });
  }
  return sections;
}

const WEEKLY_MIX_SEEDS = 6;
const MAX_WEEKLY_MIX = 40;

/** `n` random items (a Fisher–Yates shuffle of a copy; library-sized lists only). */
function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/**
 * A mix built from this install's own library: a few random favorites/recently played tracks seed YouTube Music's
 * radio (the same one `/api/radio` uses), and the results are interleaved, minus anything already in the library.
 * Rebuilt once a week. An empty library throws instead of returning null, so that result isn't cached for a week.
 */
const weeklyMixFeed = cached(7 * 24 * 60 * MINUTE, async (lang): Promise<HomeSection> => {
  const lib = await library.getLibrary().catch(() => null);
  const known = new Set<string>();
  for (const t of [...(lib?.favorites ?? []), ...(lib?.history ?? [])]) known.add(t.id);
  if (!known.size) throw new Error("empty library");

  // Favorites are the stronger signal (an explicit "I like this"); history tops up the seed pool when needed.
  const favoriteIds = new Set((lib?.favorites ?? []).map((t) => t.id));
  const seedPool = [...(lib?.favorites ?? []), ...(lib?.history ?? []).filter((t) => !favoriteIds.has(t.id))];
  const seeds = sample(seedPool, WEEKLY_MIX_SEEDS);

  const lists = await Promise.all(seeds.map((t) => radio(t.id).catch(() => [] as Track[])));
  const mixed = roundRobin(lists).filter((t) => !known.has(t.id));
  const tracks = uniqueTracks(mixed).slice(0, MAX_WEEKLY_MIX);
  if (!tracks.length) throw new Error("no mix tracks");
  return { title: tr(lang as Lang, msg("weeklyMixTitle")), kind: "tracks", items: tracks };
});

const weeklyMix = (lang: Lang) => weeklyMixFeed(lang);

/** A curated playlist (from the home feed or charts), read-only: not saved to the library unless the person asks. */
const playlistPreviewPage = cached(60 * MINUTE, async (key): Promise<PlaylistPreview> => {
  const { lang, id } = parseKey(key);
  const list: any = await withClient((yt) => yt.music.getPlaylist(id), lang).catch(() => {
    throw new HttpError(502, msg("playlistUnavailable"));
  });
  const header = list.header ?? list.info ?? {};
  const items: any[] = (list.items ?? list.contents ?? []).filter((i: any) => typeof i?.id === "string" && VIDEO_ID.test(i.id));
  const title = text(header.title);
  const cover = imagesOf(header);
  const tracks = uniqueTracks(items.map((i) => toTrack(i, "song")));
  if (!title && !tracks.length) throw new HttpError(404, msg("playlistNotFound"));
  return {
    id,
    title,
    subtitle: text(header.subtitle) || text(header.description) || text(header.author?.name),
    thumb: cover.thumb,
    art: cover.art,
    tracks,
  };
});

export const playlistPreview = (id: string, lang: Lang) => playlistPreviewPage(keyOf(lang, id));
