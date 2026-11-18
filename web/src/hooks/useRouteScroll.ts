import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation, useNavigationType } from "react-router";
import { SessionCache } from "../lib/sessionCache";

/** Restore after deferred route/data layout; user input always takes over immediately. */
export function useRouteScroll(main: RefObject<HTMLElement | null>) {
  const location = useLocation();
  const navigation = useNavigationType();
  const positions = useRef(new SessionCache<string, number>(120));
  const entry = useRef(location.key);
  const restoring = useRef(false);
  const page = location.pathname + location.search;

  useEffect(() => {
    const el = main.current;
    if (!el) return;
    const save = () => { if (!restoring.current) positions.current.set(entry.current, el.scrollTop); };
    el.addEventListener("scroll", save, { passive: true });
    return () => el.removeEventListener("scroll", save);
  }, [main]);

  useLayoutEffect(() => {
    const el = main.current;
    const content = el?.firstElementChild;
    if (!el || !content) return;
    const target = navigation === "POP" ? positions.current.get(location.key) ?? 0 : 0;
    entry.current = location.key;
    restoring.current = true;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      restoring.current = false;
      observer.disconnect();
      mutations.disconnect();
      clearTimeout(timer);
      for (const type of events) el.removeEventListener(type, stop);
    };
    const restore = () => {
      if (stopped) return;
      if (!content.querySelector("[data-route-ready]") || content.querySelector("[data-route-loading]")) return;
      el.scrollTop = target;
      if (Math.abs(el.scrollTop - target) < 1) stop();
    };
    const events = ["wheel", "touchstart", "pointerdown", "keydown"];
    const observer = new ResizeObserver(restore);
    const mutations = new MutationObserver(restore);
    mutations.observe(content, { childList: true, subtree: true });
    observer.observe(content);
    el.scrollTop = 0;
    timer = setTimeout(stop, 5000);
    for (const type of events) el.addEventListener(type, stop, { passive: true });
    restore();
    return stop;
  }, [page, main]);
}
