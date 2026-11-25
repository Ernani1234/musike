import { contextBridge, ipcRenderer } from "electron";

// The only bridge between the web app and the desktop shell.
contextBridge.exposeInMainWorld("musikeDesktop", {
  platform: process.platform,
  setTheme: (theme: "dark" | "light") => ipcRenderer.send("musike:theme", theme),
  setLanguage: (lang: string) => ipcRenderer.send("musike:lang", lang),
  retry: () => ipcRenderer.send("musike:retry"),
  // Windows taskbar thumbnail controls
  updateMediaControls: (state: { hasTrack: boolean; playing: boolean; favorite: boolean; labels: { favorite: string; previous: string; play: string; next: string } }) =>
    ipcRenderer.send("musike:media", state),
  onMediaAction: (fn: (action: "toggle" | "next" | "previous" | "favorite") => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: "toggle" | "next" | "previous" | "favorite") => fn(action);
    ipcRenderer.on("musike:media-action", handler);
    return () => ipcRenderer.removeListener("musike:media-action", handler);
  },
});
