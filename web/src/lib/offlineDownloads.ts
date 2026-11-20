import { getT } from "../i18n";
import { useOffline } from "../stores/offline";
import { useSession } from "../stores/session";
import type { Playlist, Track } from "./types";
import { BUDGETS, MAX_AUDIO, MIB, offlineSettings, offlineSummary, purgeOfflineOwner, readOfflineAudio, removeOfflinePin, saveOfflineAudio, touchOfflineAudio, trimOfflineAudio, writeOfflinePin } from "./offlineStore";

const OWNER = "musike:offline-owner";
export const offlineOwner = () => { try { return sessionStorage.getItem("musike:user") || null; } catch { return null; } };
let generation = 0;
let controller: AbortController | null = null;
let recent: Track | null = null;
let pendingPin: Playlist | null = null;
let running = false;
const notify = (message = "changed") => { if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("musike-offline"); channel.postMessage(message); channel.close(); } };
export async function refreshOffline() {
  const owner = offlineOwner(); if (!owner) return;
  try {
    const summary = await offlineSummary(owner); if (owner !== offlineOwner()) return;
    const estimate = await navigator.storage?.estimate().catch(() => null);
    const persistent = await navigator.storage?.persisted?.().catch(() => false);
    useOffline.setState({ summary, siteUsage: estimate?.usage ?? null, persistent: persistent ?? false });
  } catch { useOffline.setState({ error: getT().offline.storageUnavailable }); }
}
export function forgetOfflineAccount() { cancelOfflineDownloads(); localStorage.removeItem(OWNER); }
export async function rememberOfflineAccount(id: string, name: string) {
  try { await offlineSettings(id, { name }); localStorage.setItem(OWNER, id); } catch {}
}
export async function cachedOfflineAccount() {
  try {
    const owner = localStorage.getItem(OWNER); if (!owner) return null;
    const { settings, entries } = await offlineSummary(owner);
    if (!settings.enabled && !entries.length) return null;
    return { id: owner, name: settings.name, phone: "", role: "user" as const, status: "active" };
  } catch { return null; }
}
export async function rememberOutput(eligible: boolean, active?: string | null, deviceId?: string, transfer = false) {
  const owner = offlineOwner(); if (!owner || typeof indexedDB === "undefined") return;
  try {
    const key = `musike:output-device:${owner}`;
    if (eligible && deviceId) localStorage.setItem(key, deviceId);
    if (!eligible && !transfer && active && active === localStorage.getItem(key)) return;
    await offlineSettings(owner, { eligible });
  } catch {}
}
export async function setOfflineBudget(mib: number, enabled: boolean) {
  const owner = offlineOwner(); if (!owner || !BUDGETS.includes(mib as typeof BUDGETS[number])) return;
  cancelOfflineDownloads();
  await offlineSettings(owner, { enabled, budget: mib * MIB });
  if (enabled) await navigator.storage?.persist?.().catch(() => false);
  await trimOfflineAudio(owner); await refreshOffline(); notify();
}
export function cancelOfflineDownloads() { generation++; controller?.abort(); controller = null; recent = null; pendingPin = null; }
/** No range response, opaque response, HTML or video MIME can become a downloaded song. */
export async function fetchCompleteAudio(id: string, signal: AbortSignal, transport: typeof fetch = fetch): Promise<Blob> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error("audio");
  const response = await transport(`/api/stream/${id}/audio`, { credentials: "same-origin", redirect: "manual", signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]) });
  const type = response.headers.get("content-type") ?? "";
  if (response.status === 401) window.dispatchEvent(new Event("musike:unauthorized"));
  if (response.status !== 200 || response.redirected || !type.startsWith("audio/") || !response.body || Number(response.headers.get("content-length")) > MAX_AUDIO) { await response.body?.cancel(); throw new Error("audio"); }
  const reader = response.body.getReader(); const chunks: Uint8Array<ArrayBuffer>[] = []; let bytes = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > MAX_AUDIO) throw new Error("limit"); chunks.push(new Uint8Array(value)); }
  } finally { await reader.cancel().catch(() => {}); }
  if (!bytes || signal.aborted) throw new Error("audio");
  return new Blob(chunks, { type });
}
export async function offlineAudioBlob(id: string) {
  const owner = offlineOwner(); if (!owner || typeof indexedDB === "undefined") return null;
  try { return await readOfflineAudio(owner, id); } catch { return null; }
}
export async function offlineAudioUrl(id: string) {
  const owner = offlineOwner(); if (!owner || typeof indexedDB === "undefined") return null;
  try { const blob = await readOfflineAudio(owner, id); return blob ? URL.createObjectURL(blob) : null; } catch { return null; }
}
export function cacheRecentAudio(track: Track) {
  const owner = offlineOwner(); if (!owner || useSession.getState().offline) return;
  recent = track; void drain();
}
export async function retainPreloadedAudio(track: Track, blob: Blob) {
  const owner = offlineOwner(); if (!owner || typeof indexedDB === "undefined") return;
  try { await saveOfflineAudio(owner, track, blob); } catch {} // Playback must never wait for persistence.
}
export async function touchDownloadedAudio(id: string) {
  const owner = offlineOwner(); if (!owner || typeof indexedDB === "undefined") return;
  try { await touchOfflineAudio(owner, id); } catch {}
}
export async function pinOfflinePlaylist(playlist: Playlist) {
  const owner = offlineOwner(); if (!owner || useSession.getState().offline) return;
  const summary = await offlineSummary(owner);
  if (!summary.settings.enabled) { useOffline.setState({ error: getT().offline.enableFirst }); return; }
  const old = summary.pins.find(p => p.id === playlist.id);
  await writeOfflinePin({ owner, id: playlist.id, playlist: old?.playlist ?? { ...playlist, tracks: [] }, pending: playlist, error: "" });
  pendingPin = playlist; recent = null; await refreshOffline(); void drain();
}
export async function unpinOfflinePlaylist(id: string) {
  const owner = offlineOwner(); if (!owner) return;
  cancelOfflineDownloads(); await removeOfflinePin(owner, id); await trimOfflineAudio(owner); await refreshOffline(); notify();
}
export async function clearOfflineRecents() {
  const owner = offlineOwner(); if (!owner) return;
  cancelOfflineDownloads(); await trimOfflineAudio(owner, true); await refreshOffline(); notify();
}
export async function logoutOfflineData() {
  const owner = offlineOwner(); cancelOfflineDownloads();
  // Remove the offline entry point before cleanup; a failed deletion never permits offline login.
  localStorage.removeItem(OWNER); sessionStorage.removeItem("musike:user");
  if (owner) { localStorage.removeItem(`musike:output-device:${owner}`); localStorage.removeItem(`musike:player:${owner}`); await purgeOfflineOwner(owner); }
  useOffline.setState({ summary: null }); notify(`logout:${owner}`);
}
async function drain() {
  if (running || useSession.getState().offline || navigator.onLine === false) return;
  const owner = offlineOwner(); if (!owner || typeof indexedDB === "undefined") return;
  running = true; const stamp = generation; useOffline.setState({ busy: true, error: "" });
  try {
    const summary = await offlineSummary(owner); if (!summary.settings.enabled) return;
    const playlist = pendingPin; pendingPin = null;
    const track = recent; recent = null;
    const tracks = playlist?.tracks ?? (track ? [track] : []);
    for (const item of tracks) {
      if (stamp !== generation || owner !== offlineOwner()) return;
      controller = new AbortController();
      if (!await readOfflineAudio(owner, item.id)) {
        const blob = await fetchCompleteAudio(item.id, controller.signal);
        if (stamp !== generation || owner !== offlineOwner()) return;
        if (!await saveOfflineAudio(owner, item, blob, playlist ? 0 : Date.now())) return;
      } else if (!playlist) await touchOfflineAudio(owner, item.id);
      await refreshOffline();
    }
    if (playlist && stamp === generation) await writeOfflinePin({ owner, id: playlist.id, playlist, pending: null, error: "" });
  } catch (e) {
    if (stamp === generation) {
      const error = (e as Error).message === "budget" ? getT().offline.budgetFull : getT().offline.incomplete;
      useOffline.setState({ error });
    }
  } finally {
    running = false; controller = null; useOffline.setState({ busy: false }); await refreshOffline(); notify();
    if (recent || pendingPin) void drain();
  }
}
/** An interrupted pin remains checkpointed. Resumption is an explicit user action. */
export const playlistRevision = (p: Playlist) => JSON.stringify([p.name, p.tracks.map(t => [t.id, t.title, t.artist])]);
