export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  /** YouTube Music channel of the main artist, when known: opens their artist page. */
  artistId?: string;
  duration: number;
  thumb: string;
  art: string;
  kind: "song" | "video";
}

export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
}

export interface Library {
  favorites: Track[];
  playlists: Playlist[];
  history: Track[];
}

import { tr, type Text } from "./i18n.js";

export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** A YouTube Music artist page (a channel ID). */
export const ARTIST_ID = /^UC[\w-]{22}$/;

/** Machine-readable reason so the web app can offer the right fix (e.g. "update yt-dlp"). */
export type ErrorCode = "tool_missing" | "maybe_outdated" | "bot_check";

/** An error for the person using the app: its text is translated into each request's language when sent. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public text: Text,
    public code?: ErrorCode,
  ) {
    super(tr("en", text));
  }
}
