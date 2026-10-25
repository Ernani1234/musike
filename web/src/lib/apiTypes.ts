import type { AlbumCard, AlbumPage, ArtistPage, Genre, GenreArtist, GenrePage, Library, Playlist, Track } from "./types";

/**
 * What the app needs from a backend. The web app and the desktop app talk to the Musike server over HTTP
 * (lib/api.ts); the Android app does the same work on the phone (native/api.ts). The build picks one.
 */

export type ErrorCode = "tool_missing" | "maybe_outdated" | "bot_check";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: ErrorCode) {
    super(message);
  }
}

export type Channel = "stable" | "nightly";

export interface ImportResult {
  playlistsAdded: number;
  playlistsMerged: number;
  tracksAdded: number;
  favoritesAdded: number;
}

export interface SystemJob {
  kind: "update" | "install";
  channel: Channel;
  status: "running" | "done" | "error";
  startedAt: number;
  finishedAt?: number;
  from: string | null;
  to: string | null;
  message: string;
  log: string[];
}

export interface SystemInfo {
  ytdlp: {
    path: string | null;
    version: string | null;
    channel: Channel;
    latest: Record<Channel, string | null>;
    updateAvailable: boolean;
  };
  deno: string | null;
  ffmpeg: string | null;
  canInstall: boolean;
  job: SystemJob | null;
}

export interface Prepared {
  id: string;
  title: string;
  duration: number;
  hasSdVideo: boolean;
}

/**
 * The operating system's media controls (notification, lock screen, headphone buttons) when the browser's
 * Media Session can't reach them: the Android app. Absent elsewhere.
 */
export interface SystemMedia {
  setTrack(track: { title: string; artist: string; album: string; artwork: string }): void;
  setState(state: { playing: boolean; position: number; duration: number }): void;
  onAction(handler: (action: "play" | "pause" | "next" | "previous" | "seek", position?: number) => void): void;
}

/** A track saved on the device, so it plays without a connection. */
export interface OfflineEntry {
  track: Track;
  /** Bytes on disk. */
  size: number;
  /** When it was saved (epoch ms). */
  at: number;
  /** Where the audio lives, relative to the app's data directory. */
  file: string;
}

/**
 * Saving tracks to the device. Only the Android app can: it has its own storage. Everywhere else the bytes come
 * from the server (or YouTube), so there is nothing to keep — `supported` is false and the UI stays hidden.
 */
export interface OfflineApi {
  supported: boolean;
  /** Everything saved, by track id. */
  load(): Promise<Record<string, OfflineEntry>>;
  /** One saved track, or null. */
  entry(id: string): Promise<OfflineEntry | null>;
  /** Saves a track's audio, reporting progress from 0 to 1. */
  save(track: Track, onProgress: (fraction: number) => void): Promise<OfflineEntry>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  /** A local address the player can use for a saved track, or null. */
  src(id: string): Promise<string | null>;
}

export interface MusikeApi {
  search(q: string, type: "song" | "video", signal?: AbortSignal): Promise<Track[]>;
  suggest(q: string, signal?: AbortSignal): Promise<string[]>;
  radio(id: string): Promise<Track[]>;
  genres(): Promise<Genre[]>;
  genre(id: string, signal?: AbortSignal): Promise<GenrePage>;
  genreArtists(id: string, offset: number): Promise<{ artists: GenreArtist[]; hasMore: boolean }>;
  artist(id: string, signal?: AbortSignal): Promise<ArtistPage>;
  album(id: string, signal?: AbortSignal): Promise<AlbumPage>;
  searchAlbums(q: string, signal?: AbortSignal): Promise<AlbumCard[]>;
  /** The music video matching a song, or null when YouTube has none. */
  videoFor(t: Track): Promise<Track | null>;
  prepare(id: string, signal?: AbortSignal): Promise<Prepared>;

  library(): Promise<Library>;
  addFavorite(t: Track): Promise<{ favorites: Track[] }>;
  addFavorites(tracks: Track[]): Promise<{ favorites: Track[] }>;
  removeFavorite(id: string): Promise<{ favorites: Track[] }>;
  pushHistory(t: Track): Promise<{ history: Track[] }>;
  createPlaylist(name: string, tracks?: Track[]): Promise<Playlist>;
  renamePlaylist(id: string, name: string): Promise<Playlist>;
  deletePlaylist(id: string): Promise<void>;
  addToPlaylist(id: string, t: Track | Track[]): Promise<Playlist>;
  removeFromPlaylist(id: string, trackId: string): Promise<Playlist>;
  importLibrary(backup: unknown, mode: "merge" | "replace"): Promise<ImportResult>;

  system(): Promise<SystemInfo>;
  updateYtdlp(channel: Channel): Promise<SystemJob>;
}
