import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Accounts } from "../src/accounts.js";
import { GoogleImport, selectImportMatch } from "../src/googleImport.js";
import type { ImportSource, SourceTrack } from "../src/googleSource.js";
import { config } from "../src/config.js";

const sourceTrack = (n: number): SourceTrack => ({ id: String(n).padStart(11, "0"), title: `Song ${n}`, artist: "Fixture artist" });
const source: ImportSource = { collections: [
  { id: "playlist-source", name: "Ordered playlist", kind: "playlist", tracks: [sourceTrack(2), sourceTrack(1)] },
  { id: "album-source", name: "Saved album", kind: "album", tracks: [sourceTrack(3)] },
], likes: [sourceTrack(4)], history: [sourceTrack(6), sourceTrack(5)], unavailable: [] };
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-google-")); const previous = config.dataDir; config.dataDir = dir;
  let now = Date.now();
  const options = { adminPhone: "60120000001", secret: "test-only-google-secret-".repeat(3), now: () => now };
  const accounts = await Accounts.open(options);
  const user = (await accounts.db.get("SELECT id FROM users"))!.id as string;
  let exchanges = 0; let imports = 0; let resolutions = 0;
  const googleOptions = { clientId: "fixture-client", clientSecret: "fixture-not-a-real-secret", redirectUri: "https://musike.invalid/api/google/callback",
    transport: (async (url: unknown) => {
      if (String(url).includes("/token")) { exchanges++; return new Response(JSON.stringify({ access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600 })); }
      return new Response(null, { status: 200 });
    }) as typeof fetch,
    source: async () => { imports++; return structuredClone(source); },
    resolve: async (item: SourceTrack) => { resolutions++; return { ...item, duration: 10, thumb: "", art: "", kind: "song" as const }; },
  };
  const service = new GoogleImport(accounts, googleOptions);
  const connect = async (id: string) => {
    const { url } = await service.connect(id); const auth = new URL(url);
    assert.equal(auth.searchParams.get("scope"), "https://www.googleapis.com/auth/youtube.readonly");
    assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
    const state = auth.searchParams.get("state")!; await service.callback(state, "fixture-code"); return state;
  };
  const wait = async (id: string) => {
    for (let n = 0; n < 500; n++) {
      const status = await service.status(id); if (status.status && status.status !== "running") return status;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("Import did not finish");
  };
  return { accounts, options, googleOptions, service, user, connect, wait, counts: () => ({ exchanges, imports, resolutions }),
    advance: (ms: number) => { now += ms; }, cleanup: async () => { await service.close(); await accounts.close(); config.dataDir = previous; await rm(dir, { recursive: true, force: true }); } };
}

test("Google OAuth state is single use, tokens encrypted, and imports preserve order/origin idempotently", async () => {
  const f = await fixture();
  try {
    const state = await f.connect(f.user);
    await assert.rejects(f.service.callback(state, "fixture-code"), /expired/);
    const row = await f.accounts.db.get("SELECT encrypted,auto_sync FROM google_tokens WHERE user_id=?", [f.user]);
    assert.equal(row!.encrypted.includes("fixture-access"), false); assert.equal(row!.auto_sync, 0);
    const started = await Promise.all([f.service.start(f.user), f.service.start(f.user)]);
    assert.equal(started[0].runId, started[1].runId);
    const first = await f.wait(f.user); assert.equal(first.status, "done"); assert.equal(first.report.imported, 6);
    const lib = await f.accounts.library(f.user).getLibrary();
    assert.equal(lib.playlists.length, 2);
    assert.deepEqual(lib.playlists.find((p) => p.origin?.kind === "playlist")!.tracks.map((t) => t.id), [sourceTrack(2).id, sourceTrack(1).id]);
    assert.equal(lib.playlists.find((p) => p.origin?.kind === "album")!.name, "Saved album");
    assert.equal(lib.favorites[0]!.origin?.provider, "youtube-music");
    assert.deepEqual(lib.history.map((t) => t.id), [sourceTrack(6).id, sourceTrack(5).id]);
    const before = f.counts().resolutions; f.advance(1);
    await f.service.start(f.user); const again = await f.wait(f.user);
    assert.equal(again.report.imported, 0); assert.equal(again.report.alreadyPresent, 6); assert.equal(f.counts().resolutions, before);
    assert.equal((await f.accounts.library(f.user).getLibrary()).playlists.length, 2);
  } finally { await f.cleanup(); }
});

test("a second user's import stays isolated and daily sync is opt-in per user", async () => {
  const f = await fixture();
  try {
    const second = randomUUID(); await f.accounts.db.run("INSERT INTO users(id,phone,created_at) VALUES(?,?,?)", [second, "+60120000002", Date.now()]);
    await f.connect(f.user); await f.connect(second);
    await f.service.start(second); await f.wait(second);
    assert.equal((await f.accounts.library(f.user).getLibrary()).playlists.length, 0);
    assert.equal((await f.accounts.library(second).getLibrary()).playlists.length, 2);
    f.advance(2 * 86400_000); await f.service.syncDue(); assert.equal(f.counts().imports, 1);
    await f.service.setSync(f.user, true); f.advance(86400_001); await f.service.syncDue(); await f.wait(f.user);
    assert.equal(f.counts().imports, 2);
    assert.equal((await f.service.status(second)).autoSync, false);
    await f.service.setSync(f.user, false); f.advance(2 * 86400_000); await f.service.syncDue(); assert.equal(f.counts().imports, 2);
  } finally { await f.cleanup(); }
});

test("Google refresh credentials survive restart and missing categories are reported explicitly", async () => {
  const f = await fixture();
  try {
    await f.connect(f.user); await f.service.close(); await f.accounts.close();
    const accounts = await Accounts.open(f.options);
    const service = new GoogleImport(accounts, { ...f.googleOptions, source: async () => ({ ...structuredClone(source), unavailable: ["history:provider-unavailable"] }) });
    try {
      f.advance(3600_001); assert.equal((await service.tokens(f.user)).access_token, "fixture-access");
      await service.start(f.user);
      for (let n = 0; n < 500 && (await service.status(f.user)).status === "running"; n++) await new Promise((r) => setTimeout(r, 5));
      const status = await service.status(f.user); assert.equal(status.status, "partial");
      assert.ok(status.report.unavailable.includes("history:provider-unavailable"));
      await service.disconnect(f.user); assert.equal((await service.status(f.user)).connected, false);
    } finally { await service.close(); await accounts.close(); }
  } finally { await f.cleanup(); }
});


test("import matching rejects a wrong artist rather than importing the first search result", () => {
  const source = { id: "source00001", title: "Test song", artist: "Test artist" };
  const wrong = { id: "wrong000001", title: "Test song", channel: "Other artist" };
  const right = { id: "right000001", title: "Test song (Official Audio)", channel: "Test artist - Topic" };
  assert.equal(selectImportMatch(source, [wrong, right])?.id, right.id);
  assert.equal(selectImportMatch(source, [wrong]), null);
  assert.equal(selectImportMatch(source, [{ ...wrong, id: source.id }])?.id, source.id);
});

test("OAuth callback cannot bind another signed-in user's state", async () => {
  const f = await fixture();
  try {
    const { url } = await f.service.connect(f.user); const state = new URL(url).searchParams.get("state")!;
    await assert.rejects(f.service.callback(state, "fixture-code", "test-ip", "another-user"), /another account/);
    assert.equal((await f.service.status(f.user)).connected, false);
    await f.service.callback(state, "fixture-code", "test-ip", f.user);
    assert.equal((await f.service.status(f.user)).connected, true);
  } finally { await f.cleanup(); }
});


test("HTTP OAuth callback requires the originating account's session cookie", async () => {
  const { createApp } = await import("../src/app.js");
  const f = await fixture(); let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    app = await createApp({ ...f.options, enabled: true, google: f.googleOptions });
    const response = await app.inject({ url: "/api/google/callback?state=fixture&code=fixture" });
    assert.equal(response.statusCode, 401);
  } finally { await app?.close(); await f.cleanup(); }
});

test("import status exposes durable live item progress and owner-scoped cursor deltas before completion", async () => {
  const f = await fixture(); let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  f.googleOptions.resolve = async (item) => { if (item.id === sourceTrack(1).id) await held; return { ...item, duration: 10, thumb: "", art: "", kind: "song" }; };
  try {
    await f.connect(f.user); const { runId } = await f.service.start(f.user);
    let running = await f.service.status(f.user, 0, runId);
    for (let n = 0; n < 200 && (running.report?.progress.processed < 1 || running.report?.imported < 1); n++) { await new Promise((resolve) => setTimeout(resolve, 5)); running = await f.service.status(f.user, 0, runId); }
    assert.equal(running.status, "running"); assert.equal(running.report.progress.total, 6);
    assert.equal(running.report.progress.processed, 1); assert.equal(running.report.imported, 1);
    assert.equal(running.report.items[0].sourceId, sourceTrack(2).id);
    assert.equal((await f.service.status(f.user, 1, runId)).report.items.length, 0);
    assert.equal((await f.service.status("another-owner", 0, runId)).report, null);
    release(); const completed = await f.wait(f.user);
    assert.equal(completed.report.progress.phase, "complete"); assert.equal(completed.report.progress.processed, 6);
    const delta = await f.service.status(f.user, 1, runId); assert.equal(delta.report.items.length, 5); assert.equal(delta.itemOffset, 1);
  } finally { release(); await f.cleanup(); }
});

test("provider failures stay reviewable and re-import tops up only missing items", async () => {
  const f = await fixture(); const resolve = f.googleOptions.resolve;
  f.googleOptions.resolve = async (item) => { if (item.id === sourceTrack(1).id) throw new Error("fixture provider failure"); return resolve(item); };
  try {
    await f.connect(f.user); await f.service.start(f.user); const first = await f.wait(f.user);
    assert.equal(first.status, "partial"); assert.equal(first.report.reviewNeeded, 1); assert.equal(first.report.notFound, 0);
    assert.equal(first.report.items.find((item: any) => item.sourceId === sourceTrack(1).id).reason, "provider-unavailable");
    f.googleOptions.resolve = resolve; f.advance(1);
    await f.service.start(f.user); const retry = await f.wait(f.user);
    assert.equal(retry.report.imported, 1); assert.equal(retry.report.alreadyPresent, 5);
    assert.equal((await f.accounts.library(f.user).getLibrary()).playlists.length, 2);
  } finally { await f.cleanup(); }
});

test("original video validation precedes ordered search fallbacks without using Google playback tokens", async () => {
  const f = await fixture(); const modes: string[] = []; let originals = 0;
  const service = new GoogleImport(f.accounts, { ...f.googleOptions, resolve: undefined,
    original: async (item) => { originals++; return item.id === sourceTrack(2).id ? { ...item, duration: 10, thumb: "", art: "", kind: "song" } : null; },
    candidates: async (item, mode) => { modes.push(mode); return mode === "music" ? [{ id: String(Number(item.id) + 100).padStart(11, "0"), title: item.title, channel: item.artist }] : []; },
  });
  try {
    await f.connect(f.user); await service.start(f.user);
    for (let n = 0; n < 500 && (await service.status(f.user)).status === "running"; n++) await new Promise((r) => setTimeout(r, 5));
    const result = await service.status(f.user); assert.equal(result.report.imported, 6);
    assert.equal(originals, 6); assert.ok(modes.includes("music")); assert.equal(modes.includes("title"), false);
  } finally { await service.close(); await f.cleanup(); }
});

test("ambiguous replacements expose candidates rather than silently importing a different recording", async () => {
  const f = await fixture();
  const service = new GoogleImport(f.accounts, { ...f.googleOptions, resolve: undefined, original: async () => null,
    candidates: async (item) => [{ id: "candidate01", title: item.title, channel: item.artist }, { id: "candidate02", title: item.title, channel: item.artist }],
  });
  try {
    await f.connect(f.user); await service.start(f.user);
    for (let n = 0; n < 500 && (await service.status(f.user)).status === "running"; n++) await new Promise((r) => setTimeout(r, 5));
    const result = await service.status(f.user); assert.equal(result.status, "partial");
    assert.equal(result.report.imported, 0); assert.equal(result.report.reviewNeeded, 6);
    assert.ok(result.report.items.every((item: any) => item.status === "needs-review" && item.candidates.length === 2));
  } finally { await service.close(); await f.cleanup(); }
});

test("restart recovery preserves completed item checkpoints rather than erasing their report", async () => {
  const f = await fixture();
  try {
    const report = { items: [{ sourceId: "fixture", title: "Completed fixture", kind: "like", status: "imported" }], unavailable: [], imported: 1,
      progress: { phase: "matching", processed: 1, total: 2, startedAt: Date.now(), updatedAt: Date.now() } };
    await f.accounts.db.run("INSERT INTO import_runs(id,user_id,status,created_at,report) VALUES(?,?,'running',?,?)", [randomUUID(), f.user, Date.now(), JSON.stringify(report)]);
    await f.service.recover(); const status = await f.service.status(f.user);
    assert.equal(status.status, "error"); assert.equal(status.report.imported, 1); assert.equal(status.report.items[0].title, "Completed fixture");
    assert.equal(status.report.progress.phase, "cancelled");
  } finally { await f.cleanup(); }
});
