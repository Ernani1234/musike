/** Upcoming queue entries, including the repeat-all wrap, without duplicating the current track. */
export function upcomingTracks<T extends { id: string }>(queue: T[], index: number, depth: number, repeat: string): T[] {
  if (repeat === "one" || !queue[index] || depth <= 0) return [];
  const ordered = [...queue.slice(index + 1), ...(repeat === "all" ? queue.slice(0, index) : [])];
  const seen = new Set([queue[index]!.id]);
  return ordered.filter((track) => { if (seen.has(track.id)) return false; seen.add(track.id); return true; }).slice(0, depth);
}
