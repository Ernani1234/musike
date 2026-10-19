/**
 * Android TV mode: 10-foot UI plus D-pad spatial navigation.
 *
 * Turned on automatically when the Android app runs on a TV (web/src/native/android.ts), by VITE_TV=1 at build
 * time, or by opening the app with ?tv=1 (handy for trying it in a browser). Everywhere else it stays off.
 *
 * Rules: geometry in document space (rails stay navigable when an item is scrolled out), candidates
 * overlapping the current element on the other axis win, the nearest scrollable ancestor is scrolled
 * just enough to reveal the target, and key auto-repeat is throttled so a held arrow moves one step.
 */

const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
  '[role="slider"]',
  "[data-tv-focusable]",
].join(",");

const REPEAT_MS = 90;
let lastMove = 0;

export function isTvMode(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).has("tv")) return true;
  if (import.meta.env.VITE_TV === "1") return true;
  return document.documentElement.dataset.tv === "1";
}

function shown(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const r = el.getBoundingClientRect();
  return r.width >= 4 && r.height >= 4;
}

/** On screen, even while still transparent: dialogs open with a fade-in, and must count from the first frame. */
function present(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const r = el.getBoundingClientRect();
  return r.width >= 4 && r.height >= 4;
}

/** The topmost open dialog, sheet or menu, if any. While one is open the D-pad stays inside it. */
function activeDialog(): HTMLElement | null {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"], dialog[open], [role="menu"]'),
  ).filter(present);
  return nodes.length ? nodes[nodes.length - 1] : null;
}

function focusables(): HTMLElement[] {
  const scope: ParentNode = activeDialog() ?? document;
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(shown);
}

function box(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return {
    left: r.left + window.scrollX,
    top: r.top + window.scrollY,
    width: r.width,
    height: r.height,
    cx: r.left + window.scrollX + r.width / 2,
    cy: r.top + window.scrollY + r.height / 2,
  };
}

function scrollableAncestor(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const s = getComputedStyle(node);
    const canY = /(auto|scroll|overlay)/.test(s.overflowY) && node.scrollHeight > node.clientHeight + 4;
    const canX = /(auto|scroll|overlay)/.test(s.overflowX) && node.scrollWidth > node.clientWidth + 4;
    if (canX || canY) return node;
    node = node.parentElement;
  }
  return null;
}

function reveal(el: HTMLElement) {
  const scroller = scrollableAncestor(el);
  if (!scroller) {
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    return;
  }
  const s = scroller.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const margin = 24;
  let dx = 0;
  let dy = 0;
  if (r.left < s.left + margin) dx = r.left - s.left - margin;
  else if (r.right > s.right - margin) dx = r.right - s.right + margin;
  if (r.top < s.top + margin) dy = r.top - s.top - margin;
  else if (r.bottom > s.bottom - margin) dy = r.bottom - s.bottom + margin;
  if (dx || dy) scroller.scrollBy({ left: dx, top: dy, behavior: "smooth" });
}

function move(direction: "left" | "right" | "up" | "down"): boolean {
  const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const from = current && shown(current) ? box(current) : null;
  const horizontal = direction === "left" || direction === "right";
  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const el of focusables()) {
    if (el === current) continue;
    const to = box(el);
    const primary = !from
      ? (horizontal ? to.cx : to.cy)
      : horizontal
        ? direction === "right"
          ? to.left - (from.left + from.width)
          : from.left - (to.left + to.width)
        : direction === "down"
          ? to.top - (from.top + from.height)
          : from.top - (to.top + to.height);
    if (primary < -2) continue;

    let perp = 0;
    let overlap = 0;
    if (from) {
      const a1 = horizontal ? from.top : from.left;
      const a2 = horizontal ? from.top + from.height : from.left + from.width;
      const b1 = horizontal ? to.top : to.left;
      const b2 = horizontal ? to.top + to.height : to.left + to.width;
      overlap = Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
      perp = Math.abs((horizontal ? to.cy : to.cx) - (horizontal ? from.cy : from.cx));
    }

    const score = Math.max(primary, 0) + (overlap > 0 ? perp * 0.35 : perp * 2.6 + 400);
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (!best) return false;
  best.focus({ preventScroll: true });
  reveal(best);
  return true;
}

function activate(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || el === document.body) return false;
  if (el instanceof HTMLInputElement && /^(text|search|email|password)$/.test(el.type)) return false;
  el.click();
  return true;
}

let lastOutside: HTMLElement | null = null;

/** Focus the first control of a freshly opened dialog, and put focus back when it closes. */
function watchDialogs() {
  let current: HTMLElement | null = null;
  const sync = () => {
    const dialog = activeDialog();
    if (dialog === current) return;
    if (dialog) {
      lastOutside = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      current = dialog;
      window.setTimeout(() => {
        const first = focusables()[0];
        if (first) first.focus({ preventScroll: true });
      }, 60);
    } else {
      current = null;
      if (lastOutside && document.contains(lastOutside)) lastOutside.focus({ preventScroll: true });
      lastOutside = null;
    }
  };
  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
  sync();
}

let installed = false;

export function installTvMode() {
  if (installed || !isTvMode()) return;
  installed = true;
  document.documentElement.dataset.tv = "1";

  window.addEventListener(
    "keydown",
    (event) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      const key = event.key;
      const handled = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
        if (typing) return;
        const now = performance.now();
        if (event.repeat && now - lastMove < REPEAT_MS) {
          handled();
          return;
        }
        lastMove = now;
        if (move(key.replace("Arrow", "").toLowerCase() as "left" | "right" | "up" | "down")) handled();
        return;
      }

      if (key === "Escape" || key === "BrowserBack" || key === "GoBack") {
        // A dialog or a menu is open: the app's own Escape handler closes it (and nothing else).
        const overlay = [...document.querySelectorAll<HTMLElement>("[data-escape-closes]")].some(shown);
        if (activeDialog() || overlay) return;
        if (window.history.length > 1) {
          handled();
          window.history.back();
        }
        return;
      }

      if ((key === "Enter" || key === " ") && !typing) {
        if (document.activeElement instanceof HTMLButtonElement) return;
        if (activate()) handled();
      }
    },
    { capture: true },
  );

  watchDialogs();

  // The first page renders after its data arrives, so keeping only one attempt can leave the focus on <body>.
  const focusFirst = (attempt: number) => {
    const els = focusables();
    if (document.activeElement === document.body && els.length) els[0].focus({ preventScroll: true });
    if (attempt < 3 && document.activeElement === document.body) window.setTimeout(() => focusFirst(attempt + 1), 700);
  };
  window.setTimeout(() => focusFirst(0), 350);
}

/**
 * Last resort for a TV that doesn't say it is one (Fire TV reports the phone UI mode on some models): the first
 * D-pad key press is proof enough, so the 10-foot UI turns on then.
 */
export function installTvModeOnRemoteUse() {
  if (installed) return;
  window.addEventListener(
    "keydown",
    (event) => {
      if (installed) return;
      if (!/^(Arrow|Enter|GoBack|BrowserBack)/.test(event.key)) return;
      document.documentElement.dataset.tv = "1";
      installTvMode();
    },
    { capture: true },
  );
}
