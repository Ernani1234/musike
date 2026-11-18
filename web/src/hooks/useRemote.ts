import { useEffect, useState } from "react";
import { SessionCache } from "../lib/sessionCache";

export type Remote<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error"; message: string };

// Session memo, so going back from an artist to its genre shows the page instantly.
const memo = new SessionCache<string, unknown>(60, 30 * 60_000);

/** Reuses session results for up to 30 minutes; retry invalidates the current key. */
export function useRemote<T>(key: string, load: (signal: AbortSignal) => Promise<T>): Remote<T> & { retry: () => void } {
  const initial = (): Remote<T> => memo.has(key) ? { status: "ok", data: memo.get(key) as T } : { status: "loading" };
  const [state, setState] = useState<{ key: string; value: Remote<T> }>(() => ({ key, value: initial() }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const update = (value: Remote<T>) => setState({ key, value });
    if (memo.has(key)) return update({ status: "ok", data: memo.get(key) as T });
    const ctrl = new AbortController();
    update({ status: "loading" });
    load(ctrl.signal)
      .then((data) => {
        if (ctrl.signal.aborted) return;
        memo.set(key, data);
        update({ status: "ok", data });
      })
      .catch((e: Error) => !ctrl.signal.aborted && e.name !== "AbortError" && update({ status: "error", message: e.message }));
    return () => ctrl.abort();
  }, [key, attempt]);

  return { ...(state.key === key ? state.value : initial()), retry: () => { memo.delete(key); setAttempt((n) => n + 1); } };
}
