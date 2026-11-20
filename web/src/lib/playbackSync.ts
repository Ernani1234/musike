import { playbackCommand } from "./playbackCommands";
import { rememberOutput } from "./offlineDownloads";
import { create } from "zustand";
import { accountRequest } from "../stores/session";
import { getT } from "../i18n";
import { toast } from "../stores/ui";
import type { Track } from "./types";
import type { usePlayer } from "../player/player";

export interface SharedPlayback {
  queue: Track[]; original: Track[] | null; index: number; position: number; duration: number; status: "idle" | "loading" | "playing" | "paused" | "error";
  shuffle: boolean; repeat: "off" | "all" | "one"; autoRadio: boolean;
}
interface View { takeoverAvailable?: boolean; deviceId: string; active: string | null; epoch: number; revision: number; updatedAt: number; snapshot: SharedPlayback;
  devices: { id: string; name: string; online: boolean }[]; command: { id: string; action: string; args: unknown[] } | null; transfer: string | null; }
export const usePlaybackDevices = create<{ enabled: boolean; connected: boolean; view: View | null; error: string }>(() => ({ enabled: false, connected: false, view: null, error: "" }));
let allowed = true;
let jamControl: ((action: string, args: unknown[]) => unknown) | null = null;
export const setJamControl = (control: typeof jamControl) => { jamControl = control; };
let alignJam: ((snapshot: SharedPlayback) => void) | null = null;
export const alignJamPlayback = (snapshot: SharedPlayback) => alignJam?.(snapshot);
export const playbackCanOutput = () => allowed;
export const setOfflineOutput = (on: boolean) => { allowed = on; };
let claim: ((takeover?: boolean) => Promise<void>) | null = null;
let release: (() => Promise<void>) | null = null;
export const claimPlayback = (takeover = false) => claim?.(takeover);
export const releasePlayback = () => release?.() ?? Promise.resolve();
type Player = SharedPlayback & { suspendOutput: () => void; resumeOutput: (snapshot: SharedPlayback) => void; [key: string]: unknown };
type Store = typeof usePlayer;
const actions = ["playList", "playTrack", "playNext", "addToQueue", "removeAt", "jumpTo", "clearUpcoming", "startRadio", "toggle", "next", "prev", "seek", "toggleShuffle", "cycleRepeat", "setAutoRadio"];
// sessionStorage is cloned by some new-tab flows. An output identity belongs to this
// live document, so two tabs can never receive the same output grant accidentally.
const documentClientId = crypto.randomUUID();
/** Injected into the real player once AuthGate has established the owner. No server imports. */
export function startPlaybackSync(store: Store) {
  let stopped = false; let applying = false; let view: View | null = null; let seq = 0; let lastEpoch = -1;
  let controller: AbortController | null = null; let reconnect: ReturnType<typeof setTimeout> | null = null;
  let chain = Promise.resolve(); let lastCommand = ""; let transferAck = ""; let publishing = false; let dirty = false; let sentAt = 0;
  let lastPacketAt = Date.now();
  let transferAckAt = 0;
  const originals = new Map(actions.map((name) => [name, (store.getState() as unknown as Player)[name] as (...args: unknown[]) => unknown]));
  const clientId = documentClientId;
  const snapshot = (): SharedPlayback => {
    const s = store.getState(); const start = Math.max(0, s.index - 100); const queue = s.queue.slice(start, start + 500);
    const ids = new Set(queue.map((t) => t.id));
    return { queue, original: s.original?.filter((t) => ids.has(t.id)).slice(0, 500) ?? null, index: s.index - start, position: s.position,
      duration: s.duration, status: s.status, shuffle: s.shuffle, repeat: s.repeat, autoRadio: s.autoRadio };
  };
  const fail = (error: unknown) => {
    if (!stopped) usePlaybackDevices.setState({ error: (error as Error).message || getT().features.syncFailure });
  };
  const perform = (work: () => Promise<void>) => { chain = chain.then(() => { if (!stopped) return work(); }).catch(fail); return chain; };
  const post = (body: Record<string, unknown>) => accountRequest<View>("/api/playback/sync", { deviceId: view!.deviceId, ...body });
  const receive = (next: View) => {
    if (stopped || view && next.revision < view.revision) return;
    // The player restores shuffle using track object membership. JSON transport loses
    // those shared references, so reconnect the original order to this queue's objects.
    const byId = new Map(next.snapshot.queue.map((track) => [track.id, track]));
    next = { ...next, snapshot: { ...next.snapshot, original: next.snapshot.original?.map((track) => byId.get(track.id)).filter((track): track is Track => !!track) ?? null } };
    const wasAllowed = allowed; view = next; allowed = next.active === next.deviceId;
    void rememberOutput(allowed && !next.transfer, next.active, next.deviceId, !!next.transfer);
    if (lastEpoch !== next.epoch) { seq = 0; lastEpoch = next.epoch; lastCommand = ""; }
    applying = true;
    if (wasAllowed && !allowed) store.getState().suspendOutput();
    if (!allowed || !wasAllowed) store.setState({ ...next.snapshot, statusText: null, buffered: 0 });
    applying = false;
    usePlaybackDevices.setState({ view: next, connected: true, error: "" });
    if (allowed && next.transfer) {
      if (!transferAck) {
        transferAck = next.transfer;
        transferAckAt = Date.now();
        applying = true; store.getState().suspendOutput(); applying = false;
        void publish(undefined, true).finally(() => { transferAck = ""; });
      }
      return;
    }
    const command = next.command;
    if (allowed && command && command.id !== lastCommand) {
      lastCommand = command.id;
      void perform(async () => {
        if (!allowed || view?.transfer || view?.command?.id !== command.id) return;
        applying = true;
        try {
          if (command.action === "resume") store.getState().resumeOutput({ ...next.snapshot, status: "playing" });
          else if (command.action === "jam") store.getState().resumeOutput(command.args[0] as SharedPlayback);
          else await originals.get(command.action)?.(...command.args);
        } finally { applying = false; }
        await publishNow(command.id);
      });
    }
  };
  async function publishNow(ack?: string, pausedForTransfer = false) {
    if (!view || !allowed || stopped) return;
    const epoch = view.epoch;
    const current = snapshot();
    // The transfer grant requires the old device's state to read paused/idle, but
    // suspendOutput only flips the store status via an async audio event — an
    // immediate ack would snapshot "playing" and the grant would be refused until
    // some later retry (or never). The pause is already requested, so report it.
    if (pausedForTransfer) current.status = "paused";
    const result = await post({ type: "snapshot", epoch, seq: ++seq, snapshot: current, ack, pausedForTransfer });
    sentAt = Date.now(); receive(result);
  }
  function publish(ack?: string, pausedForTransfer = false): Promise<void> {
    return perform(() => publishNow(ack, pausedForTransfer));
  }
  const patches: Partial<Player> = {};
  for (const [name, original] of originals) patches[name] = (...args: unknown[]) => {
    if (applying) return original(...args);
    if (stopped) return;
    if (jamControl) { try { const command = playbackCommand(name, args); return jamControl(command.action, command.args); } catch (error) { fail(error); return; } }
    if (!view) { toast(getT().features.syncConnecting, "error"); return; }
    if (allowed && !view.transfer) return original(...args);
    try { const command = playbackCommand(name, args); return perform(async () => receive(await post({ type: "command", ...command }))); }
    catch (error) { fail(error); }
  };
  allowed = false; store.getState().suspendOutput(); store.setState(patches as Partial<ReturnType<Store["getState"]>>);
  usePlaybackDevices.setState({ enabled: true, connected: false });
  const unsubscribe = store.subscribe((state, previous) => {
    if (applying || !allowed) return;
    if (state.queue.length > 500) { applying = true; store.setState(snapshot()); applying = false; dirty = true; void publish(); return; }
    const changed = state.queue !== previous.queue || state.index !== previous.index || state.status !== previous.status || state.shuffle !== previous.shuffle || state.repeat !== previous.repeat || state.autoRadio !== previous.autoRadio;
    if (changed || state.position !== previous.position) dirty = true;
    if (changed && !publishing) { publishing = true; queueMicrotask(() => { publishing = false; if (dirty) { dirty = false; void publish(); } }); }
  });
  alignJam = (target) => {
    if (stopped || !allowed || view?.transfer || applying) return;
    const state = store.getState();
    // A full command already handles track changes. Polling corrects drift without repeatedly reloading audio.
    if (state.queue[state.index]?.id !== target.queue[target.index]?.id) {
      applying = true; try { store.getState().resumeOutput(target); } finally { applying = false; } return;
    }
    if (target.status === "paused" && ["playing", "loading"].includes(state.status)) {
      applying = true; try { store.getState().suspendOutput(); store.setState({ ...target, status: "paused" }); } finally { applying = false; } return;
    }
    if (target.status === "playing" && state.status === "playing" && Math.abs(state.position - target.position) > 1.2) {
      applying = true; try { originals.get("seek")?.(target.position); } finally { applying = false; }
    }
  };
  claim = (takeover = false) => perform(async () => { if (view) receive(await post({ type: "claim", takeover })); });
  release = () => perform(async () => {
    if (!view || !allowed) return;
    applying = true; store.getState().suspendOutput(); applying = false;
    receive(await post({ type: "snapshot", epoch: view.epoch, seq: ++seq, snapshot: snapshot(), release: true }));
  });
  async function connect() {
    if (stopped) return;
    reconnect = null;
    try {
      const registered = await accountRequest<View>("/api/playback/devices", { clientId, name: /Android|iPhone|iPad/.test(navigator.userAgent) ? getT().features.phoneDevice : getT().features.browserDevice });
      if (stopped) return;
      receive(registered);
      controller = new AbortController();
      const response = await fetch(`/api/playback/updates?deviceId=${encodeURIComponent(registered.deviceId)}`, { credentials: "same-origin", redirect: "manual", signal: controller.signal });
      if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error(getT().features.syncFailure);
      lastPacketAt = Date.now();
      const reader = response.body!.getReader(); const decoder = new TextDecoder(); let pending = "";
      try {
        while (!stopped) {
          const { done, value } = await reader.read(); if (done) break; lastPacketAt = Date.now(); pending += decoder.decode(value, { stream: true });
          if (pending.length > 2 * 1024 * 1024) throw new Error(getT().features.syncFailure);
          let end: number;
          while ((end = pending.indexOf("\n\n")) >= 0) {
            const part = pending.slice(0, end); pending = pending.slice(end + 2);
            if (!part.startsWith("data: ")) continue;
            // A single malformed frame must not tear down the whole sync connection.
            try { receive(JSON.parse(part.slice(6))); } catch {}
          }
        }
      } finally { await reader.cancel().catch(() => {}); }
    } catch (error) { if (!stopped) fail(error); }
    finally { if (!stopped) { usePlaybackDevices.setState({ connected: false }); reconnect = setTimeout(() => void connect(), 3000); } }
  }
  const timer = setInterval(() => {
    if (dirty && allowed && Date.now() - sentAt >= 5000) { dirty = false; void publish(); }
    if (view?.transfer && allowed && !transferAck && Date.now() - transferAckAt >= 5000) receive(view);
    if (view && Date.now() - sentAt >= 15000) { sentAt = Date.now(); void perform(async () => receive(await post({ type: "ping" }))); }
    if (Date.now() - lastPacketAt > 45000) controller?.abort();
  }, 1000);
  const resume = () => {
    if (!stopped && !usePlaybackDevices.getState().connected) {
      if (reconnect) { clearTimeout(reconnect); reconnect = null; void connect(); } else controller?.abort();
    }
  };
  addEventListener("online", resume);
  const pagehide = () => {
    if (!view || !allowed) return;
    applying = true; store.getState().suspendOutput(); applying = false;
    void fetch("/api/playback/sync", { method: "POST", credentials: "same-origin", keepalive: true, headers: { "content-type": "application/json", "x-musike-request": "1" },
      body: JSON.stringify({ deviceId: view.deviceId, type: "snapshot", epoch: view.epoch, seq: ++seq, snapshot: { position: store.getState().position }, release: true }) }).catch(() => {});
  };
  addEventListener("pagehide", pagehide);
  void connect();
  return () => {
    stopped = true; alignJam = null; jamControl = null; claim = null; release = null; clearInterval(timer); if (reconnect) clearTimeout(reconnect); controller?.abort(); unsubscribe(); removeEventListener("online", resume); removeEventListener("pagehide", pagehide);
    applying = true; store.getState().suspendOutput(); store.setState(Object.fromEntries(originals)); allowed = true;
    usePlaybackDevices.setState({ enabled: false, connected: false, view: null, error: "" });
  };
}
