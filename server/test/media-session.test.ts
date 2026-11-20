import assert from "node:assert/strict";
import { test } from "node:test";
import { mediaMetadata, mediaPlaybackState, registerMediaActions } from "../../web/src/lib/mediaSession.ts";
import { playbackCommand } from "../../web/src/lib/playbackCommands.ts";

test("media state retains loading intent and action handlers make play/pause idempotent", () => {
  assert.equal(mediaPlaybackState("loading", true, true), "playing");
  assert.equal(mediaPlaybackState("loading", false, true), "paused");
  assert.equal(mediaPlaybackState("error", true, true), "paused");
  assert.equal(mediaPlaybackState("idle", true, false), "none");
  const handlers = new Map(); let toggles = 0; let status = "loading";
  registerMediaActions({ setActionHandler: (name: string, action: unknown) => handlers.set(name, action) } as any,
    () => ({ status, position: 3, toggle: () => { toggles++; status = status === "paused" ? "playing" : "paused"; }, next() {}, prev() {}, seek() {} }));
  handlers.get("play")(); assert.equal(toggles, 0);
  handlers.get("pause")(); assert.equal(toggles, 1); assert.equal(status, "paused");
  handlers.get("pause")(); assert.equal(toggles, 1);
  handlers.get("play")(); assert.equal(toggles, 2);
});
test("media metadata tolerates absent or invalid artwork", () => {
  const t = { id: "abcdefghijk", title: "Fixture", artist: "Fixture", duration: 1, kind: "song" as const, thumb: "", art: "javascript:bad" };
  assert.deepEqual(mediaMetadata(t).artwork, []);
  assert.equal(mediaMetadata({ ...t, art: "https://i.ytimg.com/a.jpg", thumb: "https://i.ytimg.com/a.jpg" }).artwork?.length, 1);
});
test("wire commands strip zero-argument callback events and reject non-data arguments", () => {
  const event: any = { target: {} }; event.target.fiber = event;
  for (const action of ["toggle", "next", "prev", "clearUpcoming", "toggleShuffle", "cycleRepeat"]) assert.equal(JSON.stringify(playbackCommand(action, [event])), JSON.stringify({ action, args: [] }));
  assert.throws(() => playbackCommand("seek", [event]));
  assert.throws(() => playbackCommand("setAutoRadio", [event]));
  assert.throws(() => playbackCommand("unknown", []));
  const track = { id: "abcdefghijk", title: "Fixture", artist: "Fixture", duration: 1, kind: "song", thumb: "", art: "", event };
  assert.doesNotThrow(() => JSON.stringify(playbackCommand("playTrack", [track])));
});
