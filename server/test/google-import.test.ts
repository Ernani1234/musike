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
  const options = { adminPhone: `6${"0".repeat(10)}`, secret: "test-only-google-secret-".repeat(3), now: () => now };
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
    const second = randomUUID(); await f.accounts.db.run("INSERT INTO users(id,phone,created_at) VALUES(?,?,?)", [second, `6${"1".repeat(10)}`, Date.now()]);
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
