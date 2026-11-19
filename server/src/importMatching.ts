import type { SourceTrack } from "./googleSource.js";
export interface SearchCandidate { id: string; title: string; channel?: string; uploader?: string; duration?: number; }
export interface ScoredCandidate extends SearchCandidate { score: number; reason: "original" | "confident" | "artist" | "version" | "duration" | "ambiguous" | "title"; }
/** Fold Latin accents without removing Japanese voicing marks; retain remix/live/cover distinctions. */
export const normalizeImportText = (value: string) => value.slice(0, 1000).normalize("NFKC").normalize("NFD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
  .normalize("NFC").toLowerCase().replace(/vevo$/i, " ").replace(/\b(?:official|music video|audio|lyrics?|topic|vevo)\b|公式(?:mv|動画)?/giu, " ")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 300);
function similarity(a: string, b: string) {
  if (!a || !b) return 0; if (a === b) return 1;
  const x = [...a]; const y = [...b]; let row = y.map((_, n) => n + 1); row.unshift(0);
  for (let i = 0; i < x.length; i++) { const next = [i + 1]; for (let j = 0; j < y.length; j++) next.push(Math.min(next[j]! + 1, row[j + 1]! + 1, row[j]! + (x[i] === y[j] ? 0 : 1))); row = next; }
  return 1 - row[y.length]! / Math.max(x.length, y.length);
}
const version = (text: string) => [...new Set((text.toLowerCase().match(/\b(?:remix|live|cover|instrumental|karaoke|slowed|nightcore|sped up)\b|歌ってみた|カバー|リミックス|ライブ/gu) ?? []))].sort().join("|");
const coreTitle = (text: string) => normalizeImportText(text.replace(/\b(?:feat\.?|ft\.?|featuring)\s+.*$/iu, ""));
export function rankImportCandidates(source: SourceTrack, candidates: SearchCandidate[]): ScoredCandidate[] {
  const artist = normalizeImportText(source.artist); const title = coreTitle(source.title);
  const unique = new Set<string>();
  return candidates.filter((item) => /^[\w-]{11}$/.test(item.id)).map((item): ScoredCandidate => {
    if (item.id === source.id) return { ...item, score: 1, reason: "original" };
    const full = coreTitle(item.title); const withoutArtist = artist && full.startsWith(`${artist} `) ? full.slice(artist.length + 1) : artist && full.endsWith(` ${artist}`) ? full.slice(0, -artist.length - 1) : full;
    const titleScore = similarity(title, withoutArtist);
    const channel = normalizeImportText(item.channel ?? item.uploader ?? "");
    const artistScore = artist ? Math.max(similarity(artist, channel), (` ${full} `).includes(` ${artist} `) ? 1 : 0) : 0;
    const versionOK = version(source.title) === version(item.title);
    const delta = source.duration && item.duration ? Math.abs(source.duration - item.duration) : null;
    const durationOK = delta === null || delta <= Math.max(6, source.duration! * .06);
    let score = .68 * titleScore + .25 * artistScore + .07 * (delta === null ? .8 : durationOK ? 1 : 0);
    const reason = !versionOK ? "version" : !durationOK ? "duration" : artistScore < .75 ? "artist" : titleScore < .9 ? "title" : "confident";
    if (reason !== "confident") score = Math.min(score, .84);
    return { ...item, score: Math.round(score * 1000) / 1000, reason };
  }).sort((a, b) => b.score - a.score).filter((item) => !unique.has(item.id) && !!unique.add(item.id)).slice(0, 5);
}
export function selectImportMatch(source: SourceTrack, candidates: SearchCandidate[]): SearchCandidate | null {
  const ranked = rankImportCandidates(source, candidates); const best = ranked[0];
  if (!best) return null;
  if (best.reason === "original") return best;
  return best.reason === "confident" && best.score >= .9 && (!ranked[1] || best.score - ranked[1].score >= .06) ? best : null;
}
