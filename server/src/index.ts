import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { startServer } from "./app.js";
import { config } from "./config.js";

const { port, tools } = await startServer();

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => `http://${i!.address}:${port}`);
console.log(`\n  Musike is running`);
console.log(`  Local:   http://localhost:${port}`);
for (const url of lan) console.log(`  Network: ${url}`);
if (!existsSync(config.webDist)) console.log(`  (web app not built: run "pnpm build" or use "pnpm dev")`);
console.log(`  yt-dlp:  ${tools.ytdlp ?? "NOT FOUND (install it from Musike's Settings)"}${config.ytdlpChannel ? ` (kept on ${config.ytdlpChannel})` : ""}`);
if (!tools.deno) console.log(`  Deno:    not found (YouTube may fail without it)`);
if (!tools.ffmpeg) console.log(`  FFmpeg:  not found (HD video unavailable)`);
console.log(`  Data:    ${path.relative(process.cwd(), config.dataDir) || config.dataDir}\n`);
