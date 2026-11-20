import type { Track } from "./types";

/** Loading retains play intent across track changes; an explicit pause always wins. */
export function mediaPlaybackState(status: string, wantsPlay: boolean, hasTrack: boolean): MediaSessionPlaybackState {
  if (!hasTrack || status === "idle") return "none";
  return wantsPlay && (status === "playing" || status === "loading") ? "playing" : "paused";
}
export function mediaMetadata(track: Track): MediaMetadataInit {
  const artwork = [...new Set([track.art, track.thumb])].filter(src => {
    try { return !!src && ["https:", "http:"].includes(new URL(src).protocol); } catch { return false; }
  }).map(src => ({ src }));
  return { title: track.title, artist: track.artist, album: track.album ?? "", artwork };
}
export function registerMediaActions(session: MediaSession, player: () => { status: string; position: number; toggle: () => void; next: () => void; prev: () => void; seek: (n: number) => void }) {
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ["play", () => { if (!["playing", "loading"].includes(player().status)) player().toggle(); }],
    ["pause", () => { if (["playing", "loading"].includes(player().status)) player().toggle(); }],
    ["previoustrack", () => player().prev()], ["nexttrack", () => player().next()],
    ["seekto", d => { if (d.seekTime != null) player().seek(d.seekTime); }],
    ["seekbackward", d => player().seek(Math.max(0, player().position - (d.seekOffset ?? 10)))],
    ["seekforward", d => player().seek(player().position + (d.seekOffset ?? 10))],
  ];
  for (const [action, handler] of handlers) { try { session.setActionHandler(action, handler); } catch {} }
}
