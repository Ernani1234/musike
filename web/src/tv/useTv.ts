import { useEffect, useState } from "react";
import { isTvMode } from "./tvMode";

const read = () => typeof document !== "undefined" && isTvMode();

/** True while the 10-foot TV UI is on. Also flips when TV mode is guessed from the first remote key press. */
export function useTvMode(): boolean {
  const [tv, setTv] = useState(read);

  useEffect(() => {
    if (tv) return;
    const sync = () => read() && setTv(true);
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tv"] });
    // The device check can answer between the first render and this effect, and that change would be missed.
    sync();
    return () => obs.disconnect();
  }, [tv]);

  return tv;
}
