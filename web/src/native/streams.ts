import { Capacitor } from "@capacitor/core";
import { DEFAULT_CLIENTS, directAudio, fetchRemoteClients, validClients, type DirectAudio } from "../../../server/src/directAudio";
import { msg, tr } from "../../../server/src/i18n";
import { getLang } from "../i18n";
import { ApiError } from "../lib/apiTypes";
import { config } from "./shims/config";
import { nativeResolverAvailable, resolveNatively } from "./ytplayer";

/**
 * Resolves a track's audio on the phone, the job yt-dlp does on the server. On iOS the app's native side asks first
 * (ios/App/App/MusikeYouTube.swift); otherwise, and as iOS's fallback, the audio comes straight from YouTube's API
 * (server/src/directAudio.ts). Each platform's list of clients can be updated remotely (mobile/streaming.json); the
 * last one received is kept.
 */

const ios = Capacitor.getPlatform() === "ios";
// On iOS VISIONOS is bot-checked from the web view while the IOS client still answers; Android uses the client
// yt-dlp itself relies on.
const PLATFORM_CLIENTS = ios ? ["IOS", "VISIONOS"] : DEFAULT_CLIENTS;
const REMOTE_KEY = ios ? "ios" : "clients";
const CLIENTS_KEY = ios ? "musike:stream-clients-ios" : "musike:stream-clients";

const cache = new Map<string, DirectAudio>();
const inflight = new Map<string, Promise<DirectAudio>>();

function storedClients(): string[] {
  try {
    return validClients(JSON.parse(localStorage.getItem(CLIENTS_KEY) ?? "null")) ?? PLATFORM_CLIENTS;
  } catch {
    return PLATFORM_CLIENTS;
  }
}

let clients = storedClients();

// Pick up a newer client list in the background; the stored one (or the default) is used meanwhile.
void fetchRemoteClients(REMOTE_KEY).then((remote) => {
  if (!remote) return;
  clients = remote;
  try {
    localStorage.setItem(CLIENTS_KEY, JSON.stringify(remote));
  } catch {
    /* storage unavailable: keep it for this session */
  }
});

/** iOS: the native resolver, or null to fall back to the in-app clients. */
async function resolveOnIos(id: string): Promise<DirectAudio | null> {
  if (!nativeResolverAvailable()) return null;
  try {
    const r = await resolveNatively(id, getLang(), config.location);
    if (r.error || !r.url) return null;
    const expire = Number(new URL(r.url).searchParams.get("expire")) * 1000;
    return {
      url: r.url,
      mime: r.mime || "audio/mp4",
      title: r.title,
      duration: r.duration,
      expiresAt: expire || Date.now() + 3 * 3600_000,
    };
  } catch {
    return null;
  }
}

async function resolve(id: string): Promise<DirectAudio> {
  const native = await resolveOnIos(id);
  if (native) {
    cache.set(id, native);
    return native;
  }
  try {
    const resolved = await directAudio(id, clients, getLang());
    cache.set(id, resolved);
    return resolved;
  } catch (e) {
    throw new ApiError(404, (e as Error).message || tr(getLang(), msg("noAudio")));
  }
}

/** A track's stream, from cache while its URL is still good for a minute or more. */
export function resolveAudio(id: string): Promise<DirectAudio> {
  const hit = cache.get(id);
  if (hit && hit.expiresAt - Date.now() > 60_000) return Promise.resolve(hit);
  let job = inflight.get(id);
  if (!job) {
    job = resolve(id).finally(() => inflight.delete(id));
    inflight.set(id, job);
  }
  return job;
}

/** Forgets the stream behind a URL that stopped working, so the next try resolves a fresh one. */
export function forgetUrl(url: string) {
  for (const [id, r] of cache) if (r.url === url) cache.delete(id);
}
