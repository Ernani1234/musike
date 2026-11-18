export class QueueError extends Error {
  constructor(public reason: "full" | "timeout" | "closed") { super(`Task queue ${reason}`); }
}

/** FIFO admission control; active slots are held until the underlying work actually settles. */
export class TaskQueue {
  private active = 0;
  private closed = false;
  private waiting: { start: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  constructor(private concurrency: number, private capacity: number, private waitMs: number) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new QueueError("closed"));
    if (this.active >= this.concurrency && this.waiting.length >= this.capacity) return Promise.reject(new QueueError("full"));
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active++;
        Promise.resolve().then(work).then(resolve, reject).finally(() => {
          this.active--;
          const next = this.waiting.shift();
          if (next) { clearTimeout(next.timer); next.start(); }
        });
      };
      if (this.active < this.concurrency) return start();
      const item = { start, reject, timer: setTimeout(() => {
        this.waiting = this.waiting.filter((entry) => entry !== item);
        reject(new QueueError("timeout"));
      }, this.waitMs) };
      this.waiting.push(item);
    });
  }

  close() {
    this.closed = true;
    for (const item of this.waiting.splice(0)) { clearTimeout(item.timer); item.reject(new QueueError("closed")); }
  }
}
