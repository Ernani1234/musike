import type { Track } from "./types";

const noArgs = new Set(["toggle", "next", "prev", "clearUpcoming", "toggleShuffle", "cycleRepeat"]);
function track(value: unknown): Track {
  if (!value || typeof value !== "object") throw new Error("Invalid playback track");
  const t = value as Track;
  if (typeof t.id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(t.id) || typeof t.title !== "string" || typeof t.artist !== "string") throw new Error("Invalid playback track");
  const text = (v: unknown) => typeof v === "string" ? v.slice(0, 2048) : "";
  return { id: t.id, title: text(t.title), artist: text(t.artist), album: text(t.album), duration: Number.isFinite(t.duration) ? Math.max(0, t.duration) : 0,
    thumb: text(t.thumb), art: text(t.art), kind: t.kind === "video" ? "video" : "song" };
}
/** Construct a data-only wire payload. React events/DOM nodes never cross this boundary. */
export function playbackCommand(action: string, input: unknown[]): { action: string; args: unknown[] } {
  if (noArgs.has(action)) return { action, args: [] };
  if (action === "playList") {
    if (!Array.isArray(input[0]) || !input[0].length) throw new Error("Invalid playback queue");
    const at = typeof input[1] === "number" && Number.isInteger(input[1]) ? input[1] : 0;
    if (at < 0 || at >= input[0].length) throw new Error("Invalid playback index");
    const start = Math.max(0, at - 100);
    return { action, args: [input[0].slice(start, start + 500).map(track), at - start] };
  }
  if (["playTrack", "playNext", "addToQueue", "startRadio"].includes(action)) return { action, args: [track(input[0])] };
  if (["removeAt", "jumpTo", "seek"].includes(action)) {
    const n = input[0];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || action !== "seek" && !Number.isInteger(n)) throw new Error("Invalid playback position");
    return { action, args: [n] };
  }
  if (action === "setAutoRadio" && typeof input[0] === "boolean") return { action, args: [input[0]] };
  throw new Error("Invalid playback command");
}
