import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p: string[]) => path.join(here, "src", ...p);
const server = (...p: string[]) => path.join(here, "..", "server", "src", ...p);
const same = (a: string, b: string) => path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();

/**
 * The Android build (`vite build --mode native`): the same app, with the backend swapped. lib/api.ts (HTTP to the
 * Musike server) becomes native/api.ts (the server's own code, running in the app), and the two server modules that
 * only make sense on a computer (paths/environment, yt-dlp) are replaced by small stand-ins.
 */
function nativeBackend(): Plugin {
  const swaps: [from: string, to: string][] = [
    [src("lib", "api.ts"), src("native", "api.ts")],
    [src("lib", "offline.ts"), src("native", "offline.ts")],
    [server("config.ts"), src("native", "shims", "config.ts")],
    [server("ytdlp.ts"), src("native", "shims", "ytdlp.ts")],
  ];
  return {
    name: "musike-native-backend",
    enforce: "pre",
    async resolveId(source, importer, options) {
      // No service worker inside the app: it would only risk serving an old version after an update.
      if (source === "virtual:pwa-register") return "\0musike-no-pwa";
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const id = resolved.id.split("?")[0]!;
      for (const [from, to] of swaps) {
        // The replacement may import the original (native/api.ts re-exports lib/apiTypes, not lib/api).
        if (same(id, from) && !(importer && same(importer, to))) return to;
      }
      return null;
    },
    load(id) {
      if (id === "\0musike-no-pwa") return "export const registerSW = () => () => {};";
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const native = mode === "native";
  return {
    define: { __APP_VERSION__: JSON.stringify(version) },
    build: native ? { outDir: "dist-native", emptyOutDir: true } : undefined,
    plugins: [
      react(),
      tailwindcss(),
      native
        ? nativeBackend()
        : VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["favicon.svg", "apple-touch-icon.png"],
            manifest: {
              name: "Musike",
              short_name: "Musike",
              description: "Your music, uninterrupted.",
              lang: "en",
              theme_color: "#0B0C0F",
              background_color: "#0B0C0F",
              display: "standalone",
              start_url: "/",
              icons: [
                { src: "icon-192.png", sizes: "192x192", type: "image/png" },
                { src: "icon-512.png", sizes: "512x512", type: "image/png" },
                { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
              ],
            },
            workbox: {
              navigateFallbackDenylist: [/^\/api\//],
              runtimeCaching: [
                {
                  // Artwork only. Streams and API responses are never cached by the service worker.
                  urlPattern: ({ url }) => /(^|\.)ytimg\.com$|googleusercontent\.com$|ggpht\.com$/.test(url.hostname),
                  handler: "CacheFirst",
                  options: {
                    cacheName: "artwork",
                    expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
              ],
            },
          }),
    ],
    server: {
      proxy: native ? undefined : { "/api": "http://127.0.0.1:4180" },
    },
    preview: {
      proxy: native ? undefined : { "/api": "http://127.0.0.1:4180" },
    },
  };
});
