import assert from "node:assert/strict";
import { test } from "node:test";
import { upcomingTracks } from "../../web/src/lib/playbackQueue.js";

test("lookahead preserves optimistic/manual order and wraps repeat-all without duplicate IDs", () => {
  const queue = ["a", "b", "c", "b", "d"].map((id) => ({ id }));
  assert.deepEqual(upcomingTracks(queue, 1, 3, "off").map((t) => t.id), ["c", "d"]);
  assert.deepEqual(upcomingTracks(queue, 4, 3, "all").map((t) => t.id), ["a", "b", "c"]);
  assert.deepEqual(upcomingTracks(queue, 4, 3, "one"), []);
  assert.deepEqual(upcomingTracks(queue, 0, 0, "off"), []);
});
