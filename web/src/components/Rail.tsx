import {
  BooksIcon,
  ClockCounterClockwiseIcon,
  GearSixIcon,
  HeartIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router";
import { useT } from "../i18n";
import { cn } from "../lib/format";
import { paths } from "../lib/routes";
import { useAppearance } from "../stores/appearance";
import { useLibrary } from "../stores/library";
import { needsAttention, useSystem } from "../stores/system";
import { useUi } from "../stores/ui";
import { Artwork } from "./Artwork";
import { Logo, LogoMark } from "./Brand";
import { NamePlaylistDialog } from "./Dialogs";

const nav = [
  { to: paths.home, key: "home", Icon: HouseIcon, end: true },
  { to: paths.search, key: "search", Icon: MagnifyingGlassIcon, end: false },
  { to: paths.library, key: "library", Icon: BooksIcon, end: false },
] as const;

/** Settings entry. Shows a dot (and on the wide rail, an "Update" pill) when yt-dlp needs attention. */
function SettingsButton() {
  const t = useT();
  const info = useSystem((s) => s.info);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const attention = needsAttention(info);
  const updatable = !!info?.ytdlp.updateAvailable || !info?.ytdlp.path;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={attention ? t.nav.settingsAttention : t.nav.settings}
      title={t.nav.settings}
      className="relative flex h-10 w-full items-center justify-center gap-2 rounded-full px-3 text-sm text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg wide:justify-start"
    >
      <GearSixIcon size={19} />
      <span className="hidden flex-1 text-left wide:inline">{t.nav.settings}</span>
      {attention && (
        <>
          <span className="absolute top-2 right-[calc(50%-14px)] size-2 rounded-full bg-accent ring-2 ring-surface-2 wide:hidden" />
          <span className="hidden rounded-full bg-accent-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-text wide:inline">
            {updatable ? t.nav.updatePill : t.nav.checkPill}
          </span>
        </>
      )}
    </button>
  );
}

/** Shared tile: square icon/art with an active Volt ring. Labels appear on the expanded rail (≥1280px). */
function RailLink({ to, label, sub, end, children }: { to: string; label: string; sub?: string; end?: boolean; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive }) =>
        cn(
          "group flex items-center justify-center gap-3 rounded-[0.875rem] p-1.5 transition-colors duration-200 wide:justify-start",
          "hover:bg-surface-3 wide:pr-3",
          isActive && "wide:bg-surface-3",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-[0.75rem] transition-[box-shadow,transform] duration-200 ease-out-expo group-active:scale-95",
              isActive ? "ring-2 ring-accent ring-offset-2 ring-offset-surface-2" : "",
            )}
          >
            {children}
          </span>
          <span className="hidden min-w-0 wide:block">
            <span className={cn("block truncate text-sm font-medium", isActive ? "text-fg" : "text-fg-2 group-hover:text-fg")}>
              {label}
            </span>
            {sub && <span className="block truncate text-xs text-fg-3">{sub}</span>}
          </span>
        </>
      )}
    </NavLink>
  );
}

export function Rail() {
  const t = useT();
  const sidebarPlaylists = useAppearance((s) => s.sidebarPlaylists);
  const playlists = useLibrary((s) => s.playlists);
  const favorites = useLibrary((s) => s.favorites);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <aside className="island hidden w-[4.875rem] shrink-0 md:flex wide:w-[16rem]">
      <div className="island-core flex w-full flex-col overflow-hidden">
        <div className="flex h-16 items-center justify-center wide:justify-start wide:px-4 [@media(max-height:540px)]:h-12">
          <LogoMark className="size-8 text-accent-text wide:hidden" />
          <span className="hidden wide:block">
            <Logo />
          </span>
        </div>

        <nav aria-label={t.nav.main} className="flex flex-col gap-1 px-2">
          {nav.map(({ to, key, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={t.nav[key]}
              className={({ isActive }) =>
                cn(
                  "flex h-11 items-center justify-center gap-3 rounded-full transition-colors duration-200 wide:justify-start wide:px-4 [@media(max-height:540px)]:h-9",
                  isActive ? "bg-surface-4 text-fg" : "text-fg-2 hover:bg-surface-3 hover:text-fg",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} weight={isActive ? "fill" : "regular"} />
                  <span className="hidden text-sm font-medium wide:inline">{t.nav[key]}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mx-4 my-3 h-px bg-line [@media(max-height:540px)]:my-1.5" />

        <div className="flex items-center justify-between px-4 pb-1 [@media(max-height:540px)]:pb-0">
          <span className="hidden text-xs font-medium text-fg-3 wide:block">{t.nav.yourCollection}</span>
          <button
            type="button"
            onClick={() => setCreating(true)}
            aria-label={t.nav.newPlaylist}
            title={t.nav.newPlaylist}
            className="mx-auto grid size-8 place-items-center rounded-full text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg wide:mx-0"
          >
            <PlusIcon size={18} />
          </button>
        </div>

        <div className="scroll-area flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          <RailLink to={paths.favorites} label={t.nav.favorites} sub={t.common.tracks(favorites.length)}>
            <span className="grid size-full place-items-center bg-accent-soft text-accent-text">
              <HeartIcon size={20} weight="fill" />
            </span>
          </RailLink>
          <RailLink to={paths.history} label={t.nav.recentlyPlayed} sub={t.nav.history}>
            <span className="grid size-full place-items-center bg-surface-3 text-fg-2">
              <ClockCounterClockwiseIcon size={20} />
            </span>
          </RailLink>
          {sidebarPlaylists && playlists.map((p) => (
            <RailLink key={p.id} to={paths.playlist(p.id)} label={p.name} sub={t.common.tracks(p.tracks.length)}>
              <Artwork src={p.tracks[0]?.thumb} className="size-full" iconSize={18} />
            </RailLink>
          ))}
        </div>

        <div className="flex border-t border-line p-2">
          <SettingsButton />
        </div>
      </div>

      <NamePlaylistDialog
        open={creating}
        title={t.nav.newPlaylist}
        action={t.library.create}
        onClose={() => setCreating(false)}
        onSubmit={async (name) => {
          const p = await createPlaylist(name);
          setCreating(false);
          if (p) navigate(paths.playlist(p.id));
        }}
      />
    </aside>
  );
}
