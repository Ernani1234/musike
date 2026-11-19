import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
const wrapper = path.resolve("../deploy/ytdlp-wrap.sh");
const options = { skip: process.platform === "win32" ? "POSIX shell wrapper" : false };
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-wrapper-")); const binary = path.join(dir, "tool");
  await writeFile(binary, `#!${process.execPath}\nconst fs=require('node:fs');const p=process.env.STATE;const n=fs.existsSync(p)?Number(fs.readFileSync(p)):0;fs.writeFileSync(p,String(n+1));\nif(process.env.MODE==='hang'){fs.writeFileSync(process.env.PIDFILE,String(process.pid));setInterval(()=>{},1000);}else if(process.env.MODE==='fatal'||process.env.MODE==='always'||process.env.MODE==='transient'&&n===0){console.log('discarded partial output');console.error(process.env.MODE==='fatal'?'ERROR: HTTP Error 429':'ERROR: HTTP Error 503');process.exit(7);}else console.log(JSON.stringify({ok:true,args:process.argv.slice(2)}));\n`);
  await chmod(binary, 0o755);
  const env = { ...process.env, YTDLP_REAL_PATH: binary, STATE: path.join(dir, "state"), PIDFILE: path.join(dir, "pid"), TMPDIR: dir, YTDLP_WRAP_RETRY_DELAY: "0", YTDLP_DELAY: "0" };
  return { dir, env, calls: async () => Number(await readFile(env.STATE, "utf8")), close: () => rm(dir, { recursive: true, force: true }) };
}
test("wrapper has no implicit success delay and preserves metadata arguments", options, async () => {
  const f = await fixture();
  try {
    const env = { ...f.env }; delete (env as any).YTDLP_DELAY;
    const result = spawnSync(wrapper, ["-J", "fixture target"], { env, encoding: "utf8", timeout: 1000 });
    assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(result.stdout).args, ["-J", "fixture target"]); assert.equal(await f.calls(), 1);
  } finally { await f.close(); }
});
test("wrapper retries transient metadata failures with clean final stdout and a bounded cap", options, async () => {
  const f = await fixture();
  try {
    const result = spawnSync(wrapper, ["-J"], { env: { ...f.env, MODE: "transient" }, encoding: "utf8", timeout: 2000 });
    assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).ok, true); assert.equal(await f.calls(), 2);
    assert.match(result.stderr, /reason=transient/);
    await rm(f.env.STATE);
    const failure = spawnSync(wrapper, ["-J"], { env: { ...f.env, MODE: "always", YTDLP_WRAP_MAX_ATTEMPTS: "3" }, encoding: "utf8", timeout: 2000 });
    assert.equal(failure.status, 7); assert.equal(await f.calls(), 3);
  } finally { await f.close(); }
});
test("wrapper fails fast for rate limits and does not retry download/version commands", options, async () => {
  const f = await fixture();
  try {
    for (const args of [["-J"], ["--version"], ["-o", "file", "target"]]) {
      await rm(f.env.STATE, { force: true });
      const result = spawnSync(wrapper, args, { env: { ...f.env, MODE: "fatal" }, encoding: "utf8", timeout: 1000 });
      assert.equal(result.status, 7); assert.equal(await f.calls(), 1);
    }
  } finally { await f.close(); }
});
test("explicit success-delay override can disable the deployed legacy delay", options, async () => {
  const f = await fixture();
  try {
    const result = spawnSync(wrapper, ["-J"], { env: { ...f.env, YTDLP_DELAY: "4", YTDLP_WRAP_SUCCESS_DELAY: "0" }, encoding: "utf8", timeout: 1000 });
    assert.equal(result.status, 0);
  } finally { await f.close(); }
});
test("wrapper forwards termination and reaps its metadata child", options, async () => {
  const f = await fixture(); const child = spawn(wrapper, ["-J"], { env: { ...f.env, MODE: "hang" }, stdio: "ignore" });
  const closed = new Promise<number | null>((resolve) => child.once("close", resolve));
  try {
    let pid = 0;
    for (let n = 0; n < 200; n++) { try { pid = Number(await readFile(f.env.PIDFILE, "utf8")); break; } catch { await new Promise((r) => setTimeout(r, 5)); } }
    assert.ok(pid); child.kill("SIGTERM"); assert.equal(await closed, 143);
    assert.throws(() => process.kill(pid, 0), (error: any) => error.code === "ESRCH");
  } finally { child.kill("SIGKILL"); await f.close(); }
});
