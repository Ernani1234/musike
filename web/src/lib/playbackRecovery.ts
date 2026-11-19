import type { FailureKind } from "./playbackDiagnostics";
export const recoverableFailure = (failure?: FailureKind) => failure === "network" || failure === "timeout" || failure === "server";
/** Two attempts within one deadline. Never retry login/challenge or a cancelled queue. */
export async function requestRadio<T>(request: (signal: AbortSignal) => Promise<T>, signal: AbortSignal, delayMs = 750): Promise<T> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(18_000)]);
  for (let attempt = 0; ; attempt++) {
    try {
      if (deadline.aborted) throw new DOMException("Aborted", "AbortError");
      const work = request(deadline);
      return await new Promise<T>((resolve, reject) => {
        const cancel = () => reject(new DOMException("Aborted", "AbortError"));
        deadline.addEventListener("abort", cancel, { once: true });
        work.then(resolve, reject).finally(() => deadline.removeEventListener("abort", cancel));
      });
    } catch (error) {
      const failure = (error as { failure?: FailureKind }).failure;
      if (deadline.aborted && !signal.aborted) throw Object.assign(new DOMException("Timed out", "TimeoutError"), { failure: "timeout" });
      if (deadline.aborted || attempt >= 1 || !recoverableFailure(failure)) throw error;
      await new Promise<void>((resolve, reject) => {
        const cancel = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
        const timer = setTimeout(() => { deadline.removeEventListener("abort", cancel); resolve(); }, delayMs);
        deadline.addEventListener("abort", cancel, { once: true });
      });
    }
  }
}
