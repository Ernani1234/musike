import type { OfflineApi } from "./apiTypes";

/**
 * The browser, the desktop app and the web/PWA build keep nothing on the device: every stream comes from the
 * Musike server (which does the same work with yt-dlp). Offline downloads are an Android-app feature, so this
 * stand-in says "not supported" and the build swaps in native/offline.ts on the phone.
 */
const no = async () => {
  throw new Error("Offline downloads are not available here.");
};

export const offline: OfflineApi = {
  supported: false,
  load: async () => ({}),
  entry: async () => null,
  save: no as OfflineApi["save"],
  remove: async () => {},
  clear: async () => {},
  src: async () => null,
};
