import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

export const MD = "(min-width: 768px)";
export const XL = "(min-width: 1280px)";
/** A touch screen (the phone app, phone browsers) rather than a mouse: long presses instead of right clicks. */
export const TOUCH = "(hover: none)";
