import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { downloadHd, pruneCache } from "../src/ytdlp.js";
import { config } from "../src/config.js";
import { refreshTools } from "../src/tools.js";

test("HD downloads coalesce, async cache hits avoid tools, and pruning coalesces safely", { skip: process.platform === "win32" ? "POSIX executable fixture" : false }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-hd-"));
  const previous = { cacheDir: config.cacheDir, cacheMaxBytes: config.cacheMaxBytes, ytdlpPath: config.ytdlpPath };
  try {
    config.cacheDir = dir;
    config.cacheMaxBytes = 1024;
    const tool = path.join(dir, "media-tool");
    const log = path.join(dir, "calls.txt");
    await writeFile(tool, `#!${process.execPath}\nconst fs=require('node:fs'); const a=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(log)},'run\\n'); fs.writeFileSync(a[a.indexOf('-o')+1],'video');\n`);
    await chmod(tool, 0o755);
    config.ytdlpPath = tool;
    await refreshTools();
    const one = downloadHd("00000000001");
    const two = downloadHd("00000000001");
    assert.equal(one, two);
    const file = await one;
    assert.equal(await readFile(file, "utf8"), "video");
    await downloadHd("00000000001");
    assert.equal(await readFile(log, "utf8"), "run\n");
    const old = path.join(dir, "00000000002.720.mp4");
    await writeFile(old, "old-video");
    await utimes(old, new Date(0), new Date(0));
    config.cacheMaxBytes = 5;
    const a = pruneCache();
    const b = pruneCache();
    assert.equal(a, b);
    await a;
    await assert.rejects(readFile(old), { code: "ENOENT" });
    assert.equal(await readFile(file, "utf8"), "video");
  } finally {
    Object.assign(config, previous);
    await refreshTools();
    await rm(dir, { recursive: true, force: true });
  }
});
