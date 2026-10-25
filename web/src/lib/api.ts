import { getLang, getT } from "../i18n";
import {
  ApiError,
  type Channel,
  type ErrorCode,
  type ImportResult,
  type MusikeApi,
  type Prepared,
  type SystemInfo,
  type SystemJob,
  type SystemMedia,
} from "./apiTypes";
import type { AlbumCard, AlbumPage, ArtistPage, Genre, GenreArtist, GenrePage, Library, Playlist, Track } from "./types";

// The HTTP backend: the Musike server (web app, desktop app). The Android build swaps this module for native/api.ts.
export * from "./apiTypes";

/** The server answers errors (and YouTube Music answers names, like genres) in the app's language. */
const LANG_HEADER = "x-musike-lang";

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: {
      [LANG_HEADER]: getLang(),
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? getT().player.httpError(res.status), body.code);
  return body as T;
}

export const api: MusikeApi = {
  search: (q: string, type: "song" | "video", signal?: AbortSignal) =>
    request<{ tracks: Track[] }>(`/api/search?q=${encodeURIComponent(q)}&type=${type}`, { signal }).then((r) => r.tracks),
  suggest: (q: string, signal?: AbortSignal) =>
    request<{ suggestions: string[] }>(`/api/suggest?q=${encodeURIComponent(q)}`, { signal }).then((r) => r.suggestions),
  radio: (id: string) => request<{ tracks: Track[] }>(`/api/radio/${id}`).then((r) => r.tracks),
  genres: () => request<{ genres: Genre[] }>("/api/genres").then((r) => r.genres),
  genre: (id: string, signal?: AbortSignal) => request<GenrePage>(`/api/genres/${encodeURIComponent(id)}`, { signal }),
  genreArtists: (id: string, offset: number) =>
    request<{ artists: GenreArtist[]; hasMore: boolean }>(`/api/genres/${encodeURIComponent(id)}/artists?offset=${offset}`),
  artist: (id: string, signal?: AbortSignal) => request<ArtistPage>(`/api/artists/${encodeURIComponent(id)}`, { signal }),
  album: (id: string, signal?: AbortSignal) => request<AlbumPage>(`/api/albums/${encodeURIComponent(id)}`, { signal }),
  searchAlbums: (q: string, signal?: AbortSignal) =>
    request<{ albums: AlbumCard[] }>(`/api/search/albums?q=${encodeURIComponent(q)}`, { signal }).then((r) => r.albums),
  /** The music video matching a song, or null when YouTube has none. */
  videoFor: (t: Track) =>
    request<{ track: Track | null }>(
      `/api/video-for/${t.id}?${new URLSearchParams({ title: t.title, artist: t.artist, duration: String(t.duration || "") })}`,
    ).then((r) => r.track),
  prepare: (id: string, signal?: AbortSignal) =>
    request<Prepared>(`/api/prepare/${id}`, {
      method: "POST",
      signal,
    }),

  library: () => request<Library>("/api/library"),
  addFavorite: (t: Track) => request<{ favorites: Track[] }>(`/api/favorites/${t.id}`, { method: "PUT", json: t }),
  addFavorites: (tracks: Track[]) => request<{ favorites: Track[] }>("/api/favorites", { method: "POST", json: { tracks } }),
  removeFavorite: (id: string) => request<{ favorites: Track[] }>(`/api/favorites/${id}`, { method: "DELETE" }),
  pushHistory: (t: Track) => request<{ history: Track[] }>("/api/history", { method: "POST", json: t }),
  createPlaylist: (name: string, tracks: Track[] = []) =>
    request<Playlist>("/api/playlists", { method: "POST", json: { name, tracks } }),
  renamePlaylist: (id: string, name: string) => request<Playlist>(`/api/playlists/${id}`, { method: "PATCH", json: { name } }),
  deletePlaylist: (id: string) => request<void>(`/api/playlists/${id}`, { method: "DELETE" }),
  addToPlaylist: (id: string, t: Track | Track[]) =>
    request<Playlist>(`/api/playlists/${id}/tracks`, { method: "POST", json: Array.isArray(t) ? { tracks: t } : t }),
  removeFromPlaylist: (id: string, trackId: string) =>
    request<Playlist>(`/api/playlists/${id}/tracks/${trackId}`, { method: "DELETE" }),

  importLibrary: (backup: unknown, mode: "merge" | "replace") =>
    request<ImportResult>("/api/library/import", { method: "POST", json: { backup, mode } }),

  system: () => request<SystemInfo>("/api/system"),
  updateYtdlp: (channel: Channel) => request<SystemJob>("/api/system/ytdlp", { method: "POST", json: { channel } }),
};

/** What a media element plays for a track: here, the server's stream proxy. The Android backend resolves it on the phone. */
export const streamSource = (id: string, kind: "audio" | "video", quality: "sd" | "hd"): string | Promise<string> =>
  kind === "audio" ? `/api/stream/${id}/audio` : `/api/stream/${id}/video?q=${quality}`;

/** Saves a text file the way this platform does it: a browser download (the desktop app shows "Save as"). */
export async function saveFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Only the Android app needs its own bridge to the system's media controls. */
export const systemMedia: SystemMedia | null = null;

/** What this build can do. The Android build has no video yet, no yt-dlp to manage, and retries expired streams.
 *  `offline` is the Android app's saved tracks; a browser or desktop app streams instead. */
export const capabilities = { video: true, engineSettings: true, retryOnError: false, offline: false };

/** Media elements hide the HTTP error body; fetch it to show the real reason. */
export async function explainStreamError(url: string): Promise<{ message: string; code?: ErrorCode }> {
  const t = getT();
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-0", [LANG_HEADER]: getLang() } });
    if (res.ok) return { message: t.player.browserCantPlay };
    const body = await res.json().catch(() => ({}));
    return { message: body.error ?? t.player.httpError(res.status), code: body.code };
  } catch {
    return { message: t.player.serverDown };
  }
}
