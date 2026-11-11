import { existsSync } from "node:fs";
import { createServer } from "node:net";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { ALBUM_ID, album, ARTIST_ID, artist, GENRE_ID, genre, genreArtists, genres, searchAlbums } from "./browse.js";
import { config } from "./config.js";
import * as library from "./library.js";
import { fileStorage } from "./libraryFile.js";
import { findVideoFor, radio, search, suggestions } from "./search.js";
import { proxyStream, serveFile } from "./stream.js";
import { langOf, msg, tr } from "./i18n.js";
import { presentJob, startJob, systemInfo, type Channel } from "./system.js";
import { refreshTools, type Tools } from "./tools.js";
import { HttpError, VIDEO_ID } from "./types.js";
import { downloadHd, pruneCache, resolveStreams } from "./ytdlp.js";

function videoId(params: unknown): string {
  const id = (params as { id?: string }).id ?? "";
  if (!VIDEO_ID.test(id)) throw new HttpError(400, msg("invalidVideoId"));
  return id;
}

function query(q: unknown): string {
  const s = typeof q === "string" ? q.trim() : "";
  if (!s) throw new HttpError(400, msg("emptyQuery"));
  return s.slice(0, 200);
}

export interface StartOptions {
  port?: number;
  host?: string;
  /** Try the next ports when the preferred one is taken (the desktop app does this). */
  portFallback?: boolean;
}

export interface RunningServer {
  port: number;
  tools: Tools;
  close: () => Promise<void>;
}

/** Builds the Musike HTTP server (API + web app) and starts listening. */
export async function startServer(opts: StartOptions = {}): Promise<RunningServer> {
  library.useLibraryStorage(fileStorage());
  const found = await refreshTools();
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "warn" } });

  app.setErrorHandler((err, req, reply) => {
    const e = err as Error & { statusCode?: number };
    const status = e instanceof HttpError ? e.status : e.statusCode ?? 500;
    if (status >= 500) app.log.error(e);
    // Musike's own errors are translated into the language the app asked for.
    const error = e instanceof HttpError ? tr(langOf(req), e.text) : e.message;
    if (!reply.sent) reply.code(status).send({ error, code: e instanceof HttpError ? e.code : undefined });
  });

  app.get("/api/health", async () => ({ ok: true }));

  // System: yt-dlp status and one-click update

  app.get("/api/system", (req) => systemInfo(langOf(req)));

  app.post("/api/system/ytdlp", async (req) => {
    const { channel } = (req.body ?? {}) as { channel?: string };
    return presentJob(startJob((channel === "nightly" ? "nightly" : "stable") satisfies Channel), langOf(req));
  });

  // Discovery

  app.get("/api/search", async (req) => {
    const { q, type } = req.query as { q?: string; type?: string };
    return { tracks: await search(query(q), type === "video" ? "video" : "song", langOf(req)) };
  });

  app.get("/api/suggest", async (req) => {
    const { q } = req.query as { q?: string };
    if (!q?.trim()) return { suggestions: [] };
    return { suggestions: await suggestions(q.trim().slice(0, 100), langOf(req)).catch(() => []) };
  });

  app.get("/api/radio/:id", async (req) => ({ tracks: await radio(videoId(req.params)) }));

  // Browse by genre: genre → its artists or all its songs → an artist's top songs

  app.get("/api/genres", async (req) => ({ genres: await genres(langOf(req)) }));

  app.get("/api/genres/:gid", async (req) => {
    const { gid } = req.params as { gid: string };
    if (!GENRE_ID.test(gid)) throw new HttpError(400, msg("invalidGenre"));
    return genre(gid, langOf(req));
  });

  /** "Load more" for a genre's artists: `offset` is how many the app already shows. */
  app.get("/api/genres/:gid/artists", async (req) => {
    const { gid } = req.params as { gid: string };
    const offset = Number((req.query as { offset?: string }).offset ?? 0);
    if (!GENRE_ID.test(gid)) throw new HttpError(400, msg("invalidGenre"));
    if (!Number.isInteger(offset) || offset < 0 || offset > 1000) throw new HttpError(400, msg("invalidOffset"));
    return genreArtists(gid, offset, langOf(req));
  });

  app.get("/api/artists/:aid", async (req) => {
    const { aid } = req.params as { aid: string };
    if (!ARTIST_ID.test(aid)) throw new HttpError(400, msg("invalidArtist"));
    return artist(aid, langOf(req));
  });

  app.get("/api/albums/:alid", async (req) => {
    const { alid } = req.params as { alid: string };
    if (!ALBUM_ID.test(alid)) throw new HttpError(400, msg("invalidAlbum"));
    return album(alid, langOf(req));
  });

  app.get("/api/search/albums", async (req) => {
    const { q } = req.query as { q?: string };
    return { albums: await searchAlbums(query(q), langOf(req)) };
  });

  /** The music video for a song, so "Vídeo" mode can show the clip instead of a still cover. */
  app.get("/api/video-for/:id", async (req) => {
    const { title, artist, duration } = req.query as { title?: string; artist?: string; duration?: string };
    if (!title?.trim()) throw new HttpError(400, msg("missingTitle"));
    const track = await findVideoFor(videoId(req.params), title.slice(0, 200), (artist ?? "").slice(0, 200), Number(duration) || 0);
    return { track };
  });

  // Playback

  /** Resolves stream URLs ahead of time so the next track starts instantly. */
  app.post("/api/prepare/:id", async (req) => {
    const { kind } = req.query as { kind?: string };
    const r = await resolveStreams(videoId(req.params), kind === "video" ? "video" : "audio");
    return { id: r.id, title: r.title, duration: r.duration, hasSdVideo: !!r.video };
  });

  app.get("/api/stream/:id/audio", (req, reply) => proxyStream(req, reply, videoId(req.params), "audio"));

  app.get("/api/stream/:id/video", async (req, reply) => {
    const id = videoId(req.params);
    const { q } = req.query as { q?: string };
    if (q === "hd") return serveFile(req, reply, await downloadHd(id), "video/mp4");
    const resolved = await resolveStreams(id);
    if (!resolved.video) return serveFile(req, reply, await downloadHd(id), "video/mp4");
    return proxyStream(req, reply, id, "video");
  });

  // Library

  app.get("/api/library", () => library.getLibrary());

  /** Restores a backup file exported by any Musike instance. Big libraries need more than the 1 MB default body. */
  app.post("/api/library/import", { bodyLimit: 25 * 1024 * 1024 }, async (req) => {
    const body = (req.body ?? {}) as { backup?: { format?: unknown; version?: unknown; library?: unknown }; mode?: unknown };
    const backup = body.backup;
    if (backup?.format !== "musike-backup") throw new HttpError(400, msg("notBackup"));
    if (typeof backup.version !== "number" || backup.version > 1) {
      throw new HttpError(400, msg("newerBackup"));
    }
    return library.importLibrary(backup.library, body.mode === "replace" ? "replace" : "merge");
  });

  app.put("/api/favorites/:id", async (req) => {
    const track = library.sanitizeTrack(req.body);
    if (track.id !== videoId(req.params)) throw new HttpError(400, msg("idMismatch"));
    return { favorites: await library.addFavorite(track) };
  });

  /** Bulk add, e.g. from the list search. */
  app.post("/api/favorites", async (req) => {
    const { tracks } = (req.body ?? {}) as { tracks?: unknown };
    if (!Array.isArray(tracks)) throw new HttpError(400, msg("tracksRequired"));
    return { favorites: await library.addFavorites(tracks.slice(0, 500).map(library.sanitizeTrack)) };
  });

  app.delete("/api/favorites/:id", async (req) => ({ favorites: await library.removeFavorite(videoId(req.params)) }));

  app.post("/api/history", async (req) => ({ history: await library.pushHistory(library.sanitizeTrack(req.body)) }));

  app.post("/api/playlists", async (req) => {
    const body = (req.body ?? {}) as { name?: unknown; tracks?: unknown };
    const tracks = Array.isArray(body.tracks) ? body.tracks.slice(0, 500).map(library.sanitizeTrack) : [];
    return library.createPlaylist(typeof body.name === "string" ? body.name : "", tracks);
  });

  app.patch("/api/playlists/:pid", async (req) => {
    const { pid } = req.params as { pid: string };
    const { name } = (req.body ?? {}) as { name?: unknown };
    return library.renamePlaylist(pid, typeof name === "string" ? name : "");
  });

  app.delete("/api/playlists/:pid", async (req, reply) => {
    await library.deletePlaylist((req.params as { pid: string }).pid);
    return reply.code(204).send();
  });

  /** One track, or `{ tracks: [...] }` to add many at once. */
  app.post("/api/playlists/:pid/tracks", async (req) => {
    const body = (req.body ?? {}) as { tracks?: unknown };
    const tracks = Array.isArray(body.tracks) ? body.tracks.slice(0, 500).map(library.sanitizeTrack) : library.sanitizeTrack(req.body);
    return library.addToPlaylist((req.params as { pid: string }).pid, tracks);
  });

  app.delete("/api/playlists/:pid/tracks/:id", async (req) =>
    library.removeFromPlaylist((req.params as { pid: string }).pid, videoId(req.params)),
  );

  // Web app (production build)

  if (existsSync(config.webDist)) {
    // Wildcard mode resolves files per request, so rebuilding the web app never needs a server restart.
    await app.register(fastifyStatic, { root: config.webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api/")) return reply.sendFile("index.html");
      reply.code(404).send({ error: tr(langOf(req), msg("routeNotFound")) });
    });
  }

  const host = opts.host ?? config.host;
  const preferred = opts.port ?? config.port;
  const port = opts.portFallback ? await freePort(preferred, host) : preferred;
  await app.listen({ port, host });

  pruneCache().catch(() => {});
  return { port, tools: found, close: () => app.close() };
}

/** First free port from `start` (up to 10 tries), so a second copy or a dev server doesn't block launch. */
async function freePort(start: number, host: string): Promise<number> {
  for (let port = start; port < start + 10; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = createServer()
        .once("error", () => resolve(false))
        .once("listening", () => probe.close(() => resolve(true)))
        .listen(port, host);
    });
    if (free) return port;
  }
  throw new HttpError(500, msg("noFreePort", { from: start, to: start + 9 }));
}
