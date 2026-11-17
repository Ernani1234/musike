import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import type { FastifyReply, FastifyRequest } from "fastify";
import { msg } from "./i18n.js";
import { HttpError } from "./types.js";
import { invalidate, resolveStreams, type StreamFormat } from "./ytdlp.js";

const PASS_HEADERS = ["content-length", "content-range", "accept-ranges", "last-modified"];

/**
 * A held-back URL answers 403 and then starts working, so a 403 is retried every half second: the track starts
 * as soon as YouTube serves it. Resolving again sooner would only return a new URL that is held back just the same.
 * A 403 is a tiny response on a kept-alive connection.
 *
 * yt-dlp's `available_at` isn't waited for as such: measured on a home connection, YouTube served the URL about
 * 2 s before the time it gave, and it also holds back URLs it gives no time for. It only stretches how long the
 * retries go on (past the usual 15 s, up to 60 s).
 */
const HOLD_POLL_MS = 500;
const HOLD_MIN_MS = 15_000;
const HOLD_MAX_MS = 60_000;

/** Until when a 403 is retried on this URL. */
function holdDeadline(fmt: StreamFormat): number {
  const now = Date.now();
  const announced = (fmt.availableAt ?? 0) + 5_000;
  return Math.min(Math.max(now + HOLD_MIN_MS, announced), now + HOLD_MAX_MS);
}

/**
 * Proxies a googlevideo stream, forwarding Range so the browser can seek natively.
 * googlevideo URLs are bound to the IP that resolved them, so the bytes must flow through this server.
 */
export async function proxyStream(req: FastifyRequest, reply: FastifyReply, id: string, kind: "audio" | "video") {
  const pick = async (fresh: boolean): Promise<StreamFormat> => {
    if (fresh) invalidate(id);
    const resolved = await resolveStreams(id);
    const fmt = kind === "audio" ? resolved.audio : resolved.video;
    if (!fmt) throw new HttpError(404, msg("noSdVideo"));
    return fmt;
  };

  const controller = new AbortController();
  reply.raw.on("close", () => {
    if (!reply.raw.writableFinished) controller.abort();
  });

  const request = async (fmt: StreamFormat) => {
    const headers: Record<string, string> = { ...fmt.headers };
    const range = req.headers.range;
    if (typeof range === "string") headers.Range = range;
    return fetch(fmt.url, { headers, signal: controller.signal });
  };

  /** Requests the URL, retrying while YouTube answers 403 (held back). */
  const fetchServed = async (fmt: StreamFormat) => {
    const started = Date.now();
    const deadline = holdDeadline(fmt);
    let res = await request(fmt);
    while (res.status === 403 && Date.now() < deadline) {
      await res.body?.cancel();
      await sleep(HOLD_POLL_MS, undefined, { signal: controller.signal });
      res = await request(fmt);
    }
    if (res.ok && Date.now() - started > 1_000) {
      req.log.info({ videoId: id, heldMs: Date.now() - started }, "YouTube held the stream back");
    }
    return res;
  };

  let fmt = await pick(false);
  let upstream = await fetchServed(fmt);
  // Expired or rejected URL: resolve again once.
  if (upstream.status === 403 || upstream.status === 410) {
    await upstream.body?.cancel();
    fmt = await pick(true);
    upstream = await fetchServed(fmt);
  }
  if (!upstream.ok || !upstream.body) {
    req.log.warn({ videoId: id, kind, status: upstream.status, format: fmt.formatId }, "YouTube refused the stream");
    throw new HttpError(502, msg("streamRefused", { status: upstream.status }), "maybe_outdated");
  }

  reply.code(upstream.status);
  reply.header("content-type", fmt.mime);
  reply.header("cache-control", "no-store");
  for (const h of PASS_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) reply.header(h, v);
  }
  if (!upstream.headers.get("accept-ranges")) reply.header("accept-ranges", "bytes");

  const body = Readable.fromWeb(upstream.body as any);
  body.on("error", () => body.destroy());
  return reply.send(body);
}

/** Serves a local file with byte-range support (used for cached HD video). */
export async function serveFile(req: FastifyRequest, reply: FastifyReply, file: string, mime: string) {
  const { size } = await stat(file);
  const range = typeof req.headers.range === "string" ? /bytes=(\d*)-(\d*)/.exec(req.headers.range) : null;

  reply.header("content-type", mime);
  reply.header("accept-ranges", "bytes");
  reply.header("cache-control", "no-store");

  if (!range) {
    reply.header("content-length", size);
    return reply.send(createReadStream(file));
  }

  let start = range[1] ? Number(range[1]) : NaN;
  let end = range[2] ? Number(range[2]) : size - 1;
  if (Number.isNaN(start)) {
    // suffix range: bytes=-N
    start = Math.max(0, size - end);
    end = size - 1;
  }
  end = Math.min(end, size - 1);
  if (start > end || start >= size) {
    reply.code(416).header("content-range", `bytes */${size}`);
    return reply.send();
  }

  reply.code(206);
  reply.header("content-range", `bytes ${start}-${end}/${size}`);
  reply.header("content-length", end - start + 1);
  return reply.send(createReadStream(file, { start, end }));
}
