// Bundles the Electron main process (with the whole Musike server inside) and the preload script.
// The packaged app then needs no node_modules at all.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [path.join(root, "src", "main.mts")],
  outfile: path.join(out, "main.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["electron"],
  // Some bundled CommonJS dependencies call require() for Node built-ins.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  sourcemap: false,
  minify: false,
  logLevel: "warning",
});

await build({
  entryPoints: [path.join(root, "src", "preload.ts")],
  outfile: path.join(out, "preload.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  logLevel: "warning",
});

copyFileSync(path.join(root, "src", "splash.html"), path.join(out, "splash.html"));
copyFileSync(path.join(root, "build", "icon.png"), path.join(out, "icon.png"));
for (const file of readdirSync(path.join(root, "src", "thumbar"))) {
  copyFileSync(path.join(root, "src", "thumbar", file), path.join(out, `thumbar-${file}`));
}
console.log("desktop bundle ok");
