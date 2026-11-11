import { MicrophoneStageIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n";
import { api, type Lyrics, type LyricLine } from "../lib/api";
import { cn } from "../lib/format";
import type { Track } from "../lib/types";
import { selectCurrent, usePlayer } from "../player/player";
import { useUi } from "../stores/ui";
import { Artwork } from "./Artwork";
import { Scrubber, Transport } from "./Controls";
import { IconButton } from "./IconButton";

/** Keeps its identity across renders, so the hooks below don't see a new list on every render. */
const NO_LINES: LyricLine[] = [];

interface LyricsState {
  status: "idle" | "loading" | "ready" | "none" | "error";
  lyrics: Lyrics | null;
}

/** Lyrics already fetched in this session: reopening a track's lyrics is instant and needs no request. */
const memo = new Map<string, Lyrics | null>();

function useLyrics(track: Track | null): LyricsState & { reload: () => void } {
  const [state, setState] = useState<LyricsState>({ status: "idle", lyrics: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!track) {
      setState({ status: "idle", lyrics: null });
      return;
    }
    if (memo.has(track.id)) {
      const lyrics = memo.get(track.id) ?? null;
      setState(lyrics ? { status: "ready", lyrics } : { status: "none", lyrics: null });
      return;
    }
    const ctrl = new AbortController();
    let live = true;
    setState({ status: "loading", lyrics: null });
    api
      .lyrics(track, ctrl.signal)
      .then((lyrics) => {
        memo.set(track.id, lyrics);
        if (live) setState(lyrics ? { status: "ready", lyrics } : { status: "none", lyrics: null });
      })
      .catch((e: unknown) => {
        if (!live || (e as Error)?.name === "AbortError") return;
        setState({ status: "error", lyrics: null });
      });
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [track, attempt]);

  const reload = useCallback(() => {
    if (track) memo.delete(track.id);
    setAttempt((n) => n + 1);
  }, [track]);

  return { ...state, reload };
}

/** Index of the line being sung at `position`, or -1 before the first one. */
function lineAt(position: number, lines: LyricLine[]): number {
  // A small lead: the line starts a moment before the singer, as lyric files time the voice and not the beat.
  const at = position + 0.2;
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= at) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/** The line being sung, re-rendered as playback moves (not the whole player). */
function useActiveLine(lines: LyricLine[], synced: boolean): number {
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (!synced) {
      setActive(-1);
      return;
    }
    const update = () => setActive(lineAt(usePlayer.getState().position, lines));
    update();
    return usePlayer.subscribe(update);
  }, [lines, synced]);
  return active;
}

function Skeleton() {
  const t = useT();
  return (
    <div aria-busy="true" aria-label={t.lyrics.loading} className="flex flex-col gap-3 px-2 py-6">
      {[92, 78, 86, 64, 74].map((width, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded-full bg-surface-3"
          style={{ width: `${width}%`, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

function Notice({ icon, text, children }: { icon: ReactNode; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-sm text-fg-2">
      <span className="grid size-12 place-items-center rounded-[14px] bg-surface-3 text-fg-3">{icon}</span>
      <p className="max-w-[34ch]">{text}</p>
      {children}
    </div>
  );
}

/**
 * The lyrics of the current track. Synced lyrics highlight the line being sung, follow it as it plays and
 * jump there when a line is clicked; plain lyrics are shown as text.
 */
export function LyricsView({ large = false, className }: { large?: boolean; className?: string }) {
  const t = useT();
  const track = usePlayer(selectCurrent);
  const { status, lyrics, reload } = useLyrics(track);
  const seek = usePlayer((s) => s.seek);

  const lines = lyrics?.lines ?? NO_LINES;
  const synced = !!lyrics?.synced && lines.length > 1;
  const active = useActiveLine(lines, synced);

  const box = useRef<HTMLDivElement | null>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  /** Auto-scroll only while the reader hasn't scrolled away; it comes back after a few seconds of stillness. */
  const pinned = useRef(true);
  const idle = useRef(0);

  const scrollToLine = useCallback((index: number) => {
    const el = rows.current[index];
    const container = box.current;
    if (!el || !container) return;
    const top =
      container.scrollTop +
      el.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      container.clientHeight / 2 +
      el.offsetHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (pinned.current && active >= 0) scrollToLine(active);
    const container = box.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (pinned.current && active >= 0) scrollToLine(active);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [active, scrollToLine]);

  useEffect(() => () => window.clearTimeout(idle.current), []);

  // Reading further down stops the follow; it returns by itself once the reader stops, or on a line click.
  const letGo = () => {
    pinned.current = false;
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => {
      pinned.current = true;
      scrollToLine(lineAt(usePlayer.getState().position, lines));
    }, 6000);
  };

  const body = (
    <div
      ref={box}
      onWheel={letGo}
      onTouchStart={letGo}
      onPointerDown={letGo}
      className={cn("scroll-area min-h-0 overflow-y-auto px-1 [scrollbar-width:thin]", className)}
    >
      {synced ? (
        <div className={cn("flex flex-col", large ? "gap-1 py-[38%]" : "gap-0.5 py-[30%]")}>
          {lines.map((line, i) => {
            const isActive = i === active;
            const length = Math.max(0, (lines[i + 1]?.time ?? 0) - line.time);
            return (
              <button
                key={`${line.time}-${i}`}
                ref={(el) => {
                  rows.current[i] = el;
                }}
                type="button"
                aria-current={isActive ? "true" : undefined}
                onClick={() => {
                  pinned.current = true;
                  window.clearTimeout(idle.current);
                  seek(Math.max(0, line.time - 0.2));
                }}
                className={cn(
                  "relative block w-full rounded-lg px-2 py-1 text-left font-semibold transition-[color,opacity] duration-300",
                  large ? "text-[22px] leading-[1.4]" : "text-[16px] leading-snug",
                  isActive ? "text-accent-text opacity-100" : "text-fg-2 opacity-45 hover:text-fg hover:opacity-100",
                )}
              >
                <span className="relative inline-block max-w-full">
                  {line.text}
                  {isActive && length > 0.4 && (
                    // Fills under the line over its length, so it's clear how far into it playback is.
                    <motion.span
                      aria-hidden="true"
                      key={`${line.time}-bar`}
                      className="absolute inset-x-0 -bottom-0.5 h-0.5 origin-left rounded-full bg-accent/50"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: Math.min(length, 30), ease: "linear" }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={cn("px-2", large ? "py-12 text-[17px] leading-relaxed" : "py-8 text-[15px] leading-relaxed")}>
          {lyrics?.instrumental ? (
            <p className="text-fg-2">{t.lyrics.instrumental}</p>
          ) : (
            <>
              <p className="pb-4 text-xs text-fg-3">{t.lyrics.unsynced}</p>
              {lines.map((line, i) => (
                <p key={i} className="text-fg-2">
                  {line.text}
                </p>
              ))}
            </>
          )}
        </div>
      )}
      {lyrics && (
        <p className="pt-6 pb-2 text-center text-[11px] text-fg-3">
          {t.lyrics.source}{" "}
          <a href="https://lrclib.net" target="_blank" rel="noreferrer" className="underline hover:text-fg-2">
            LRCLIB
          </a>
        </p>
      )}
    </div>
  );

  if (status === "loading" || status === "idle") return <Skeleton />;
  if (status === "none") {
    return <Notice icon={<MicrophoneStageIcon size={24} />} text={!track ? t.nowPlaying.playSomething : t.lyrics.none} />;
  }
  if (status === "error") {
    return (
      <Notice icon={<WarningCircleIcon size={24} />} text={t.lyrics.error}>
        <button
          type="button"
          onClick={reload}
          className="h-9 rounded-full bg-surface-3 px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-4"
        >
          {t.lyrics.retry}
        </button>
      </Notice>
    );
  }
  return body;
}

/** The mic button: the lyrics in a centered overlay, over whatever is on screen. */
export function LyricsButton({ size = "sm", className }: { size?: "sm" | "md"; className?: string }) {
  const t = useT();
  const open = useUi((s) => s.lyricsOpen);
  const setOpen = useUi((s) => s.setLyricsOpen);
  const hasTrack = usePlayer((s) => s.queue.length > 0);
  return (
    <IconButton
      label={t.lyrics.show}
      size={size}
      active={open}
      disabled={!hasTrack}
      onClick={() => setOpen(!open)}
      className={className}
    >
      <MicrophoneStageIcon size={18} />
    </IconButton>
  );
}

/** Spotify-style: the song's lyrics centered over a dimmed app, the sung line highlighted and followed. */
export function LyricsOverlay() {
  const t = useT();
  const open = useUi((s) => s.lyricsOpen);
  const setOpen = useUi((s) => s.setLyricsOpen);
  const track = usePlayer(selectCurrent);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // An empty queue closes it by itself: there is nothing to sing along to.
  useEffect(() => {
    if (open && !track) setOpen(false);
  }, [open, track, setOpen]);

  const from = reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 12 };

  return createPortal(
    <AnimatePresence>
      {open && track && (
        <div className="fixed inset-0 z-50 flex items-center justify-center md:p-6">
          <motion.div
            className="absolute inset-0 bg-scrim backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t.lyrics.title}
            data-escape-closes
            initial={from}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={from}
            transition={{ type: "spring", stiffness: 400, damping: 36 }}
            className="island relative flex max-h-[88dvh] w-[min(94vw,700px)] max-md:h-dvh max-md:max-h-none max-md:w-full max-md:rounded-none"
          >
            <div className="island-core flex min-h-0 w-full flex-col overflow-hidden p-4 md:p-6">
              <div className="flex items-center gap-3 pb-2">
                <Artwork src={track.art} fallback={track.thumb} className="size-11 rounded-[8px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{track.title}</p>
                  <p className="truncate text-xs text-fg-2">{track.artist}</p>
                </div>
                <IconButton label={t.common.close} size="sm" onClick={() => setOpen(false)}>
                  <XIcon size={18} />
                </IconButton>
              </div>
              <LyricsView large className="flex-1" />
              <div className="border-t border-line/60 pt-3">
                <Scrubber />
                <div className="pt-1">
                  <Transport />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
