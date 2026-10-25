import { cn } from "../lib/format";

/** The Musike mark: three equalizer bars forming an M. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <g fill="currentColor">
        <rect x="10" y="10" width="8" height="28" rx="4" />
        <rect x="20" y="10" width="8" height="16" rx="4" />
        <rect x="30" y="10" width="8" height="28" rx="4" />
      </g>
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <LogoMark className="size-7 text-accent-text" />
      <span className="text-[1.0625rem] font-semibold tracking-tight">musike</span>
    </span>
  );
}

/** The mark in motion: marks the track that is playing. */
export function Equalizer({ live, className }: { live: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex h-3.5 items-end gap-[0.125rem]", live && "eq-live", className)}>
      <span className="eq-bar h-full w-[0.1875rem] rounded-full bg-accent-text" />
      <span className="eq-bar h-full w-[0.1875rem] rounded-full bg-accent-text" />
      <span className="eq-bar h-full w-[0.1875rem] rounded-full bg-accent-text" />
    </span>
  );
}
