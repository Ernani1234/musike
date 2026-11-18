import { create } from "zustand";
import type { Messages } from "../i18n/en";
import type { ImportResult, MusikeApi } from "../lib/apiTypes";
import { OptimisticQueue } from "../lib/optimisticQueue";
import type { Library, Playlist, Track } from "../lib/types";

interface LibraryState extends Library {
  status: "idle" | "loading" | "ready" | "error";
  load: () => Promise<void>;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (t: Track) => Promise<void>;
  addFavorites: (tracks: Track[]) => Promise<void>;
  recordPlay: (t: Track) => void;
  createPlaylist: (name: string, tracks?: Track[]) => Promise<Playlist | null>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  addToPlaylist: (id: string, t: Track | Track[]) => Promise<void>;
  removeFromPlaylist: (id: string, trackId: string) => Promise<void>;
  importLibrary: (backup: unknown, mode: "merge" | "replace") => Promise<ImportResult>;
}

const replacePlaylist = (list: Playlist[], p: Playlist) => list.map((x) => x.id === p.id ? p : x);

/** Injectable dependencies keep optimistic ordering testable without browser globals or media elements. */
export function createLibraryStore(api: MusikeApi, messages: () => Messages, toast: (message: string, tone?: "info" | "error") => void) {
  return create<LibraryState>((set, get) => {
    const empty: Library = { favorites: [], playlists: [], history: [] };
    const writes = new OptimisticQueue<Library>(empty, (data) => set(data));
    const identity = (data: Library) => data;
    const report = (e: unknown) => toast((e as Error).message, "error");
    let loading: Promise<void> | null = null;
    return {
      ...empty,
      status: "idle",
      load: () => {
        if (loading) return loading;
        set({ status: "loading" });
        loading = writes.run(identity, () => api.library(), (_state, data) => data).then(
          () => { set({ status: "ready" }); },
          () => { set({ status: "error" }); },
        ).finally(() => { loading = null; });
        return loading;
      },
      isFavorite: (id) => get().favorites.some((t) => t.id === id),
      toggleFavorite: async (track) => {
        const on = !get().isFavorite(track.id);
        const apply = (data: Library): Library => ({ ...data, favorites: on
          ? [track, ...data.favorites.filter((t) => t.id !== track.id)]
          : data.favorites.filter((t) => t.id !== track.id) });
        try {
          await writes.run(apply, () => on ? api.addFavorite(track) : api.removeFavorite(track.id),
            (data, result) => ({ ...data, favorites: result.favorites }));
          toast(on ? messages().toasts.addedFavorite : messages().toasts.removedFavorite);
        } catch (e) { report(e); }
      },
      addFavorites: async (tracks) => {
        const seen = new Set(get().favorites.map((track) => track.id));
        const fresh = tracks.filter((t) => !seen.has(t.id) && !!seen.add(t.id));
        if (!fresh.length) return toast(messages().toasts.allAlreadyFavorites);
        try {
          await writes.run((data) => {
            const ids = new Set(data.favorites.map((track) => track.id));
            return { ...data, favorites: [...fresh.filter((track) => !ids.has(track.id)), ...data.favorites] };
          }, () => api.addFavorites(fresh), (data, result) => ({ ...data, favorites: result.favorites }));
          toast(fresh.length === 1 ? messages().toasts.addedFavorite : messages().toasts.addedFavorites(fresh.length));
        } catch (e) { report(e); }
      },
      recordPlay: (track) => {
        void writes.run((data) => ({ ...data, history: [track, ...data.history.filter((t) => t.id !== track.id)].slice(0, 60) }),
          () => api.pushHistory(track), (data, result) => ({ ...data, history: result.history })).catch(() => {});
      },
      createPlaylist: async (name, tracks = []) => {
        try {
          const p = await writes.run(identity, () => api.createPlaylist(name, tracks),
            (data, p) => ({ ...data, playlists: [p, ...data.playlists] }));
          toast(messages().toasts.playlistCreated(p.name));
          return p;
        } catch (e) { report(e); return null; }
      },
      renamePlaylist: async (id, name) => {
        try {
          await writes.run((data) => ({ ...data, playlists: data.playlists.map((p) => p.id === id ? { ...p, name } : p) }),
            () => api.renamePlaylist(id, name), (data, p) => ({ ...data, playlists: replacePlaylist(data.playlists, p) }));
        } catch (e) { report(e); }
      },
      deletePlaylist: async (id) => {
        try {
          const remove = (data: Library) => ({ ...data, playlists: data.playlists.filter((p) => p.id !== id) });
          await writes.run(remove, () => api.deletePlaylist(id), remove);
          toast(messages().toasts.playlistDeleted);
        } catch (e) { report(e); }
      },
      addToPlaylist: async (id, tracks) => {
        try {
          let before = 0;
          const p = await writes.run(identity, () => {
            before = get().playlists.find((p) => p.id === id)?.tracks.length ?? 0;
            return api.addToPlaylist(id, tracks);
          }, (data, p) => ({ ...data, playlists: replacePlaylist(data.playlists, p) }));
          const added = p.tracks.length - before;
          const t = messages();
          if (!Array.isArray(tracks) || added === 1) toast(t.toasts.addedTo(p.name));
          else toast(added ? t.toasts.addedManyTo(added, p.name) : t.toasts.allAlreadyIn(p.name));
        } catch (e) { report(e); }
      },
      removeFromPlaylist: async (id, trackId) => {
        try {
          await writes.run((data) => ({ ...data, playlists: data.playlists.map((p) => p.id === id
            ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p) }), () => api.removeFromPlaylist(id, trackId),
          (data, p) => ({ ...data, playlists: replacePlaylist(data.playlists, p) }));
        } catch (e) { report(e); }
      },
      importLibrary: (backup, mode) => writes.run(identity, async () => {
        const result = await api.importLibrary(backup, mode);
        const data = await api.library();
        return { result, data };
      }, (_data, result) => result.data).then(({ result }) => { set({ status: "ready" }); return result; }),
    };
  });
}
