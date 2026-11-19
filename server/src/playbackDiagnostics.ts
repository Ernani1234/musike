import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type PlaybackFields = { traceId?: string; requestId?: string; stage?: string; videoId?: string; ms?: number; status?: number;
  warm?: boolean; bytes?: number; items?: number; source?: string; reason?: string; outcome?: string; ip?: string; visibility?: string; edgeRay?: string; at?: number; clientAt?: number };
export type TraceContext = { traceId: string; requestId: string; emit: (event: PlaybackFields) => void };
const traces = new AsyncLocalStorage<TraceContext>();
export const validTrace = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const traceId = (value?: unknown) => validTrace(value) ? value : randomUUID();
export const withPlaybackTrace = <T>(context: TraceContext, work: () => T): T => traces.run(context, work);
/** Allowlist fields: never serialize provider errors, URLs, headers, cookies, titles or credentials. */
export function safePlaybackFields(input: PlaybackFields): PlaybackFields {
  const out: Record<string, unknown> = {};
  for (const key of ["traceId", "requestId", "stage", "source", "reason", "outcome", "ip", "visibility"] as const) {
    const value = input[key]; if (typeof value === "string" && /^[\w.:/-]{1,100}$/.test(value)) out[key] = value;
  }
  if (typeof input.edgeRay === "string" && /^[0-9a-f]{16,32}-[A-Z]{3}$/i.test(input.edgeRay)) out.edgeRay = input.edgeRay;
  if (typeof input.videoId === "string" && /^[\w-]{11}$/.test(input.videoId)) out.videoId = input.videoId;
  for (const key of ["ms", "status", "bytes", "items", "at", "clientAt"] as const) if (typeof input[key] === "number" && Number.isFinite(input[key])) out[key] = Math.max(0, input[key]!);
  if (typeof input.warm === "boolean") out.warm = input.warm;
  return out as PlaybackFields;
}
export function playbackStage(stage: string, fields: PlaybackFields = {}) {
  const context = traces.getStore(); if (!context) return;
  context.emit(safePlaybackFields({ ...fields, stage, at: Date.now(), traceId: context.traceId, requestId: context.requestId }));
}
