import { ArrowsInIcon, ArrowsOutIcon, ArrowsOutSimpleIcon, CornersInIcon, CornersOutIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { MD, useMediaQuery } from "../hooks/useMediaQuery";
import { useT } from "../i18n";
import { cn } from "../lib/format";
import { selectCurrent, usePlayer, useStatusText, videoEl } from "../player/player";
import { useUi } from "../stores/ui";
import { FavoriteButton, Scrubber, Transport, Volume } from "./Controls";
import { IconButton } from "./IconButton";

/**
 * One <video> element serves every place video can appear. It is re-parented into the highest-priority
 * mounted slot; moving a media element within the document does not interrupt playback.
 */
export const SLOT = { theater: 50, sheet: 30, panel: 20, floating: 5 } as const;

const slots = new Map<number, { el: HTMLElement; priority: number }>();
let seq = 0;

// Off-screen holder keeps the element rendered (not display:none) so browsers keep it playing.
const holder = document.createElement("div");
holder.setAttribute("aria-hidden", "true");
holder.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none;overflow:hidden";
document.body.appendChild(holder);
holder.appendChild(videoEl);

const useSlots = create<{ top: number }>(() => ({ top: 0 }));

function place() {
  const best = [...slots.values()].sort((a, b) => b.priority - a.priority)[0];
  const target = best?.el ?? holder;
  if (videoEl.parentElement !== target) target.appendChild(videoEl);
  useSlots.setState({ top: best?.priority ?? 0 });
}

const openTheater = () => useUi.getState().setTheater(true);

export function VideoSlot({
  priority,
  className,
  style,
  expandable,
}: {
  priority: number;
  className?: string;
  style?: CSSProperties;
  /** Offer a "maximize" button (and double-click) that opens the cinema view. */
  expandable?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const id = ++seq;
    slots.set(id, { el: ref.current!, priority });
    place();
    return () => {
      slots.delete(id);
      place();
    };
  }, [priority]);

  return (
    <div
      style={style}
      onDoubleClick={expandable ? openTheater : undefined}
      className={cn("group/video relative overflow-hidden bg-black", className)}
    >
      <div ref={ref} className="absolute inset-0" />
      {expandable && (
        <button
          type="button"
          onClick={openTheater}
          aria-label={t.video.maximize}
          title={t.video.maximizeKey}
          className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-[opacity,transform] duration-200 active:scale-90 md:opacity-0 md:group-hover/video:opacity-100 md:focus-visible:opacity-100"
        >
          <ArrowsOutIcon size={18} />
        </button>
      )}
    </div>
  );
}

/** Small floating player shown when video is playing but no larger video surface is on screen. */
export function FloatingVideo() {
  const isVideo = usePlayer((s) => s.mediaKind === "video" && s.queue.length > 0);
  const top = useSlots((s) => s.top);
  const t = useT();
  const isMd = useMediaQuery(MD);
  const show = isVideo && top < SLOT.panel;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          className={cn(
            "group fixed z-30 overflow-hidden rounded-2xl border border-line-strong bg-black shadow-[0_16px_40px_rgb(0_0_0/0.5)]",
            isMd
              ? "right-4 bottom-[7rem] w-72"
              : "right-3 bottom-[calc(140px+env(safe-area-inset-bottom))] w-44",
          )}
        >
          <VideoSlot priority={SLOT.floating} className="aspect-video w-full" />
          <button
            type="button"
            onClick={openTheater}
            aria-label={t.video.maximize}
            className="absolute inset-0 grid place-items-end p-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
          >
            <span className="grid size-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm">
              <ArrowsOutSimpleIcon size={16} />
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const IDLE_MS = 2800;

/**
 * Cinema view: the clip as large as the window allows, with controls that fade out while watching.
 * Can go true fullscreen (whole screen) from here.
 */
export function Theater() {
  const open = useUi((s) => s.theater);
  const setTheater = useUi((s) => s.setTheater);
  const isVideo = usePlayer((s) => s.mediaKind === "video");
  const playing = usePlayer((s) => s.status === "playing");
  const toggle = usePlayer((s) => s.toggle);
  const track = usePlayer(selectCurrent);
  const statusText = useStatusText();
  const reduce = useReducedMotion();
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chrome, setChrome] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const visible = open && isVideo && !!track;

  // Leaving Video mode (or the queue emptying) closes the cinema view.
  useEffect(() => {
    if (open && !isVideo) setTheater(false);
  }, [open, isVideo, setTheater]);

  const wake = useCallback(() => {
    setChrome(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      if (usePlayer.getState().status === "playing") setChrome(false);
    }, IDLE_MS);
  }, []);

  useEffect(() => {
    if (!visible) return;
    wake();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) setTheater(false);
      wake();
    };
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
      if (idle.current) clearTimeout(idle.current);
    };
  }, [visible, wake, setTheater]);

  // Paused: keep the controls on screen.
  useEffect(() => {
    if (!playing) setChrome(true);
    else if (visible) wake();
  }, [playing, visible, wake]);

  const close = async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    setTheater(false);
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) return document.exitFullscreen().catch(() => {});
    if (box.current?.requestFullscreen) {
      await box.current.requestFullscreen().catch(() => {});
      // Phones: turn sideways for landscape clips (where the browser allows it).
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      if (usePlayer.getState().videoAspect > 1) orientation.lock?.("landscape").catch(() => {});
      return;
    }
    // iOS Safari only allows fullscreen on the <video> itself.
    (videoEl as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
  };

  const fade = cn("transition-opacity duration-300 ease-out-expo", chrome ? "opacity-100" : "pointer-events-none opacity-0");

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={box}
          role="dialog"
          aria-modal="true"
          aria-label={t.video.label(track.title)}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          onPointerMove={wake}
          onPointerDown={wake}
          className={cn("fixed inset-0 z-50 bg-black", !chrome && "cursor-none")}
        >
          {/* Click toggles play, double-click toggles fullscreen, like most video players. */}
          <div className="absolute inset-0" onClick={() => toggle()} onDoubleClick={toggleFullscreen}>
            <VideoSlot priority={SLOT.theater} className="size-full bg-black" />
          </div>

          <div
            className={cn(
              "overlay-top pointer-events-none absolute inset-x-0 top-0 bg-linear-to-b from-black/80 to-transparent px-4 pb-12 md:px-6",
              fade,
            )}
          >
            <div className="pointer-events-auto flex items-start gap-3 pt-3">
              <div className="min-w-0 flex-1 text-white">
                <p className="truncate text-lg font-semibold tracking-tight md:text-xl">{track.title}</p>
                <p className="truncate text-sm text-white/70">{statusText ?? track.artist}</p>
              </div>
              <IconButton
                label={fullscreen ? t.video.exitFullscreen : t.video.fullscreen}
                onClick={toggleFullscreen}
                className="text-white/85 hover:bg-white/15 hover:text-white"
              >
                {fullscreen ? <CornersInIcon size={22} /> : <CornersOutIcon size={22} />}
              </IconButton>
              <IconButton label={t.video.close} onClick={close} className="text-white/85 hover:bg-white/15 hover:text-white">
                {fullscreen ? <ArrowsInIcon size={22} /> : <XIcon size={22} />}
              </IconButton>
            </div>
          </div>

          <div
            className={cn(
              "safe-bottom pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 to-transparent px-4 pt-16 pb-4 md:px-8 md:pb-6",
              fade,
            )}
          >
            {/* Controls use the light-on-dark palette regardless of the app theme. */}
            <div data-theme="dark" className="pointer-events-auto mx-auto flex max-w-4xl flex-col gap-2 bg-transparent text-fg">
              <Scrubber />
              <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                <div className="flex items-center">
                  <FavoriteButton track={track} />
                </div>
                <Transport />
                <div className="flex justify-end">
                  <Volume className="max-md:hidden" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
