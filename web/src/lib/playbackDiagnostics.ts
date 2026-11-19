export type FailureKind = "authentication" | "edge_challenge" | "unexpected_response" | "timeout" | "network" | "server";
export interface PlaybackEvent { traceId: string; stage: string; at: number; videoId?: string; status?: number; ms?: number; reason?: string; visibility?: string; edgeRay?: string; }
const events: PlaybackEvent[] = [];
let activeTrace = ""; let enabled = false;
let sender: ((events: PlaybackEvent[]) => Promise<void>) | null = null;
let cursor = 0; let flushing = false; let lastFlush = 0;
export const playbackTrace = () => activeTrace;
export function beginPlaybackTrace(id?: string) {
  activeTrace = id ?? crypto.randomUUID(); return activeTrace;
}
export function recordPlayback(stage: string, fields: Partial<Omit<PlaybackEvent, "stage" | "at">> = {}) {
  const event: PlaybackEvent = { traceId: fields.traceId || activeTrace || beginPlaybackTrace(), stage, at: Date.now() };
  if (fields.edgeRay && /^[0-9a-f]{16,32}-[A-Z]{3}$/i.test(fields.edgeRay)) event.edgeRay = fields.edgeRay;
  if (fields.videoId && /^[\w-]{11}$/.test(fields.videoId)) event.videoId = fields.videoId;
  for (const key of ["status", "ms"] as const) if (Number.isFinite(fields[key])) event[key] = fields[key];
  if (fields.reason && /^[\w-]{1,50}$/.test(fields.reason)) event.reason = fields.reason;
  event.visibility = typeof document === "undefined" ? "unknown" : document.visibilityState;
  events.push(event); if (events.length > 200) { events.shift(); cursor = Math.max(0, cursor - 1); }
  if (enabled) console.debug("[musike-playback]", event);
  if (enabled && Date.now() - lastFlush > 5000 && stage !== "http.start") void flushPlaybackEvents();
}
export const playbackEvents = () => events.map((event) => ({ ...event }));
export function configurePlaybackDiagnostics(on: boolean, send: (events: PlaybackEvent[]) => Promise<void>) { enabled = on; sender = send; }
export async function flushPlaybackEvents() {
  if (!enabled || !sender || flushing || cursor >= events.length) return;
  flushing = true; lastFlush = Date.now();
  const batch = events.slice(cursor, cursor + 40); const last = batch.at(-1);
  try { await sender(batch); const at = events.indexOf(last!); if (at >= 0) cursor = at + 1; }
  catch { /* Retain the bounded ring for retry/export when connectivity returns. */ }
  finally { flushing = false; }
}
export function responseFailure(response: Pick<Response, "status" | "redirected" | "headers"> & { type?: string }): FailureKind | null {
  const type = response.headers.get("content-type") ?? "";
  if (response.type === "opaqueredirect" || response.status === 401 || response.redirected && !type.includes("json")) return "authentication";
  if (response.headers.get("cf-mitigated") === "challenge") return "edge_challenge";
  if (response.status >= 500) return "server";
  if (type.includes("text/html")) return "unexpected_response";
  return null;
}
