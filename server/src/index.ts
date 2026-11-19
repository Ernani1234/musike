import { existsSync } from "node:fs";
import { startServer } from "./app.js";
import { config } from "./config.js";

if (process.argv[2] === "promote") {
  await (await import("./promote.js")).promote(process.argv.slice(3));
} else {
const { port, tools } = await startServer();

// Container output is the operational log stream; avoid tool output, local paths and credentials.
process.stdout.write(JSON.stringify({ at: Date.now(), event: "server.started", port,
  webBuilt: existsSync(config.webDist), tools: { ytdlp: !!tools.ytdlp, deno: !!tools.deno, ffmpeg: !!tools.ffmpeg } }) + "\n");
}
