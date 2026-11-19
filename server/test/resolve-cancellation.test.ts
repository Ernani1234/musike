import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveStreams, clearResolved } from "../src/ytdlp.js";
import { config } from "../src/config.js";
import { refreshTools } from "../src/tools.js";

test("resolution cancellation keeps other consumers/processes alive and an immediately rejoined ID recovers", { skip: process.platform === "win32" ? "POSIX executable fixture" : false }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-resolve-owner-")); const previous = config.ytdlpPath;
  const tool = path.join(dir, "tool"); const calls = path.join(dir, "calls");
  await writeFile(tool, `#!${process.execPath}\nconst fs=require('node:fs');const id=new URL(process.argv.at(-1)).searchParams.get('v');fs.appendFileSync(${JSON.stringify(calls)},id+'\\n');setTimeout(()=>console.log(JSON.stringify({title:'Fixture',formats:[{format_id:'140',ext:'m4a',acodec:'mp4a',vcodec:'none',url:'https://media.invalid/audio?expire=9999999999'}]})),100);\n`);
  await chmod(tool, 0o755); config.ytdlpPath = tool; await refreshTools(); clearResolved();
  try {
    const first = new AbortController(); const second = new AbortController();
    const one = resolveStreams("00000000801", first.signal); const two = resolveStreams("00000000801", second.signal); void one.catch(() => {});
    first.abort(); await assert.rejects(one, { name: "AbortError" }); assert.equal((await two).id, "00000000801");
    assert.equal((await readFile(calls, "utf8")).trim().split("\n").length, 1);
    const cancelled = new AbortController(); const obsolete = resolveStreams("00000000802", cancelled.signal); void obsolete.catch(() => {});
    const independent = resolveStreams("00000000803");
    for (let n = 0; n < 200 && !(await readFile(calls, "utf8")).includes("00000000802"); n++) await new Promise((r) => setTimeout(r, 2));
    cancelled.abort(); await assert.rejects(obsolete, { name: "AbortError" });
    const rejoined = resolveStreams("00000000802");
    assert.equal((await independent).id, "00000000803"); assert.equal((await rejoined).id, "00000000802");
  } finally { clearResolved(); config.ytdlpPath = previous; await refreshTools(); await rm(dir, { recursive: true, force: true }); }
});
