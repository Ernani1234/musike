export interface Origin { provider: "youtube-music"; sourceId: string; kind: "playlist" | "album" | "like" | "history"; }
export interface Track {
  origin?: Origin;
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  thumb: string;
  art: string;
  kind: "song" | "video";
}

export interface Playlist {
  origin?: Origin;
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

export interface Genre {
  id: string;
  name: string;
}

export interface GenreArtist {
  id: string;
  name: string;
  /** Cover of one of their releases in the genre. */
  thumb: string;
  art: string;
  /** A few of their songs in the genre. */
  hits: string[];
}

export interface GenrePage {
  id: string;
  name: string;
  /** First page of artists; `api.genreArtists` brings the next ones. */
  artists: GenreArtist[];
  hasMoreArtists: boolean;
  tracks: Track[];
}

/** An album or single as a cover in a list. */
export interface AlbumCard {
  id: string;
  title: string;
  /** Empty on an artist's own page. */
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
  /** YouTube Music's own lines, already in the app language: "Album • 1991", "13 songs • 49 minutes". */
  kind: string;
  info: string;
  thumb: string;
  art: string;
  tracks: Track[];
}
