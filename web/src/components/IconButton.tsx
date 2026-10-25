import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../lib/format";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizes = { sm: "size-8", md: "size-10", lg: "size-11" };

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, active, size = "md", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full transition-[transform,color,background-color] duration-200 ease-out-expo",
        "hover:bg-surface-3 active:scale-[0.92] disabled:pointer-events-none disabled:opacity-35",
        active ? "text-accent-text" : "text-fg-2 hover:text-fg",
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/** The primary play button: a solid Volt disc. */
export const PlayDisc = forwardRef<HTMLButtonElement, Omit<Props, "active"> & { px?: number | string }>(function PlayDisc(
  { label, className, children, px = 48, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      style={{ width: px, height: px }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-accent text-accent-ink",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.45)] transition-transform duration-200 ease-out-expo",
        "hover:scale-[1.04] active:scale-[0.95] disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
