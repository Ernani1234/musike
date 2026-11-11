import { MicrophoneStageIcon, QuotesIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useReducer, useMemo, useRef, useState } from "react";
import { useT } from "../i18n";
import { cn } from "../lib/format";
import { fetchLyrics, lineAt, type Lyrics, type LyricsLine } from "../lib/lyrics";
import type { Track } from "../lib/types";
import { selectCurrent, usePlayer } from "../player/player";

/**
 * The Now Playing lyrics view: big bold lines that dim behind the song, the sung line springing
 * to full color a touch ahead of the beat, auto-scroll that follows along — the way Apple Music
 * makes lyrics move. Tap any line to jump there. Lyrics come from LRCLIB (see lib/lyrics.ts).
 */

/** The store's position ticks a few times a second; word fills need a continuous clock.
 *  This interpolates between ticks on requestAnimationFrame and re-renders at ~30 fps. */
function useSmoothTime(enabled: boolean): number {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const clock = useRef({
    pos: usePlayer.getState().position,
    wall: 0,
    playing: usePlayer.getState().status === "playing",
    duration: usePlayer.getState().duration,
    value: usePlayer.getState().position,
  });

  useEffect(
    () =>
      usePlayer.subscribe((s, prev) => {
        const c = clock.current;
        if (s.position !== prev.position) {
          c.pos = s.position;
          c.wall = performance.now();
        }
        c.playing = s.status === "playing";
        c.duration = s.duration;
      }),
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const tick = () => {
      const c = clock.current;
      const drift = c.playing ? (performance.now() - c.wall) / 1000 : 0;
      const now = Math.max(0, Math.min(c.pos + drift, c.duration || Number.POSITIVE_INFINITY));
      if (Math.abs(now - c.value) > 0.033) {
        c.value = now;
        force();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  return clock.current.value;
}

type LyricsState = { status: "loading" } | { status: "ready"; lyrics: Lyrics } | { status: "error"; offline?: boolean };

function useLyrics(track: Track | null, reloadKey: number): LyricsState {
  const [state, setState] = useState<LyricsState>({ status: "loading" });
  useEffect(() => {
    if (!track) return;
    const control = new AbortController();
    setState({ status: "loading" });
    fetchLyrics(track, control.signal)
      .then((lyrics) => control.signal.aborted || setState({ status: "ready", lyrics }))
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setState({ status: "error", offline: !navigator.onLine });
      });
    return () => control.abort();
  }, [track?.id, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps -- the track object identity changes with every queue edit
  return state;
}

function Dots() {
  return (
    <span className="flex items-center gap-1.5 py-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-2 animate-pulse rounded-full bg-fg/40" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </span>
  );
}

function Line({
  line,
  active,
  time,
  compact,
  onSeek,
  registerRef,
}: {
  line: LyricsLine;
  active: boolean;
  time: number;
  compact: boolean;
  onSeek: (seconds: number) => void;
  registerRef: (el: HTMLButtonElement | null) => void;
}) {
  const reduce = useReducedMotion();
  // A silent stretch (no text in the LRC) becomes Apple's three breathing dots.
  if (!line.text) {
    return (
      <div className={cn("px-1", compact ? "py-2" : "py-3")} role="presentation">
        <Dots />
      </div>
    );
  }
  return (
    <motion.button
      ref={registerRef}
      type="button"
      onClick={() => onSeek(line.time)}
      aria-label={line.text}
      className={cn(
        "block w-full text-left font-bold tracking-tight break-words",
        compact ? "py-1.5 text-[19px] leading-[1.35]" : "py-2 text-[27px] leading-[1.3]",
      )}
      initial={false}
      animate={{ opacity: active ? 1 : 0.34, scale: active && !reduce ? 1.02 : 1 }}
      transition={{
        opacity: { duration: 0.32, ease: "easeOut" },
        scale: { type: "spring", stiffness: 320, damping: 26 },
      }}
      style={{ transformOrigin: "left center" }}
    >
      {active && line.words ? (
        <span className="inline">
          {line.words.map((word, i) => (
            <motion.span
              key={i}
              animate={{ opacity: word.time <= time ? 1 : 0.38 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="inline"
            >
              {word.text}{" "}
            </motion.span>
          ))}
        </span>
      ) : (
        line.text
      )}
    </motion.button>
  );
}

export function LyricsView({ compact = false }: { compact?: boolean }) {
  const track = usePlayer(selectCurrent);
  const seek = usePlayer((s) => s.seek);
  const t = useT();
  const reduce = useReducedMotion();

  const [reloadKey, setReloadKey] = useState(0);
  const lyricsState = useLyrics(track, reloadKey);
  const lyrics = lyricsState.status === "ready" ? lyricsState.lyrics : null;
  const synced = !!lyrics?.lines?.length;
  const time = useSmoothTime(synced);
  const active = useMemo(() => (lyrics?.lines ? lineAt(lyrics.lines, time) : -1), [lyrics, time]);

  // Auto-scroll keeps the sung line about 38% from the top. Scrolling by hand suspends it
  // briefly and offers a way back, like the original.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef(new Map<number, HTMLButtonElement>());
  const pausedUntil = useRef(0);
  const [paused, setPaused] = useState(false);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suspendAuto = () => {
    pausedUntil.current = Date.now() + 3500;
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => setPaused(false), 3500);
    setPaused(true);
  };

  useEffect(() => {
    if (!synced) return;
    const container = containerRef.current;
    const el = lineRefs.current.get(active);
    if (!container || !el) return;
    if (Date.now() < pausedUntil.current) return;
    container.scrollTo({
      top: Math.max(0, el.offsetTop - container.clientHeight * 0.38),
      behavior: reduce ? "auto" : "smooth",
    });
  }, [active, synced, reduce]);

  useEffect(() => {
    // New song: back to the top, the auto-scroll takes over from there.
    const container = containerRef.current;
    if (container) container.scrollTop = 0;
    pausedUntil.current = 0;
    setPaused(false);
  }, [track?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!track) {
    return <p className="px-2 py-16 text-center text-sm text-fg-2">{t.nowPlaying.playSomething}</p>;
  }

  const head = (
    <div className={cn("px-1 pb-4", compact ? "pt-6" : "pt-2")}>
      <p className={cn("font-bold tracking-tight text-fg-2", compact ? "text-lg" : "text-2xl")}>{track.title}</p>
      <p className={cn("mt-1 text-fg-3", compact ? "text-xs" : "text-sm")}>{track.artist}</p>
    </div>
  );

  let body: React.ReactNode;
  if (lyricsState.status === "loading") {
    body = (
      <div className="flex flex-col gap-4 px-1 pt-4" aria-busy="true">
        {["88%", "62%", "95%", "74%", "52%"].map((w, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-fg/10" style={{ width: w }} />
        ))}
      </div>
    );
  } else if (lyricsState.status === "error") {
    body = (
      <div className="flex flex-col items-center gap-3 px-2 py-12 text-center">
        <QuotesIcon size={28} className="text-fg-3" />
        <p className="text-sm text-fg-2">{lyricsState.offline ? t.lyrics.offline : t.lyrics.loadFailed}</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="h-9 rounded-full bg-surface-2 px-4 text-sm font-medium ring-1 ring-line transition-colors hover:bg-surface-3"
        >
          {t.lyrics.retry}
        </button>
      </div>
    );
  } else if (lyrics?.instrumental) {
    body = (
      <div className="flex flex-col items-center gap-3 px-2 py-12 text-center">
        <MicrophoneStageIcon size={28} className="text-fg-3" />
        <p className="text-sm text-fg-2">{t.lyrics.instrumental}</p>
      </div>
    );
  } else if (!synced && lyrics?.plain) {
    body = (
      <div className="px-1 pt-2">
        <p className="mb-4 text-xs font-medium text-fg-3">{t.lyrics.unsynced}</p>
        <div className={cn("whitespace-pre-wrap font-semibold leading-relaxed", compact ? "text-[15px]" : "text-lg")}>
          {lyrics.plain}
        </div>
      </div>
    );
  } else if (!synced) {
    body = (
      <div className="flex flex-col items-center gap-3 px-2 py-12 text-center">
        <QuotesIcon size={28} className="text-fg-3" />
        <p className="text-sm text-fg-2">{t.lyrics.notFound}</p>
        <p className="max-w-[26ch] text-xs text-fg-3">{t.lyrics.notFoundHint}</p>
      </div>
    );
  } else {
    body = (
      <div className="relative">
        {lyrics!.lines!.map((line, i) => (
          <Line
            key={`${line.time}-${i}`}
            line={line}
            active={i === active}
            time={time}
            compact={compact}
            onSeek={seek}
            registerRef={(el) => {
              if (el) lineRefs.current.set(i, el);
              else lineRefs.current.delete(i);
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        onWheel={suspendAuto}
        onTouchMove={suspendAuto}
        className={cn("lyrics-fade scroll-area h-full overflow-y-auto overscroll-contain", compact ? "pb-40" : "pb-[55dvh]")}
        style={{ paddingTop: compact ? undefined : "36dvh" }}
        role="region"
        aria-label={t.nowPlaying.tabLyrics}
      >
        {head}
        {body}
        <p className="px-1 pt-6 text-[11px] text-fg-3">
          <a
            href="https://lrclib.net"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-fg-3/40 underline-offset-2 hover:text-fg-2"
          >
            {t.lyrics.providedBy}
          </a>
        </p>
      </div>
      <AnimatePresence>
        {synced && paused && (
          <motion.button
            type="button"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              pausedUntil.current = 0;
              setPaused(false);
              const container = containerRef.current;
              const el = lineRefs.current.get(active);
              if (container && el)
                container.scrollTo({ top: Math.max(0, el.offsetTop - container.clientHeight * 0.38), behavior: "smooth" });
            }}
            className="absolute bottom-3 left-1/2 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface-3/90 px-4 text-xs font-medium text-fg shadow-lg ring-1 ring-line backdrop-blur-md"
          >
            <MicrophoneStageIcon size={14} /> {t.lyrics.backToLive}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
