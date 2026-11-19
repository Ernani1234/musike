export class QueueError extends Error {
  constructor(public reason: "full" | "timeout" | "closed") { super(`Task queue ${reason}`); }
}

/** FIFO admission control; active slots are held until the underlying work actually settles. */
export class TaskQueue {
  private active = 0;
  private closed = false;
  private waiting: { cleanup: () => void; start: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  constructor(private concurrency: number, private capacity: number, private waitMs: number) {}

  run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    if (this.closed) return Promise.reject(new QueueError("closed"));
    if (this.active >= this.concurrency && this.waiting.length >= this.capacity) return Promise.reject(new QueueError("full"));
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        signal?.removeEventListener("abort", cancel);
        this.active++;
        Promise.resolve().then(work).then(resolve, reject).finally(() => {
          this.active--;
          const next = this.waiting.shift();
          if (next) { clearTimeout(next.timer); next.start(); }
        });
      };
      const cancel = () => {
        const i = this.waiting.findIndex((entry) => entry.start === start);
        if (i >= 0) { clearTimeout(this.waiting[i]!.timer); this.waiting.splice(i, 1); }
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (this.active < this.concurrency) return start();
      const item = { cleanup: () => signal?.removeEventListener("abort", cancel), start, reject, timer: setTimeout(() => {
        this.waiting = this.waiting.filter((entry) => entry !== item);
        signal?.removeEventListener("abort", cancel);
        reject(new QueueError("timeout"));
      }, this.waitMs) };
      this.waiting.push(item);
      signal?.addEventListener("abort", cancel, { once: true });
    });
  }

  close() {
    this.closed = true;
    for (const item of this.waiting.splice(0)) { clearTimeout(item.timer); item.cleanup(); item.reject(new QueueError("closed")); }
  }
}

/** Stop waiting without changing another consumer's underlying shared work. */
export function waitForSignal<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void work.catch(() => {}); return Promise.reject(new DOMException("Aborted", "AbortError")); }
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", cancel, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}
