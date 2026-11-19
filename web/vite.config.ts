import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
export default defineConfig({
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
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
      proxy: { "/api": "http://127.0.0.1:4180" },
    },
    preview: {
      proxy: { "/api": "http://127.0.0.1:4180" },
    },
});
