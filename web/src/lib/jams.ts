import { playbackCommand } from "./playbackCommands";
import { create } from "zustand";
import { accountRequest } from "../stores/session";
import { alignJamPlayback, claimPlayback, setJamControl, usePlaybackDevices, type SharedPlayback } from "./playbackSync";
import { getT } from "../i18n";
import { toast } from "../stores/ui";
export interface JamView { id: string; owner: string; host: string | null; version: number; updatedAt: number; serverNow: number;
  guestControls: boolean; locked: boolean; snapshot: SharedPlayback; members: { id: string; name: string; online: boolean }[]; }
export const useJam = create<{ view: JamView | null; error: string }>(() => ({ view: null, error: "" }));
let generation = 0;
let commands = Promise.resolve();
function receive(view: JamView | null, transit = 0) {
  const previous = useJam.getState().view;
  if (previous && view?.id === previous.id && view.version < previous.version) return;
  useJam.setState({ view, error: "" });
  if (!view) { setJamControl(null); return; }
  setJamControl((action, args) => {
    ({ action, args } = playbackCommand(action, args));
    const stamp = generation;
    commands = commands.then(async () => {
      const current = useJam.getState().view; if (!current || generation !== stamp) return;
      try {
        const next = await accountRequest<JamView>(`/api/jams/${current.id}/commands`, { action, args, version: current.version });
        if (generation === stamp) receive(next);
      } catch (e) {
        // A version conflict means this command raced a concurrent update. Refresh
        // the view once and replay the command against the new version instead of
        // making the user tap again.
        if ((e as Error & { status?: number }).status === 409) {
          try { const fresh = await accountRequest<JamView | null>("/api/jams"); if (fresh && generation === stamp) { receive(fresh); const now = useJam.getState().view!;
            const retried = await accountRequest<JamView>(`/api/jams/${now.id}/commands`, { action, args, version: now.version });
            if (generation === stamp) receive(retried); return; } } catch {}
        }
        useJam.setState({ error: (e as Error).message }); toast((e as Error).message, "error");
      }
    });
  });
  const state = view.snapshot;
  const elapsed = state.status === "playing" ? Math.max(0, view.serverNow - view.updatedAt + transit) / 1000 : 0;
  alignJamPlayback({ ...state, position: Math.min(state.duration || 604800, state.position + elapsed) });
}
export async function jamAction(path: string, body?: unknown, method?: string) {
  const stamp = ++generation;
  const result = await accountRequest<JamView | { ok: boolean }>(path, body, method);
  if (generation === stamp) { if ("id" in result) receive(result); else if (path.endsWith("/leave")) receive(null); dispatchEvent(new Event("musike:jam-updated")); }
  return result;
}
export async function playJamHere() {
  await claimPlayback();
  const view = useJam.getState().view; if (!view) return;
  // The output grant is not immediate: the active device must pause and acknowledge
  // the transfer first. Waiting here lets the grant land before this device binds
  // the jam — reading the view synchronously right after claim always saw the
  // transfer still pending and skipped the binding, freezing the jam.
  let devices = usePlaybackDevices.getState().view;
  for (let i = 0; i < 40 && devices && devices.active !== devices.deviceId; i++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    devices = usePlaybackDevices.getState().view;
  }
  if (!devices || devices.active !== devices.deviceId) { toast(getT().features.transferPending, "error"); return; }
  await accountRequest(`/api/jams/${view.id}/output`, {});
}
/** Polls are bounded to one in flight. Foreground reconciliation does not depend on a background timer surviving. */
export function startJams() {
  let stopped = false; let inFlight = false; let timer: ReturnType<typeof setTimeout> | undefined;
  async function poll() {
    if (stopped || inFlight) return; inFlight = true; timer = undefined; const start = Date.now(); const stamp = generation;
    try { const view = await accountRequest<JamView | null>("/api/jams"); if (!stopped && generation === stamp) receive(view, Math.min(1000, (Date.now() - start) / 2)); }
    catch (e) { if (!stopped) useJam.setState({ error: (e as Error).message || getT().features.syncFailure }); }
    finally {
      inFlight = false;
      if (!stopped) { const device = usePlaybackDevices.getState().view; const active = device && device.active === device.deviceId;
        timer = setTimeout(() => void poll(), document.visibilityState === "hidden" || !useJam.getState().view ? 10000 : active ? 1000 : 5000); }
    }
  }
  const resume = () => { if (timer) { clearTimeout(timer); timer = undefined; void poll(); } };
  addEventListener("musike:jam-updated", resume);
  document.addEventListener("visibilitychange", resume); addEventListener("online", resume); void poll();
  return () => { stopped = true; generation++; clearTimeout(timer); setJamControl(null); useJam.setState({ view: null, error: "" }); document.removeEventListener("visibilitychange", resume); removeEventListener("online", resume); removeEventListener("musike:jam-updated", resume); };
}
