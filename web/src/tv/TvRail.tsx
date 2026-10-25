import {
  BooksIcon,
  ClockCounterClockwiseIcon,
  GearSixIcon,
  HeartIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { useT } from "../i18n";
import { cn } from "../lib/format";
import { paths } from "../lib/routes";
import { useAppearance } from "../stores/appearance";
import { useLibrary } from "../stores/library";
import { needsAttention, useSystem } from "../stores/system";
import { useUi } from "../stores/ui";
import { Artwork } from "../components/Artwork";
import { Logo } from "../components/Brand";
import { NamePlaylistDialog } from "../components/Dialogs";

const nav = [
  { to: paths.home, key: "home", Icon: HouseIcon, end: true },
  { to: paths.search, key: "search", Icon: MagnifyingGlassIcon, end: false },
  { to: paths.library, key: "library", Icon: BooksIcon, end: false },
] as const;

/** One rail entry: icon, label, optional counter. Reads as a row, focuses as a whole. */
function Row({
  to,
  Icon: Glyph,
  label,
  sub,
  end,
  cover,
  onClick,
}: {
  to?: string;
  Icon?: Icon;
  label: string;
  sub?: ReactNode;
  end?: boolean;
  cover?: ReactNode;
  onClick?: () => void;
}) {
  const inner = (isActive: boolean) => (
    <>
      <span
        className={cn(
          "grid size-[2.25rem] shrink-0 place-items-center overflow-hidden rounded-[0.625rem] transition-colors",
          cover ? "" : isActive ? "text-accent-text" : "text-fg-2",
          !cover && isActive && "bg-accent-soft",
        )}
      >
        {cover ?? (Glyph ? <Glyph size={24} weight={isActive ? "fill" : "regular"} /> : null)}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-[1rem] font-medium", isActive ? "text-fg" : "text-fg-2")}>
        {label}
      </span>
      {sub != null && sub !== "" && <span className="shrink-0 font-mono text-[0.75rem] text-fg-3 tabular-nums">{sub}</span>}
    </>
  );

  const shell = (isActive: boolean) =>
    cn(
      "flex h-[3.25rem] items-center gap-3.5 rounded-[0.875rem] px-3 text-left",
      "transition-colors duration-150",
      isActive ? "bg-surface-3" : "hover:bg-surface-2",
    );

  if (!to) {
    return (
      <button type="button" onClick={onClick} className={shell(false)}>
        {inner(false)}
      </button>
    );
  }
  return (
    <NavLink to={to} end={end} title={label} className={({ isActive }) => shell(isActive)}>
      {({ isActive }) => inner(isActive)}
    </NavLink>
  );
}

function SettingsRow() {
  const t = useT();
  const info = useSystem((s) => s.info);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const attention = needsAttention(info);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex h-[3.25rem] w-full items-center gap-3.5 rounded-[0.875rem] px-3 text-left text-fg-2 transition-colors duration-150 hover:bg-surface-2"
    >
      <span className="relative grid size-[2.25rem] shrink-0 place-items-center">
        <GearSixIcon size={24} />
        {attention && <span className="absolute top-0 right-0 size-2.5 rounded-full bg-accent ring-2 ring-surface-1" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-[1rem] font-medium">{t.nav.settings}</span>
    </button>
  );
}

/** Left rail for the TV: icons with words, big enough to read from the couch. */
export function TvRail() {
  const t = useT();
  const sidebarPlaylists = useAppearance((s) => s.sidebarPlaylists);
  const playlists = useLibrary((s) => s.playlists);
  const favorites = useLibrary((s) => s.favorites);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <aside className="island flex w-[min(14.5rem,20vw)] shrink-0" aria-label={t.nav.main}>
      <div className="island-core flex w-full flex-col overflow-hidden">
        <div className="flex h-[4.5rem] shrink-0 items-center px-4">
          <Logo className="text-[1.0625rem]" />
        </div>

        <nav className="flex flex-col gap-1 px-2">
          {nav.map(({ to, key, Icon, end }) => (
            <Row key={to} to={to} Icon={Icon} end={end} label={t.nav[key]} />
          ))}
        </nav>

        <div className="mx-3 my-3 h-px shrink-0 bg-line" />

        <div className="flex items-center justify-between px-4 pb-1.5">
          <span className="text-[0.75rem] font-semibold tracking-wide text-fg-3 uppercase">{t.nav.yourCollection}</span>
          <button
            type="button"
            onClick={() => setCreating(true)}
            aria-label={t.nav.newPlaylist}
            title={t.nav.newPlaylist}
            className="grid size-[1.75rem] place-items-center rounded-full text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg"
          >
            <PlusIcon size={18} />
          </button>
        </div>

        <div className="scroll-area flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          <Row to={paths.favorites} label={t.nav.favorites} sub={favorites.length} Icon={HeartIcon} />
          <Row to={paths.history} label={t.nav.recentlyPlayed} Icon={ClockCounterClockwiseIcon} />
          {sidebarPlaylists &&
            playlists.map((p) => (
              <Row
                key={p.id}
                to={paths.playlist(p.id)}
                label={p.name}
                sub={p.tracks.length}
                cover={<Artwork src={p.tracks[0]?.thumb} className="size-full" iconSize={16} />}
              />
            ))}
        </div>

        <div className="shrink-0 border-t border-line p-2">
          <SettingsRow />
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
