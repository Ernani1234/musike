import assert from "node:assert/strict";
import { test } from "node:test";
import { TaskQueue, QueueError } from "../src/taskQueue.js";
import { runProcess, ProcessError, stopProcesses } from "../src/process.js";

test("job queue enforces active and waiting bounds and recovers from failure", async () => {
  const queue = new TaskQueue(1, 1, 10_000);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let active = 0;
  let highest = 0;
  const first = queue.run(async () => { highest = Math.max(highest, ++active); await gate; active--; throw new Error("failed"); });
  const failed = assert.rejects(first, /failed/);
  const second = queue.run(async () => { highest = Math.max(highest, ++active); active--; return 2; });
  await assert.rejects(queue.run(async () => 3), (error) => error instanceof QueueError && error.reason === "full");
  release();
  await failed;
  assert.equal(await second, 2);
  assert.equal(highest, 1);
  assert.equal(await queue.run(async () => 4), 4);
});

test("queued jobs expire without executing, and shutdown rejects waiting/new work", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const queue = new TaskQueue(1, 2, 1000);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = queue.run(() => gate);
  let ran = false;
  const expired = assert.rejects(queue.run(async () => { ran = true; }), (e) => e instanceof QueueError && e.reason === "timeout");
  t.mock.timers.tick(1000);
  await expired;
  const waiting = assert.rejects(queue.run(async () => {}), (e) => e instanceof QueueError && e.reason === "closed");
  queue.close();
  await waiting;
  await assert.rejects(queue.run(async () => {}), /closed/);
  release(); await first;
  assert.equal(ran, false);
});

test("process runner captures output and reports spawn failure", async () => {
  const result = await runProcess(process.execPath, ["-e", "console.log('ok'); console.error('warning')"], process.env, 5000);
  assert.equal(result.stdout.trim(), "ok");
  assert.equal(result.stderr.trim(), "warning");
  assert.equal(result.code, 0);
  await assert.rejects(runProcess("/does-not-exist-musike", [], process.env, 5000), (e) => e instanceof ProcessError && e.reason === "spawn");
});

test("process output and runtime limits terminate the underlying child", async () => {
  await assert.rejects(runProcess(process.execPath, ["-e", "process.stdout.write('x'.repeat(10000)); setInterval(()=>{},1000)"], process.env, 5000, 128),
    (e) => e instanceof ProcessError && e.reason === "output");
  await assert.rejects(runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], process.env, 100),
    (e) => e instanceof ProcessError && e.reason === "timeout");
});

test("shutdown terminates active media processes", async () => {
  const task = runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], process.env, 5000);
  const stopped = assert.rejects(task, (e) => e instanceof ProcessError && e.reason === "shutdown");
  stopProcesses();
  await stopped;
});
