import { playbackStage, safePlaybackFields, traceId, withPlaybackTrace, type PlaybackFields, type TraceContext } from "./playbackDiagnostics.js";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
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
import { downloadHd, pruneCache, resolveStreams, shutdownMedia } from "./ytdlp.js";
import { GoogleImport, registerGoogle, type GoogleOptions } from "./googleImport.js";
import { registerAdmin } from "./adminRoutes.js";
import { registerAccounts } from "./accountRoutes.js";
import { Accounts, type AccountOptions } from "./accounts.js";
import { trustedProxies } from "./proxy.js";
import { AudioCache, type AudioSourceOptions } from "./audioCache.js";
import { acquireFileLease } from "./cacheBudget.js";

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

/** Builds API and static routes without opening a socket, for startup and injection tests. */
export async function createApp(options: AccountOptions & { trustProxy?: string; google?: GoogleOptions; audio?: AudioSourceOptions; onPlaybackEvent?: (event: PlaybackFields) => void } = {}) {
  library.useLibraryStorage(fileStorage());
  const proxy = trustedProxies(options.trustProxy);
  const app = Fastify({ trustProxy: proxy.trust, logger: { level: process.env.LOG_LEVEL ?? "warn", serializers: { req: (request: { method?: string; url?: string; ip?: string }) => ({ method: request.method, path: request.url?.split("?")[0], ip: request.ip }) } } });
  const diagnostics = process.env.MUSIKE_PLAYBACK_DIAGNOSTICS === "true";
  const timingLog = app.log.child({ component: "playback" }, { level: diagnostics ? "info" : "warn" });
  const contexts = new WeakMap<object, { trace: TraceContext; started: number }>();
  app.addHook("onRequest", (req, reply, done) => {
    const id = traceId(req.headers["x-musike-trace"] ?? new URL(req.url, "http://local").searchParams.get("trace"));
    reply.header("x-musike-request-id", req.id); reply.header("x-musike-trace", id);
    const trace: TraceContext = { traceId: id, requestId: req.id, emit: (event) => {
      if (diagnostics) { if (options.onPlaybackEvent) options.onPlaybackEvent({ ...event, ip: req.realClientIp }); else timingLog.info({ event: "playback", ...event, ip: req.realClientIp }); }
      else if (event.stage?.endsWith("error") || event.status && event.status >= 500) timingLog.warn({ event: "playback", ...event, ip: req.realClientIp });
    } };
    contexts.set(req, { trace, started: Date.now() });
    reply.raw.once("close", () => { if (!reply.raw.writableFinished && /^\/api\/(stream|prepare|queue|radio|video-for)/.test(req.url)) withPlaybackTrace(trace, () => playbackStage("http.disconnected")); });
    withPlaybackTrace(trace, () => { if (/^\/api\/(stream|prepare|queue|radio|playback|video-for)/.test(req.url)) playbackStage("http.start"); done(); });
  });
  app.addHook("onResponse", async (req, reply) => {
    const context = contexts.get(req);
    if (context && /^\/api\/(stream|prepare|queue|radio|video-for)/.test(req.url)) withPlaybackTrace(context.trace, () => playbackStage("http.complete", { status: reply.statusCode, ms: Date.now() - context.started }));
  });
  const audioCache = new AudioCache(options.audio?.candidates, options.audio?.transport, (message) => app.log.debug(message));
  let accounts: Accounts | null = null;
  let google: GoogleImport | null = null;
  const streamFailures = new Map<string, { at: number; status: number; error: string; code?: string }>();
  const failureKey = (req: import("fastify").FastifyRequest, id: string) => `${req.musikeUser?.id ?? "legacy"}:${contexts.get(req)?.trace.traceId}:${id}`;
  const probeStream = (req: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply, id: string) => {
    if ((req.query as { probe?: string }).probe !== "1") return false;
    const key = failureKey(req, id); const failure = streamFailures.get(key);
    if (failure && Date.now() - failure.at < 60_000) reply.code(failure.status).send({ error: failure.error, code: failure.code });
    else { streamFailures.delete(key); reply.send({ ok: true }); }
    playbackStage("stream.probe", { videoId: id, status: failure?.status ?? 200 }); return true;
  };
  app.addHook("onClose", async () => { await google?.close(); await audioCache.close(); await accounts?.close(); });

  app.setErrorHandler((err, req, reply) => {
    const e = err as Error & { statusCode?: number };
    const status = e instanceof HttpError ? e.status : e.statusCode ?? 500;
    if (status >= 500) {
      app.log.error({ event: "request.error", status, path: req.routeOptions.url, ip: req.realClientIp });
      if (accounts) void accounts.audit(req.musikeUser?.id ?? null, "request.error", req.routeOptions.url ?? null, req.realClientIp, "error").catch(() => {});
    }
    // Musike's own errors are translated into the language the app asked for.
    const error = accounts && status >= 500 && !(e instanceof HttpError) ? "Request failed" : e instanceof HttpError ? tr(langOf(req), e.text) : e.message;
    if (req.routeOptions.url?.startsWith("/api/stream/") && /^[-\w]{11}$/.test((req.params as { id?: string })?.id ?? "")) {
      for (const [key, value] of streamFailures) if (Date.now() - value.at >= 60_000) streamFailures.delete(key);
      if (streamFailures.size >= 200) streamFailures.delete(streamFailures.keys().next().value!);
      streamFailures.set(failureKey(req, (req.params as { id: string }).id), { at: Date.now(), status, error, code: e instanceof HttpError ? e.code : undefined });
    }
    if (!reply.sent) reply.code(status).send({ error, code: e instanceof HttpError ? e.code : undefined });
  });

  try {
  accounts = await registerAccounts(app, options, proxy);
  await registerAdmin(app, accounts);
  google = accounts ? new GoogleImport(accounts, options.google) : null;
  registerGoogle(app, google); await google?.recover(); google?.schedule();
  } catch (error) { await app.close(); throw error; }
  const userLibrary = (req: import("fastify").FastifyRequest) => accounts && req.musikeUser ? accounts.library(req.musikeUser.id) : library;

  app.addHook("onSend", async (req, reply, payload) => { if (req.url.startsWith("/api/")) reply.header("cache-control", "no-store"); return payload; });

  app.get("/api/health", async () => ({ ok: true }));

  // System: yt-dlp status and one-click update

  app.get("/api/system", async (req) => {
    if (accounts && req.musikeUser?.role !== "admin") throw Object.assign(new Error("Administrator access required"), { statusCode: 403 });
    if (accounts) {
      await accounts.audit(req.musikeUser!.id, "admin.system.read", null, req.realClientIp);
      app.log.child({ component: "audit" }, { level: "info" }).info({ event: "admin_action", actor: req.musikeUser!.id, action: "system.read", ip: req.realClientIp });
    }
    return systemInfo(langOf(req));
  });

  app.post("/api/system/ytdlp", async (req) => {
    if (accounts && req.musikeUser?.role !== "admin") throw Object.assign(new Error("Administrator access required"), { statusCode: 403 });
    if (accounts) { await accounts.audit(req.musikeUser!.id, "admin.ytdlp.update", null, req.realClientIp); app.log.child({ component: "audit" }, { level: "info" }).info({ event: "admin_action", actor: req.musikeUser!.id, action: "ytdlp.update", ip: req.realClientIp }); }
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

  app.get("/api/radio/:id", async (req, reply) => {
    const id = videoId(req.params);
    const controller = new AbortController(); reply.raw.once("close", () => { if (!reply.raw.writableFinished) controller.abort(); });
    playbackStage("radio.start", { videoId: id });
    try { const tracks = await radio(id, controller.signal); playbackStage("radio.complete", { items: tracks.length }); return { tracks }; }
    catch { playbackStage("radio.error", { reason: controller.signal.aborted ? "cancelled" : "timeout_or_provider" }); throw new HttpError(504, msg("radioTimeout")); }
  });

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
  app.get("/api/playback/settings", async () => ({ lookahead: config.lookahead, audioQuality: config.audioQuality, videoQuality: config.videoQuality, diagnostics }));
  const telemetryBuckets = new Map<string, { at: number; count: number }>();
  app.post("/api/playback/events", { bodyLimit: 16 * 1024, schema: { body: { type: "object", required: ["events"], additionalProperties: false,
    properties: { events: { type: "array", maxItems: 40, items: { type: "object", required: ["stage", "traceId", "at"], additionalProperties: false,
      properties: { traceId: { type: "string", pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$" }, stage: { type: "string", pattern: "^[A-Za-z0-9_.-]{1,50}$" },
        videoId: { type: "string", pattern: "^[A-Za-z0-9_-]{11}$" }, at: { type: "number" }, ms: { type: "number" }, status: { type: "integer" },
        edgeRay: { type: "string", pattern: "^[0-9a-fA-F]{16,32}-[A-Za-z]{3}$" }, reason: { type: "string", pattern: "^[A-Za-z0-9_-]{1,50}$" }, visibility: { type: "string", enum: ["visible", "hidden", "prerender", "unknown"] } } } } } } } }, async (req, reply) => {
    if (!diagnostics) return reply.code(204).send();
    const key = req.musikeUser?.id ?? req.realClientIp; const now = Date.now();
    for (const [id, bucket] of telemetryBuckets) if (now - bucket.at >= 60_000) telemetryBuckets.delete(id);
    if (!telemetryBuckets.has(key) && telemetryBuckets.size >= 128) return reply.code(429).send({ error: "Diagnostic capacity reached" });
    const bucket = telemetryBuckets.get(key) ?? { at: now, count: 0 }; const events = (req.body as { events: PlaybackFields[] }).events;
    if (bucket.count + events.length > 240) return reply.code(429).send({ error: "Diagnostic rate limit reached" });
    bucket.count += events.length; telemetryBuckets.set(key, bucket);
    for (const event of events) {
      const clean = { ...safePlaybackFields({ ...event, clientAt: event.at, at: now }), requestId: req.id, ip: req.realClientIp };
      if (options.onPlaybackEvent) options.onPlaybackEvent(clean); else timingLog.info({ event: "playback.client", ...clean });
    }
    return reply.code(204).send();
  });
  app.post("/api/queue/prepare", { schema: { body: {
    type: "object", required: ["clientId", "currentId", "upcomingIds"], additionalProperties: false,
    properties: { revision: { type: "integer", minimum: 0, maximum: 9007199254740991 }, clientId: { type: "string", pattern: "^[a-zA-Z0-9_-]{8,80}$" }, currentId: { type: "string", pattern: "^[a-zA-Z0-9_-]{11}$" },
      upcomingIds: { type: "array", maxItems: 100, items: { type: "string", pattern: "^[a-zA-Z0-9_-]{11}$" } } },
  } } }, async (req) => {
    const body = req.body as { clientId: string; currentId: string; upcomingIds: string[]; revision?: number };
    audioCache.update(`${req.musikeUser?.id ?? "legacy"}:${body.clientId}`, body.currentId, body.upcomingIds, config.lookahead, body.revision);
    const upcoming = [...new Set(body.upcomingIds)].filter((id) => id !== body.currentId).slice(0, config.lookahead);
    const readyIds = (await Promise.all(upcoming.map(async (id) => await audioCache.find(id) ? id : null))).filter((id): id is string => !!id);
    return { accepted: true, lookahead: config.lookahead, readyIds };
  });

  /** Resolves stream URLs ahead of time so the next track starts instantly. */
  app.post("/api/prepare/:id", async (req) => {
    const r = await resolveStreams(videoId(req.params));
    return { id: r.id, title: r.title, duration: r.duration, hasSdVideo: !!r.video };
  });

  app.get("/api/stream/:id/audio", async (req, reply) => {
    const id = videoId(req.params);
    if (probeStream(req, reply, id)) return reply;
    const release = await acquireFileLease(path.join(config.cacheDir, `${id}.audio.bin`));
    reply.raw.once("close", release); reply.raw.once("finish", release);
    const cached = await audioCache.find(id);
    if (cached) {
      return serveFile(req, reply, cached.file, cached.mime);
    }
    release();
    return proxyStream(req, reply, id, "audio", options.audio);
  });

  app.get("/api/stream/:id/video", async (req, reply) => {
    const id = videoId(req.params);
    if (probeStream(req, reply, id)) return reply;
    const release = await acquireFileLease(path.join(config.cacheDir, `${id}.720.mp4`));
    reply.raw.once("close", release); reply.raw.once("finish", release);
    const { q } = req.query as { q?: string };
    if (q === "hd") return serveFile(req, reply, await downloadHd(id), "video/mp4");
    const resolved = await resolveStreams(id);
    if (!resolved.video) return serveFile(req, reply, await downloadHd(id), "video/mp4");
    return proxyStream(req, reply, id, "video");
  });

  // Library

  app.get("/api/library", (req) => userLibrary(req).getLibrary());

  app.get("/api/library/tracks", {
    schema: { querystring: {
      type: "object",
      required: ["kind"],
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["favorites", "history", "playlist"] },
        pid: { type: "string", maxLength: 64 },
        offset: { type: "integer", minimum: 0, maximum: 1_000_000, default: 0 },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
        q: { type: "string", maxLength: 200, default: "" },
      },
    } },
  }, async (req) => {
    const { kind, pid = "", offset, limit, q } = req.query as {
      kind: "favorites" | "history" | "playlist"; pid?: string; offset: number; limit: number; q: string;
    };
    return userLibrary(req).getTrackPage(kind, pid, offset, limit, q);
  });

  /** Restores a backup file exported by any Musike instance. Big libraries need more than the 1 MB default body. */
  app.post("/api/library/import", { bodyLimit: 25 * 1024 * 1024 }, async (req) => {
    const body = (req.body ?? {}) as { backup?: { format?: unknown; version?: unknown; library?: unknown }; mode?: unknown };
    const backup = body.backup;
    if (backup?.format !== "musike-backup") throw new HttpError(400, msg("notBackup"));
    if (typeof backup.version !== "number" || backup.version > 1) {
      throw new HttpError(400, msg("newerBackup"));
    }
    return userLibrary(req).importLibrary(backup.library, body.mode === "replace" ? "replace" : "merge");
  });

  app.put("/api/favorites/:id", async (req) => {
    const track = library.sanitizeTrack(req.body);
    if (track.id !== videoId(req.params)) throw new HttpError(400, msg("idMismatch"));
    return { favorites: await userLibrary(req).addFavorite(track) };
  });

  /** Bulk add, e.g. from the list search. */
  app.post("/api/favorites", async (req) => {
    const { tracks } = (req.body ?? {}) as { tracks?: unknown };
    if (!Array.isArray(tracks)) throw new HttpError(400, msg("tracksRequired"));
    return { favorites: await userLibrary(req).addFavorites(tracks.slice(0, 500).map(library.sanitizeTrack)) };
  });

  app.delete("/api/favorites/:id", async (req) => ({ favorites: await userLibrary(req).removeFavorite(videoId(req.params)) }));

  app.post("/api/history", async (req) => ({ history: await userLibrary(req).pushHistory(library.sanitizeTrack(req.body)) }));

  app.post("/api/playlists", async (req) => {
    const body = (req.body ?? {}) as { name?: unknown; tracks?: unknown };
    const tracks = Array.isArray(body.tracks) ? body.tracks.slice(0, 500).map(library.sanitizeTrack) : [];
    return userLibrary(req).createPlaylist(typeof body.name === "string" ? body.name : "", tracks);
  });

  app.patch("/api/playlists/:pid", async (req) => {
    const { pid } = req.params as { pid: string };
    const { name } = (req.body ?? {}) as { name?: unknown };
    return userLibrary(req).renamePlaylist(pid, typeof name === "string" ? name : "");
  });

  app.delete("/api/playlists/:pid", async (req, reply) => {
    await userLibrary(req).deletePlaylist((req.params as { pid: string }).pid);
    return reply.code(204).send();
  });

  /** One track, or `{ tracks: [...] }` to add many at once. */
  app.post("/api/playlists/:pid/tracks", async (req) => {
    const body = (req.body ?? {}) as { tracks?: unknown };
    const tracks = Array.isArray(body.tracks) ? body.tracks.slice(0, 500).map(library.sanitizeTrack) : library.sanitizeTrack(req.body);
    return userLibrary(req).addToPlaylist((req.params as { pid: string }).pid, tracks);
  });

  app.delete("/api/playlists/:pid/tracks/:id", async (req) =>
    userLibrary(req).removeFromPlaylist((req.params as { pid: string }).pid, videoId(req.params)),
  );

  // Web app (production build)

  if (existsSync(config.webDist)) {
    // Wildcard mode resolves files per request, so rebuilding the web app never needs a server restart.
    await app.register(fastifyStatic, { root: config.webDist, setHeaders: (res, file) => {
      const name = path.relative(config.webDist, file).split(path.sep).join("/");
      if (/^assets\/.+-[\w-]{8,}\.[\w]+$/.test(name)) res.header("cache-control", "public, max-age=31536000, immutable");
      else res.header("cache-control", "no-cache");
    } });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api/")) return reply.sendFile("index.html");
      reply.code(404).send({ error: tr(langOf(req), msg("routeNotFound")) });
    });
  }

  return app;
}

/** Builds the Musike HTTP server (API + web app) and starts listening. */
export async function startServer(opts: StartOptions = {}): Promise<RunningServer> {
  const found = await refreshTools();
  const app = await createApp();
  const host = opts.host ?? config.host;
  const preferred = opts.port ?? config.port;
  const port = opts.portFallback ? await freePort(preferred, host) : preferred;
  await app.listen({ port, host });

  pruneCache().catch(() => {});
  const address = app.server.address();
  return { port: typeof address === "object" && address ? address.port : port, tools: found,
    close: async () => { shutdownMedia(); await app.close(); } };
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
