import { CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { useEffect, useState, type FormEvent } from "react";
import { useT, type Messages } from "../i18n";
import { cn } from "../lib/format";
import { useLibrary } from "../stores/library";
import { useUi } from "../stores/ui";
import { Artwork } from "./Artwork";
import { Modal } from "./Modal";

export function AddToPlaylistDialog() {
  const tracks = useUi((s) => s.addToPlaylist);
  const close = useUi((s) => s.openAddToPlaylist);
  const playlists = useLibrary((s) => s.playlists);
  const add = useLibrary((s) => s.addToPlaylist);
  const create = useLibrary((s) => s.createPlaylist);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const many = !!tracks && tracks.length > 1;
  const t = useT();

  useEffect(() => {
    if (tracks) {
      setCreating(playlists.length === 0);
      setName("");
    }
  }, [tracks]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!tracks || !name.trim()) return;
    const p = await create(name, tracks);
    if (p) close(null);
  };

  return (
    <Modal
      open={!!tracks}
      onClose={() => close(null)}
      title={many ? t.dialogs.addManyToPlaylist(tracks?.length ?? 0) : t.dialogs.addToPlaylist}
    >
      {creating ? (
        <form onSubmit={onCreate} className="flex flex-col gap-3">
          <label htmlFor="new-playlist" className="text-sm text-fg-2">
            {t.dialogs.newPlaylistName}
          </label>
          <input
            id="new-playlist"
            autoFocus
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.dialogs.namePlaceholder}
            className="h-12 rounded-full border border-line-strong bg-surface-1 px-5 text-[0.9375rem] placeholder:text-fg-3 focus:border-accent focus:outline-none"
          />
          <div className="flex justify-end gap-2 pt-1">
            {playlists.length > 0 && (
              <button type="button" onClick={() => setCreating(false)} className="h-11 rounded-full px-5 text-sm font-medium text-fg-2 hover:text-fg">
                {t.common.back}
              </button>
            )}
            <button
              type="submit"
              disabled={!name.trim()}
              className="h-11 rounded-full bg-accent px-6 text-sm font-semibold text-accent-ink transition-transform active:scale-[0.97] disabled:opacity-40"
            >
              {t.dialogs.createAndAdd}
            </button>
          </div>
        </form>
      ) : (
        <div className="-mx-1 flex max-h-[55dvh] flex-col overflow-y-auto scroll-area">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-3"
          >
            <span className="grid size-11 place-items-center rounded-[0.625rem] bg-accent-soft text-accent-text">
              <PlusIcon size={20} />
            </span>
            <span className="font-medium">{t.nav.newPlaylist}</span>
          </button>
          {playlists.map((p) => {
            // Done only when it already has every track being added.
            const has = !!tracks && tracks.every((x) => p.tracks.some((t) => t.id === x.id));
            return (
              <button
                key={p.id}
                type="button"
                disabled={has}
                onClick={() => {
                  if (!tracks) return;
                  void add(p.id, many ? tracks : tracks[0]);
                  close(null);
                }}
                className={cn("flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-3", has && "opacity-60")}
              >
                <Artwork src={p.tracks[0]?.thumb} className="size-11 rounded-[0.625rem]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block text-sm text-fg-2">{t.common.tracks(p.tracks.length)}</span>
                </span>
                {has && <CheckIcon size={18} className="text-accent-text" />}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export function NamePlaylistDialog({
  open,
  initial = "",
  title,
  action,
  onSubmit,
  onClose,
}: {
  open: boolean;
  initial?: string;
  title: string;
  action: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const t = useT();
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="playlist-name" className="text-sm text-fg-2">
          {t.dialogs.name}
        </label>
        <input
          id="playlist-name"
          autoFocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.dialogs.namePlaceholder}
          className="h-12 rounded-full border border-line-strong bg-surface-1 px-5 text-[0.9375rem] placeholder:text-fg-3 focus:border-accent focus:outline-none"
        />
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={!name.trim()}
            className="h-11 rounded-full bg-accent px-6 text-sm font-semibold text-accent-ink transition-transform active:scale-[0.97] disabled:opacity-40"
          >
            {action}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const SHORTCUTS: [string | null, keyof Messages["dialogs"]["shortcuts"]][] = [
  [null, "playPause"], // the Space key, named in each language
  ["← →", "seek"],
  ["Shift + ← →", "skip"],
  ["↑ ↓", "volume"],
  ["M", "mute"],
  ["L", "favorite"],
  ["S", "shuffle"],
  ["R", "repeat"],
  ["V", "video"],
  ["F", "theater"],
  ["Q", "queue"],
  ["/", "search"],
  ["?", "help"],
];

export function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsOpen);
  const setOpen = useUi((s) => s.setShortcutsOpen);
  const t = useT();
  return (
    <Modal open={open} onClose={() => setOpen(false)} title={t.dialogs.shortcutsTitle}>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={what} className="contents">
            <dt className="flex justify-end">
              <kbd className="kbd">{keys ?? t.dialogs.space}</kbd>
            </dt>
            <dd className="text-fg-2">{t.dialogs.shortcuts[what]}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
