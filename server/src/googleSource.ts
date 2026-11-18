import { Innertube } from "youtubei.js";
import { toTrack, text } from "./search.js";

export interface GoogleTokens { access_token: string; refresh_token: string; expires_at: number; }
export interface SourceTrack { id: string; title: string; artist: string; album?: string; }
export interface SourceCollection { id: string; name: string; kind: "playlist" | "album"; tracks: SourceTrack[]; }
export interface ImportSource { collections: SourceCollection[]; likes: SourceTrack[]; history: SourceTrack[]; unavailable: string[]; }
const items = (page: any): any[] => {
  const content = page.contents ?? page.items ?? [];
  return Array.isArray(content) ? content.flatMap((s: any) => s.items ?? s.contents ?? [s]) : content.items ?? content.contents ?? [];
};
const track = (item: any): SourceTrack | null => {
  const t = toTrack(item, "song"); return t ? { id: t.id, title: t.title, artist: t.artist, album: t.album } : null;
};
async function complete(page: any, limit: number, capped: () => void = () => {}): Promise<any[]> {
  const out: any[] = []; const seen = new Set<string>();
  for (let n = 0; n < 200; n++) {
    out.push(...items(page)); if (out.length >= limit) { if (out.length > limit || page.has_continuation) capped(); return out.slice(0, limit); }
    if (!page.has_continuation) return out;
    const signature = JSON.stringify(out.slice(-3).map((item) => item.id));
    if (seen.has(signature)) throw new Error("Provider continuation repeated"); seen.add(signature);
    page = await page.getContinuation();
  }
  throw new Error("Provider pagination limit reached");
}

/** Dedicated import-only session: never exported to playback, shared search, stream resolution or Google cookies. */
export async function googleMusicSource(tokens: GoogleTokens, credentials: { clientId: string; clientSecret: string }, transport: typeof fetch,
  signal: AbortSignal, limit: number): Promise<ImportSource> {
  const timed: typeof fetch = (input, init) => transport(input, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
  let yt: Innertube | null = null;
  try {
    yt = await Innertube.create({ retrieve_player: false, lang: "en", fetch: timed });
    await yt.session.signIn({ access_token: tokens.access_token, refresh_token: tokens.refresh_token,
      expiry_date: new Date(tokens.expires_at).toISOString(), client: { client_id: credentials.clientId, client_secret: credentials.clientSecret } });
  } catch { yt = null; }
  const result: ImportSource = { collections: [], likes: [], history: [], unavailable: [] };
  let library: any;
  try { library = await yt!.music.getLibrary(); } catch { /* Public API fallback below. */ }
  let playlistOK = false;
  if (library) {
    for (const kind of ["playlist", "album"] as const) {
      try {
        const filter = library.filters.find((name: string) => kind === "album" ? /^albums$/i.test(name) : /^playlists$/i.test(name));
        if (!filter) throw new Error("Library filter unavailable");
        const entries = await complete(await library.applyFilter(filter), 1000, () => result.unavailable.push(`${kind}:collection-limit`));
        for (const entry of entries) {
          if (!entry.id || entry.id === "LM") continue;
          try {
            const page: any = kind === "album" ? await yt!.music.getAlbum(entry.id) : await yt!.music.getPlaylist(entry.id);
            const tracks = (await complete(page, limit, () => result.unavailable.push(`${kind}:${String(entry.id).slice(0, 100)}:item-limit`))).map(track).filter((t): t is SourceTrack => !!t);
            result.collections.push({ id: String(entry.id), name: text(entry.title) || kind, kind, tracks });
          } catch { result.unavailable.push(`${kind}:${String(entry.id).slice(0, 100)}`); }
        }
        if (kind === "playlist") playlistOK = true;
      } catch { if (kind === "album") result.unavailable.push("albums:provider-unavailable"); }
    }
  } else result.unavailable.push("albums:provider-unavailable");
  try {
    const liked: any = await yt!.music.getPlaylist("LM"); result.likes = (await complete(liked, limit, () => result.unavailable.push("likes:item-limit"))).map(track).filter((t): t is SourceTrack => !!t);
  } catch { /* Public liked-videos endpoint below. */ }
  const api = async (endpoint: string, query: Record<string, string>) => {
    const out: any[] = []; let pageToken = ""; const seen = new Set<string>();
    do {
      const params = new URLSearchParams({ ...query, maxResults: "50", ...(pageToken ? { pageToken } : {}) });
      const response = await timed(`https://www.googleapis.com/youtube/v3/${endpoint}?${params}`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
      if (!response.ok) { await response.body?.cancel(); throw new Error("Google source unavailable"); }
      const data = await response.json() as { items?: any[]; nextPageToken?: string }; out.push(...(data.items ?? []));
      pageToken = data.nextPageToken ?? ""; if (seen.has(pageToken) && pageToken) throw new Error("Provider continuation repeated"); seen.add(pageToken);
    } while (pageToken && out.length < limit);
    if (out.length > limit || pageToken) result.unavailable.push(`${endpoint}:item-limit`);
    return out.slice(0, limit);
  };
  const dataTrack = (item: any): SourceTrack => ({ id: item.contentDetails?.videoId ?? item.id,
    title: item.snippet?.title ?? "", artist: item.snippet?.videoOwnerChannelTitle ?? item.snippet?.channelTitle ?? "" });
  if (!playlistOK) {
    try {
      for (const playlist of await api("playlists", { part: "snippet", mine: "true" })) {
        const tracks = (await api("playlistItems", { part: "snippet,contentDetails", playlistId: playlist.id })).map(dataTrack);
        result.collections.push({ id: playlist.id, name: playlist.snippet.title, kind: "playlist", tracks });
      }
    } catch { result.unavailable.push("playlists:provider-unavailable"); }
  }
  if (!result.likes.length) {
    try { result.likes = (await api("videos", { part: "snippet", myRating: "like" })).map(dataTrack); }
    catch { result.unavailable.push("likes:provider-unavailable"); }
  }
  try {
    let page: any = await yt!.actions.execute("/browse", { browseId: "FEmusic_history", client: "YTMUSIC", parse: true });
    const seen = new Set<string>();
    for (let n = 0; n < 20 && result.history.length < 60; n++) {
      const rows = page.contents_memo?.get("MusicResponsiveListItem") ?? page.continuation_contents?.contents ?? [];
      result.history.push(...rows.map(track).filter((t: SourceTrack | null): t is SourceTrack => !!t));
      const shelves = page.contents_memo?.get("MusicShelf") ?? []; const token = shelves.find((s: any) => s.continuation)?.continuation ?? page.continuation_contents?.continuation;
      if (!token || seen.has(token)) break; seen.add(token);
      page = await yt!.actions.execute("/browse", { continuation: token, client: "YTMUSIC", parse: true });
    }
    result.history = result.history.slice(0, 60);
    if (!result.history.length) result.unavailable.push("history:empty-or-provider-unavailable");
  } catch { result.unavailable.push("history:provider-unavailable"); }
  return result;
}
