import { recordPlayback, responseFailure } from "./playbackDiagnostics";

/** One complete next-track body; independent of the browser's advisory media preload budget. */
export class PlaybackPreload {
  private pending: { id: string; controller: AbortController } | null = null;
  private ready: { id: string; url: string; trace: string } | null = null;
  private target: string | undefined;
  private attempts = 0;
  constructor(private transport: typeof fetch = fetch, private limit = 16 * 1024 * 1024) {}
  retain(id?: string) {
    if (id !== this.target) { this.target = id; this.attempts = 0; }
    if (this.pending && this.pending.id !== id) { this.pending.controller.abort(); this.pending = null; }
    if (this.ready && this.ready.id !== id) { URL.revokeObjectURL(this.ready.url); this.ready = null; }
  }
  take(id: string) {
    if (this.ready?.id !== id) return null;
    const result = this.ready; this.ready = null; return result;
  }
  clear() { this.retain(); }
  async prepare(id: string, source: string, trace: string) {
    if (this.ready?.id === id || this.pending?.id === id) return;
    this.retain(id); if (this.attempts >= 2) return; this.attempts++;
    const controller = new AbortController(); const job = { id, controller }; this.pending = job;
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await this.transport(source, { credentials: "same-origin", redirect: "manual", signal: controller.signal });
      const failure = responseFailure(response);
      if (!response.ok || failure || !response.body || !response.headers.get("content-type")?.startsWith("audio/")) throw new Error(failure || "response");
      if (Number(response.headers.get("content-length")) > this.limit) throw new Error("size_limit");
      const reader = response.body.getReader(); const chunks: Uint8Array<ArrayBuffer>[] = []; let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          bytes += value.byteLength; if (bytes > this.limit) throw new Error("size_limit");
          chunks.push(new Uint8Array(value));
        }
      } finally { await reader.cancel().catch(() => {}); }
      if (!bytes || controller.signal.aborted || this.pending !== job) return;
      this.ready = { id, trace, url: URL.createObjectURL(new Blob(chunks, { type: response.headers.get("content-type")! })) };
      recordPlayback("player.preload_complete", { videoId: id, traceId: trace });
    } catch { recordPlayback("player.preload_incomplete", { videoId: id, traceId: trace, reason: controller.signal.aborted ? "cancelled" : "network_or_limit" }); }
    finally { clearTimeout(timeout); if (this.pending === job) this.pending = null; }
  }
}
