import type { Track } from "./types";

export interface SavedPlayer {
  queue: Track[];
  original: Track[] | null;
  index: number;
  position: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  preferVideo: boolean;
  quality: "sd" | "hd";
  autoRadio: boolean;
}

/** Preserve the existing one-key JSON format while serializing track arrays only when they change. */
export function playerWriter(storage: Pick<Storage, "setItem">, key: string) {
  let queue: Track[] | undefined;
  let original: Track[] | null | undefined;
  let start = -1;
  let queueJson = "[]";
  let originalJson = "null";
  let last = "";
  return (state: SavedPlayer) => {
    const windowStart = Math.max(0, state.index - 499);
    if (queue !== state.queue || original !== state.original || start !== windowStart) {
      const tracks = state.queue.slice(windowStart, windowStart + 500);
      const counts = new Map<string, number>();
      for (const track of tracks) counts.set(track.id, (counts.get(track.id) ?? 0) + 1);
      const order = state.original?.filter((track) => {
        const count = counts.get(track.id) ?? 0;
        if (!count) return false;
        counts.set(track.id, count - 1);
        return true;
      }) ?? null;
      queueJson = JSON.stringify(tracks);
      originalJson = JSON.stringify(order);
      queue = state.queue;
      original = state.original;
      start = windowStart;
    }
    const small = JSON.stringify({ index: state.index - windowStart, position: state.position, volume: state.volume,
      muted: state.muted, shuffle: state.shuffle, repeat: state.repeat, preferVideo: state.preferVideo,
      quality: state.quality, autoRadio: state.autoRadio });
    const json = `{"queue":${queueJson},"original":${originalJson},${small.slice(1)}`;
    if (json === last) return;
    storage.setItem(key, json);
    last = json;
  };
}
