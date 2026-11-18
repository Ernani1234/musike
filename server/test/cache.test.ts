import assert from "node:assert/strict";
import { test } from "node:test";
import { cached } from "../src/cache.js";

test("async cache shares in-flight work and retains null results", async () => {
  let calls = 0;
  const load = cached(60_000, async () => { calls++; return null; });
  await Promise.all([load("one"), load("one")]);
  await load("one");
  assert.equal(calls, 1);
});

test("cache failures retry and oldest entries are evicted at capacity", async () => {
  let calls = 0;
  const load = cached(60_000, async (key) => {
    calls++;
    if (calls === 1) throw new Error("transient");
    return key;
  }, 2);
  await assert.rejects(load("one"), /transient/);
  await load("one");
  await load("two");
  await load("three");
  await load("one");
  assert.equal(calls, 5);
});

test("expired cache entries reload", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100 });
  let calls = 0;
  const load = cached(1000, async () => ++calls);
  assert.equal(await load("one"), 1);
  t.mock.timers.tick(1000);
  assert.equal(await load("one"), 2);
});
