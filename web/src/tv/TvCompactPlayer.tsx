import { CaretUpIcon, PauseIcon, PlayIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Artwork } from "../components/Artwork";
import { IconButton } from "../components/IconButton";
import { useT } from "../i18n";
import { selectCurrent, usePlayer, useStatusText } from "../player/player";
import { DockBody, DockTabs } from "./TvDockParts";

/**
 * The player when the TV window is narrow (a phone-sized screen, a windowed session): a bar along the bottom
 * that opens the whole player as a sheet. A column on the side would be squeezed to nothing there, so nothing
 * ever sits beside the page.
 */
export function TvCompactPlayer() {
  const t = useT();
  const track = usePlayer(selectCurrent);
  const status = usePlayer((s) => s.status);
  const toggle = usePlayer((s) => s.toggle);
  const statusText = useStatusText();
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const playing = status === "playing" || status === "loading";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {track && (
        <div className="island fixed inset-x-3 bottom-3 z-30">
          <div className="island-core flex items-center gap-2 py-2 pr-2 pl-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={t.nowPlaying.title}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-[0.75rem] text-left"
            >
              <Artwork src={track.thumb} className="size-[2.75rem] shrink-0 rounded-[0.5rem]" iconSize={18} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-semibold">{track.title}</span>
                <span className="block truncate text-[0.8125rem] text-fg-2">
                  {statusText ?? [track.artist, track.album].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
            <IconButton label={playing ? t.common.pause : t.common.play} size="md" onClick={toggle}>
              {playing ? <PauseIcon size={22} weight="fill" /> : <PlayIcon size={22} weight="fill" />}
            </IconButton>
            <IconButton label={t.nowPlaying.title} size="md" onClick={() => setOpen(true)}>
              <CaretUpIcon size={22} weight="bold" />
            </IconButton>
          </div>
        </div>
      )}

      {createPortal(
        <AnimatePresence>
          {open && (
            <div className="fixed inset-0 z-50">
              <motion.div
                className="absolute inset-0 bg-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
              />
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-label={t.nowPlaying.panel}
                data-escape-closes
                initial={reduce ? { opacity: 0 } : { y: "100%" }}
                animate={reduce ? { opacity: 1 } : { y: 0 }}
                exit={reduce ? { opacity: 0 } : { y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 40 }}
                className="tv-sheet island absolute inset-x-0 bottom-0 flex max-h-[86dvh]"
              >
                <div className="island-core flex max-h-[86dvh] w-full flex-col overflow-hidden">
                  <div className="flex shrink-0 items-center gap-2 pr-2">
                    <DockTabs />
                    <IconButton label={t.common.close} size="sm" onClick={() => setOpen(false)}>
                      <XIcon size={18} />
                    </IconButton>
                  </div>
                  <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <DockBody />
                  </div>
                </div>
              </motion.section>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
