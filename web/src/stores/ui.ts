import { create } from "zustand";
import { desktop } from "../lib/desktop";
import type { Track } from "../lib/types";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
  action?: ToastAction;
}

export interface TrackMenuState {
  track: Track;
  /** Anchor point for the desktop popover. Mobile renders a bottom sheet instead. */
  x: number;
  y: number;
  playlistId?: string;
}

type Theme = "dark" | "light";
export type PanelTab = "playing" | "lyrics" | "queue";

interface UiState {
  theme: Theme;
  panelOpen: boolean;
  drawerOpen: boolean;
  panelTab: PanelTab;
  toasts: Toast[];
  menu: TrackMenuState | null;
  /** Tracks waiting for the "add to playlist" dialog: one from a track menu, many from the list search. */
  addToPlaylist: Track[] | null;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  /** Cinema view: the video maximized over everything. */
  theater: boolean;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  openPanel: (tab: PanelTab) => void;
  togglePanel: (tab: PanelTab) => void;
  /** Settings switch for the docked Now Playing panel on wide screens. */
  setPanelDocked: (open: boolean) => void;
  closePanel: () => void;
  toast: (message: string, tone?: Toast["tone"], action?: ToastAction) => void;
  dismissToast: (id: number) => void;
  openMenu: (m: TrackMenuState) => void;
  closeMenu: () => void;
  openAddToPlaylist: (tracks: Track[] | null) => void;
  setShortcutsOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setTheater: (open: boolean) => void;
}

const readTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
const readPanel = (): boolean => {
  try {
    return localStorage.getItem("musike:panel") !== "closed";
  } catch {
    return true;
  }
};

let toastSeq = 0;

export const useUi = create<UiState>((set, get) => ({
  theme: readTheme(),
  panelOpen: readPanel(),
  drawerOpen: false,
  panelTab: "playing",
  toasts: [],
  menu: null,
  addToPlaylist: null,
  shortcutsOpen: false,
  settingsOpen: false,
  theater: false,

  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0B0C0F" : "#E9EBEF");
    desktop?.setTheme(theme);
    try {
      localStorage.setItem("musike:theme", theme);
    } catch {
      /* private mode */
    }
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),

  openPanel: (panelTab) => {
    if (window.matchMedia("(min-width: 1280px)").matches) set({ panelOpen: true, panelTab });
    else set({ drawerOpen: true, panelTab });
  },
  togglePanel: (tab) => {
    const { panelOpen, drawerOpen, panelTab } = get();
    // ≥1280px the panel is a docked column (remembered); below it is a temporary drawer.
    if (!window.matchMedia("(min-width: 1280px)").matches) {
      return set({ drawerOpen: !(drawerOpen && panelTab === tab), panelTab: tab });
    }
    const open = !(panelOpen && panelTab === tab);
    try {
      localStorage.setItem("musike:panel", open ? "open" : "closed");
    } catch {
      /* private mode */
    }
    set({ panelOpen: open, panelTab: tab });
  },
  closePanel: () => set({ drawerOpen: false }),
  setPanelDocked: (open) => {
    try {
      localStorage.setItem("musike:panel", open ? "open" : "closed");
    } catch {
      /* private mode */
    }
    set({ panelOpen: open });
  },

  toast: (message, tone = "info", action) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone, action }] }));
    // Toasts with an action stay longer so there is time to reach the button.
    setTimeout(() => get().dismissToast(id), action ? 9000 : tone === "error" ? 5200 : 2800);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  openMenu: (menu) => set({ menu }),
  closeMenu: () => set({ menu: null }),
  openAddToPlaylist: (addToPlaylist) => set({ addToPlaylist, menu: null }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setTheater: (theater) => set({ theater }),
}));

export const toast = (message: string, tone?: Toast["tone"], action?: ToastAction) =>
  useUi.getState().toast(message, tone, action);
