import type { Track } from "./types";

const memo = new WeakMap<readonly Track[], ReadonlySet<string>>();
/** Frontend collection arrays are immutable; reuse membership indexes without retaining old arrays. */
export function trackIds(tracks: readonly Track[]): ReadonlySet<string> {
  let ids = memo.get(tracks);
  if (!ids) { ids = new Set(tracks.map((track) => track.id)); memo.set(tracks, ids); }
  return ids;
}
