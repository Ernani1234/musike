import { CheckIcon, PaletteIcon } from "@phosphor-icons/react";
import { useT } from "../i18n";
import { inkFor } from "../lib/accent";
import { cn } from "../lib/format";
import { ACCENTS, useAppearance } from "../stores/appearance";
import { useUi } from "../stores/ui";

/** Ready-made accent swatches plus any colour from the system picker. */
export function AccentPicker() {
  const t = useT();
  const accent = useAppearance((s) => s.accent);
  const set = useAppearance((s) => s.set);
  const custom = !ACCENTS.some((a) => a.color === accent);
  const swatch = "grid size-8 shrink-0 place-items-center rounded-full ring-offset-2 ring-offset-surface-2 transition-transform active:scale-90";

  return (
    <div className="flex flex-col gap-2 pt-1">
      <p className="text-[0.8125rem] text-fg-2">{t.customize.accent}</p>
      <div role="radiogroup" aria-label={t.customize.accent} className="flex flex-wrap items-center gap-2.5">
        {ACCENTS.map(({ id, color }) => {
          const on = accent === color;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={t.customize.colors[id]}
              title={t.customize.colors[id]}
              onClick={() => set({ accent: color })}
              className={cn(swatch, on && "ring-2 ring-fg")}
              style={{ background: color }}
            >
              {on && <CheckIcon size={15} weight="bold" style={{ color: inkFor(color) }} />}
            </button>
          );
        })}
        <label
          title={t.customize.customColor}
          className={cn(swatch, "relative cursor-pointer", custom && "ring-2 ring-fg")}
          style={{ background: custom ? accent : "conic-gradient(#f43f5e, #fbbf24, #a3e635, #22d3ee, #6366f1, #d946ef, #f43f5e)" }}
        >
          <input
            type="color"
            value={accent}
            onChange={(e) => set({ accent: e.target.value })}
            aria-label={t.customize.customColor}
            className="absolute inset-0 size-full cursor-pointer rounded-full opacity-0"
          />
          {custom ? (
            <CheckIcon size={15} weight="bold" style={{ color: inkFor(accent) }} />
          ) : (
            <PaletteIcon size={15} weight="bold" className="text-white drop-shadow" />
          )}
        </label>
      </div>
    </div>
  );
}

function SwitchRow({ label, body, checked, onChange }: { label: string; body?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {body && <span className="block text-xs text-fg-2">{body}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-accent",
          checked ? "bg-accent" : "bg-surface-4",
        )}
      >
        <span
          className={cn(
            "absolute top-1 left-1 size-4 rounded-full transition-transform duration-200 ease-out-expo",
            checked ? "translate-x-4 bg-accent-ink" : "bg-fg-2",
          )}
        />
      </span>
    </label>
  );
}

/** What the app shows: panels, sidebar, list columns and the Home sections. */
export function LayoutSection() {
  const t = useT();
  const a = useAppearance();
  const panelOpen = useUi((s) => s.panelOpen);
  const setPanelDocked = useUi((s) => s.setPanelDocked);

  const homeSections = [
    ["homeShortcuts", t.customize.homeShortcuts],
    ["homeRecent", t.nav.recentlyPlayed],
    ["homeFavorites", t.home.yourFavorites],
  ] as const;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-fg-3">{t.customize.layout}</h3>
      <div className="flex flex-col divide-y divide-line rounded-[1rem] bg-surface-1 ring-1 ring-line">
        <SwitchRow label={t.customize.panel} body={t.customize.panelBody} checked={panelOpen} onChange={setPanelDocked} />
        <SwitchRow label={t.customize.sidebarPlaylists} checked={a.sidebarPlaylists} onChange={(v) => a.set({ sidebarPlaylists: v })} />
        <SwitchRow
          label={t.customize.compactSidebar}
          body={t.customize.compactSidebarBody}
          checked={a.compactSidebar}
          onChange={(v) => a.set({ compactSidebar: v })}
        />
        <SwitchRow label={t.customize.albumColumn} checked={a.albumColumn} onChange={(v) => a.set({ albumColumn: v })} />
        <SwitchRow label={t.customize.texture} checked={a.texture} onChange={(v) => a.set({ texture: v })} />
      </div>

      <p className="pt-2 text-[0.8125rem] text-fg-2">{t.customize.home}</p>
      <div className="flex flex-wrap gap-2">
        {homeSections.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="checkbox"
            aria-checked={a[key]}
            onClick={() => a.set({ [key]: !a[key] })}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-medium ring-1 transition-colors",
              a[key] ? "bg-accent-soft text-accent-text ring-accent/40" : "text-fg-2 ring-line hover:text-fg",
            )}
          >
            {a[key] && <CheckIcon size={14} weight="bold" />}
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          a.reset();
          setPanelDocked(true);
        }}
        className="mt-1 self-start text-[0.8125rem] font-medium text-fg-2 underline-offset-2 hover:text-fg hover:underline"
      >
        {t.customize.reset}
      </button>
    </section>
  );
}
