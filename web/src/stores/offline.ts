import { create } from "zustand";
import { getT } from "../i18n";
import { capabilities } from "../lib/api";
import type { OfflineEntry } from "../lib/apiTypes";
import { offline as device } from "../lib/offline";
import type { Track } from "../lib/types";
import { toast } from "./ui";

/**
 * What is saved on the device, and the queue that saves more.
 *
 * One track at a time: yt-dlp and the download itself already use the connection and the CPU, so a playlist fills
 * up in order instead of all at once. Progress is per track, and the caller sees the list grow as each one lands.
 */

interface OfflineState {
  /** True once the saved list has been read from disk, so "not saved" can be trusted. */
  ready: boolean;
  entries: Record<string, OfflineEntry>;
  /** The track being saved right now (0–1 progress), if any. */
  active: { id: string; title: string; progress: number } | null;
  /** Tracks waiting their turn. */
  waiting: Track[];
  init: () => Promise<void>;
  /** Saves tracks (a playlist, a selection, one song), skipping the ones already saved. */
  save: (tracks: Track[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Removes several at once (a playlist's worth), with a single notice. */
  removeMany: (ids: string[]) => Promise<void>;
  clear: () => Promise<void>;
  isSaved: (id: string) => boolean;
  bytes: () => number;
}

/**
 * Whether the offline controls are shown at all. Downloads are an Android-app feature: the phone app and the TV
 * app are the same build, so both get them; the browser and the desktop app stream and never show these.
 */
export const offlineUi = () => capabilities.offline;

let working = false;

async function pump() {
  if (working) return;
  working = true;
  let saved = 0;
  let failed = 0;
  let lastName = "";
  try {
    for (;;) {
      const next = useOffline.getState().waiting[0];
      if (!next) break;
      const id = next.id;
      useOffline.setState((s) => ({
        waiting: s.waiting.slice(1),
        active: { id, title: next.title, progress: 0 },
      }));
      try {
        const entry = await device.save(next, (progress) =>
          useOffline.setState((s) => (s.active?.id === id ? { active: { ...s.active, progress } } : {})),
        );
        useOffline.setState((s) => ({ entries: { ...s.entries, [id]: entry } }));
        saved += 1;
        lastName = next.title;
      } catch {
        failed += 1;
      }
      useOffline.setState({ active: null });
    }
  } finally {
    working = false;
  }
  const t = getT().offline;
  if (failed) toast(t.failed(failed), "error");
  else if (saved === 1) toast(t.savedOne(lastName));
  else if (saved > 1) toast(t.savedMany(saved));
}

export const useOffline = create<OfflineState>((set, get) => ({
  ready: false,
  entries: {},
  active: null,
  waiting: [],

  init: async () => {
    if (!device.supported) return set({ ready: true });
    try {
      set({ entries: await device.load(), ready: true });
    } catch {
      set({ ready: true });
    }
  },

  save: async (tracks) => {
    if (!device.supported) return;
    const { entries, waiting } = get();
    const queued = new Set(waiting.map((t) => t.id));
    const fresh = tracks.filter((t) => !entries[t.id] && !queued.has(t.id));
    if (!fresh.length) return toast(getT().offline.alreadySaved);
    set({ waiting: [...waiting, ...fresh] });
    void pump();
  },

  remove: async (id) => {
    await device.remove(id);
    set((s) => {
      const entries = { ...s.entries };
      delete entries[id];
      return { entries };
    });
    toast(getT().offline.removed);
  },

  removeMany: async (ids) => {
    await Promise.all(ids.map((id) => device.remove(id).catch(() => {})));
    set((s) => {
      const entries = { ...s.entries };
      for (const id of ids) delete entries[id];
      return { entries };
    });
    toast(getT().offline.removedAll);
  },

  clear: async () => {
    await device.clear();
    set({ entries: {}, waiting: [] });
    toast(getT().offline.removedAll);
  },

  isSaved: (id) => get().entries[id] !== undefined,

  bytes: () => Object.values(get().entries).reduce((sum, e) => sum + (e.size || 0), 0),
}));

