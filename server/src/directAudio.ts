import type { Lang } from "./i18n.js";
import { text, withClient } from "./search.js";

/**
 * A track's audio asked straight from YouTube's API, without yt-dlp. The Android app plays it this way, and the
 * server uses it first for audio, with yt-dlp as a fallback.
 *
 * YouTube only serves the first megabyte of a stream to most clients unless the request carries a proof-of-origin
 * token. A few clients don't need one; VISIONOS (the Apple Vision Pro app) is the one yt-dlp itself relies on, and
 * its URLs need no deciphering either. When YouTube changes that, the list of clients can be updated remotely
 * (mobile/streaming.json in the repository) without shipping a new version.
 */

export const DEFAULT_CLIENTS = ["VISIONOS"];
const REMOTE_CONFIG = "https://raw.githubusercontent.com/Ernani1234/musike/main/mobile/streaming.json";

export interface DirectAudio {
  url: string;
  mime: string;
  title: string;
  duration: number;
  /** When the URL stops working (ms). */
  expiresAt: number;
}

export const validClients = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === "string" && /^[A-Z_]{2,30}$/.test(c)) ? (v as string[]) : null;

/**
 * The client list published in the repository, or null when it can't be read. `clients` is the list for the server
 * and Android; a platform can have its own (`ios`).
 */
export async function fetchRemoteClients(key: "clients" | "ios" = "clients"): Promise<string[] | null> {
  try {
    const res = await fetch(REMOTE_CONFIG, { signal: AbortSignal.timeout(6000) });
    return validClients(((await res.json()) as Record<string, unknown>)[key]);
  } catch {
    return null; // offline or no config: keep what we have
  }
}

/** Tries each client in turn. Throws with YouTube's reason (or an empty message) when none of them has audio. */
export async function directAudio(id: string, clients: string[], lang?: Lang): Promise<DirectAudio> {
  let reason = "";
  for (const client of clients) {
    try {
      const info: any = await withClient((yt) => yt.getBasicInfo(id, { client: client as never }), lang);
      const status = info.playability_status;
      if (status?.status && status.status !== "OK") {
        reason = text(status.reason) || reason;
        continue;
      }
      const formats: any[] = [...(info.streaming_data?.adaptive_formats ?? []), ...(info.streaming_data?.formats ?? [])].filter(
        (f) => f.has_audio && !f.has_video && typeof f.url === "string",
      );
      // AAC (m4a) first: it plays everywhere. Highest bitrate within the same kind.
      const best = formats.sort(
        (a, b) => Number(b.mime_type?.startsWith("audio/mp4")) - Number(a.mime_type?.startsWith("audio/mp4")) || (b.bitrate ?? 0) - (a.bitrate ?? 0),
      )[0];
      if (!best) continue;
      const expire = Number(new URL(best.url).searchParams.get("expire")) * 1000;
      return {
        url: best.url,
        mime: best.mime_type?.startsWith("audio/webm") ? "audio/webm" : "audio/mp4",
        title: info.basic_info?.title ?? "",
        duration: info.basic_info?.duration ?? 0,
        expiresAt: expire || Date.now() + 3 * 3600_000,
      };
    } catch (e) {
      reason = (e as Error).message || reason;
    }
  }
  throw new Error(reason);
}
