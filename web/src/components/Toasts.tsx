import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useT } from "../i18n";
import { useUi } from "../stores/ui";

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  const t = useT();

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(140px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-28"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full border border-line-strong bg-surface-3 py-1.5 pr-1.5 pl-3 text-sm shadow-[0_8px_30px_rgb(0_0_0/0.35)]"
          >
            <button type="button" onClick={() => dismiss(toast.id)} className="flex min-w-0 items-center gap-2.5 py-1 text-left" aria-label={t.toasts.dismiss(toast.message)}>
              {toast.tone === "error" ? (
                <WarningCircleIcon size={18} weight="fill" className="shrink-0 text-danger" />
              ) : (
                <CheckCircleIcon size={18} weight="fill" className="shrink-0 text-accent-text" />
              )}
              <span className="line-clamp-2">{toast.message}</span>
            </button>
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  toast.action!.run();
                  dismiss(toast.id);
                }}
                className="h-8 shrink-0 rounded-full bg-accent px-3.5 text-[0.8125rem] font-semibold text-accent-ink transition-transform active:scale-95"
              >
                {toast.action.label}
              </button>
            ) : (
              <span className="w-1.5" />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
