import { PlaybackPreload } from "../lib/playbackPreload";
import { create } from "zustand";
import { getT, useT } from "../i18n";
import { api, capabilities, explainStreamError, saveFile, streamSource, systemMedia, type ApiError, type ErrorCode } from "../lib/api";
import { beginPlaybackTrace, recordPlayback, playbackEvents, flushPlaybackEvents, type FailureKind } from "../lib/playbackDiagnostics";
import { recoverableFailure, requestRadio } from "../lib/playbackRecovery";
import { createAudio, createUpcomingAudio } from "../lib/audio";
import { shuffled } from "../lib/format";
import type { Track } from "../lib/types";
import { playerWriter, type SavedPlayer as Saved } from "../lib/playerPersistence";
import { upcomingTracks } from "../lib/playbackQueue";
import { SessionCache } from "../lib/sessionCache";
import { playbackCanOutput } from "../lib/playbackSync";
import type { SharedPlayback } from "../lib/playbackSync";
import { useLibrary } from "../stores/library";
import { openSettings } from "../stores/system";
import { toast } from "../stores/ui";

export type Repeat = "off" | "all" | "one";
/** A code translated where it is shown (so switching languages updates it), or a server error already in the right language. */
export type StatusNote = "findingClip" | "preparingHd" | "loadingVideo" | "fetchingRadio" | { error: string };
export type Status = "idle" | "loading" | "playing" | "paused" | "error";
type Kind = "audio" | "video";
type Quality = "sd" | "hd";

export interface PlayerState {
  queue: Track[];
  /** Queue order before shuffle was turned on, restored when it is turned off. */
  original: Track[] | null;
  index: number;
  status: Status;
  /** What playback is busy with (or why it failed), shown instead of the artist. See `useStatusText`. */
  statusText: StatusNote | null;
  /** Which media element is driving playback right now. */
  mediaKind: Kind;
  /** Set when Video mode is on but the current song has no music video on YouTube. */
  videoNote: "noClip" | null;
  /** Intrinsic width/height of the current video, so vertical videos get a vertical stage. */
  videoAspect: number;
  position: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: Repeat;
  preferVideo: boolean;
  quality: Quality;
  autoRadio: boolean;

  playList: (tracks: Track[], start?: number) => void;
  playTrack: (track: Track) => void;
  playNext: (track: Track) => void;
  addToQueue: (track: Track) => void;
  removeAt: (i: number) => void;
  jumpTo: (i: number) => void;
  clearUpcoming: () => void;
  startRadio: (track: Track) => Promise<void>;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setPreferVideo: (on: boolean) => void;
  setQuality: (q: Quality) => void;
  setAutoRadio: (on: boolean) => void;
  warmUpcoming: () => void;
  stopSession: () => void;
  suspendOutput: () => void;
  resumeOutput: (snapshot: SharedPlayback) => void;
}

// Media elements live outside React so playback survives any re-render or route change.
// On iOS this is the native player behind the same API (see lib/audio.ts).
let audio = createAudio();
let spareAudio = createUpcomingAudio();
let preloaded: { id: string; trace: string } | null = null;
let resumeWanted = false;
let lastFailure: FailureKind | undefined;
let recoveryCount = 0;
let unlockRecoveryUsed = false;
const completePreload = new PlaybackPreload();
let activeBlob: string | null = null;
let recoveryId = "";

export const videoEl = document.createElement("video");
videoEl.playsInline = true;
videoEl.preload = "auto";
videoEl.setAttribute("playsinline", "");
videoEl.className = "block h-full w-full object-contain bg-black";

const mediaFor = (k: Kind): HTMLMediaElement => (k === "video" ? videoEl : audio);

let loaded: { id: string; kind: Kind; quality: Quality } | null = null;
let pendingSeek = 0;
let token = 0;
let recordedToken = -1;
let sessionLost = false;
let lookahead = 3;
let qualityChanged = false;
let loadingAt = Date.now();
let onLoadingDeadline = () => {};
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const cancelRetry = () => { if (retryTimer) clearTimeout(retryTimer); retryTimer = null; };
function mediaFields(media: HTMLMediaElement) {
  let buffered = 0;
  for (let n = 0; n < media.buffered.length; n++) {
    const start = typeof media.buffered.start === "function" ? media.buffered.start(n) : 0;
    if (start <= media.currentTime + .1 && media.buffered.end(n) >= media.currentTime) buffered = media.buffered.end(n) - media.currentTime;
  }
  return { position: media.currentTime, buffered, readyState: media.readyState, networkState: media.networkState, mediaCode: media.error?.code };
}

const STORAGE_KEY = `musike:player${sessionStorage.getItem("musike:user") ? `:${sessionStorage.getItem("musike:user")}` : ""}`;

function readSaved(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Saved>;
  } catch {
    return {};
  }
}

const saved = readSaved();

/**
 * Songs from YouTube Music are "art tracks": audio with a still cover. In Video mode we play the
 * song's music video instead. Song id → video id, or null when YouTube has no clip for it.
 */
const clipFor = new SessionCache<string, string | null>(200, 6 * 3600_000);
const clipLookups = new Map<string, Promise<string | null>>();

function lookupClip(track: Track): Promise<string | null> {
  if (track.kind === "video") return Promise.resolve(track.id);
  if (clipFor.has(track.id)) return Promise.resolve(clipFor.get(track.id)!);
  let lookup = clipLookups.get(track.id);
  if (!lookup) {
    lookup = api
      .videoFor(track)
      .then(
        (v) => {
          const id = v?.id ?? null;
          clipFor.set(track.id, id);
          return id;
        },
        () => null, // network hiccup: don't remember it, try again next time
      )
      .finally(() => clipLookups.delete(track.id));
    clipLookups.set(track.id, lookup);
  }
  return lookup;
}

const needsClipLookup = (track: Track, preferVideo: boolean) =>
  preferVideo && track.kind === "song" && !clipFor.has(track.id);

export const usePlayer = create<PlayerState>((set, get) => {
  const kindFor = (track: Track): Kind =>
    capabilities.video && get().preferVideo && (track.kind === "video" || !!clipFor.get(track.id)) ? "video" : "audio";
  /** The YouTube id to stream: the song itself, or its music video in Video mode. */
  const mediaIdFor = (track: Track, kind: Kind) =>
    kind === "video" && track.kind !== "video" ? clipFor.get(track.id)! : track.id;
  const noteFor = (track: Track) =>
    get().preferVideo && track.kind === "song" && clipFor.get(track.id) === null ? ("noClip" as const) : null;
  const activeMedia = (): HTMLMediaElement | null => (loaded ? mediaFor(loaded.kind) : null);

  function play(media: HTMLMediaElement, fallback?: () => void) {
    const mine = token;
    media.play().catch((err: DOMException) => {
      if (mine !== token || err.name === "AbortError") return; // src changed mid-start
      if (err.name === "NotAllowedError") { if (fallback) fallback(); else set({ status: "paused" }); } // autoplay blocked
    });
  }

  function load(index: number, opts: { autoplay?: boolean; startAt?: number; disablePreload?: boolean } = {}) {
    if (sessionLost || !playbackCanOutput()) return;
    cancelRetry();
    manualRadio?.abort();
    const s = get();
    const track = s.queue[index];
    if (!track) return;
    if (recoveryId !== track.id) { recoveryId = track.id; recoveryCount = 0; unlockRecoveryUsed = false; }
    resumeWanted = opts.autoplay !== false;
    const reusable = !opts.disablePreload && !s.preferVideo && preloaded?.id === track.id && spareAudio && spareAudio.readyState >= 2 && !spareAudio.error &&
      mediaFields(spareAudio).buffered >= Math.min(8, Math.max(1, track.duration || 8));
    const complete = !opts.disablePreload && !s.preferVideo ? completePreload.take(track.id) : null;
    completePreload.retain();
    if (preloaded?.id === track.id && !reusable && !complete) recordPlayback("player.preload_skipped", { videoId: track.id, reason: "insufficient_buffer", ...(spareAudio ? mediaFields(spareAudio) : {}) });
    const trace = complete?.trace ?? (reusable ? preloaded!.trace : undefined);
    beginPlaybackTrace(trace); recordPlayback("player.load", { videoId: track.id });

    // Video mode on a song: find its music video first, then load whichever fits.
    if (needsClipLookup(track, s.preferVideo)) {
      const mine = ++token;
      set({
        index,
        status: "loading",
        statusText: "findingClip",
        videoNote: null,
        position: opts.startAt ?? 0,
        duration: track.duration,
        buffered: 0,
      });
      activeMedia()?.pause();
      setMetadata(track);
      void lookupClip(track).then(() => mine === token && load(index, opts));
      return;
    }

    const kind = kindFor(track);
    if (kind === "audio" && !complete && reusable && spareAudio) {
      audio.pause(); const previous = audio; audio = spareAudio; spareAudio = previous; preloaded = null;
      spareAudio.removeAttribute("src"); spareAudio.load(); recordPlayback("player.preloaded_handoff", { videoId: track.id, ...mediaFields(audio) });
    }
    const media = mediaFor(kind);
    const other = mediaFor(kind === "video" ? "audio" : "video");
    other.pause();
    if (other.getAttribute("src")) {
      other.removeAttribute("src");
      other.load();
    }

    token++; loadingAt = Date.now();
    loaded = { id: track.id, kind, quality: s.quality };
    pendingSeek = opts.startAt ?? 0;
    const autoplay = opts.autoplay !== false;
    set({
      index,
      mediaKind: kind,
      status: autoplay ? "loading" : "paused",
      // Video may need a server-side download first (HD, or videos without a combined SD stream).
      statusText: kind === "video" ? (s.quality === "hd" ? "preparingHd" : "loadingVideo") : null,
      videoNote: noteFor(track),
      position: pendingSeek,
      duration: track.duration,
      buffered: 0,
    });
    media.volume = s.volume;
    media.muted = s.muted;
    const start = (src: string) => {
      media.src = src;
      if (autoplay) play(media);
    };
    // The server's proxy URL is known right away; on Android the stream is first resolved on the phone.
    const sourceToken = token;
    const fallback = () => {
      if (sourceToken !== token || !spareAudio) return;
      const previous = audio; audio = spareAudio; spareAudio = previous; preloaded = null;
      load(index, { ...opts, disablePreload: true });
    };
    if (!complete && reusable && kind === "audio") {
      if (pendingSeek > 0) { media.currentTime = pendingSeek; pendingSeek = 0; }
      if (Number.isFinite(media.duration)) set({ duration: media.duration });
      if (autoplay) play(media, fallback);
      setMetadata(track); return;
    }
    if (activeBlob) { URL.revokeObjectURL(activeBlob); activeBlob = null; }
    if (complete && kind === "audio") {
      activeBlob = complete.url; start(complete.url);
      recordPlayback("player.complete_handoff", { videoId: track.id, traceId: complete.trace });
      setMetadata(track); return;
    }
    const source = streamSource(mediaIdFor(track, kind), kind, s.quality);
    if (typeof source === "string") start(source);
    else {
      const mine = token;
      source.then(
        (src) => mine === token && start(src),
        (err: ApiError) => mine === token && report(err.message, err.code),
      );
    }
    setMetadata(track);
  }

  let radioJob: { queue: Track[]; controller: AbortController; promise: Promise<void> } | null = null;
  let radioAttempt: { queue: Track[]; at: number; failed: boolean } | null = null;
  let radioFailure: Error | null = null;
  let warmTimer: ReturnType<typeof setTimeout> | null = null;
  let warmRetries = 0;
  let manualRadio: AbortController | null = null;
  let warming = "";

  function primeRadio(force = false): Promise<void> {
    const s = get();
    if (radioJob && radioJob.queue !== s.queue) { radioJob.controller.abort(); radioJob = null; }
    if (!s.autoRadio || s.repeat !== "off" || sessionLost) { radioJob?.controller.abort(); return Promise.resolve(); }
    if (radioJob) return radioJob.promise;
    if (!force && (lookahead === 0 || s.queue.length - s.index - 1 >= lookahead)) return Promise.resolve();
    if (radioAttempt?.queue === s.queue && Date.now() - radioAttempt.at < (radioAttempt.failed && force ? 2000 : 30_000)) return Promise.resolve();
    const tail = s.queue.at(-1); if (!tail) return Promise.resolve();
    const queue = s.queue; const controller = new AbortController();
    radioAttempt = { queue, at: Date.now(), failed: false }; radioFailure = null;
    recordPlayback("radio.request", { videoId: tail.id });
    const promise = requestRadio((signal) => api.radio(tail.id, signal), controller.signal).then((tracks) => {
      if (controller.signal.aborted || sessionLost || get().queue !== queue || !get().autoRadio || get().repeat !== "off") return;
      const known = new Set(queue.map((track) => track.id));
      const more = tracks.filter((track) => { if (known.has(track.id)) return false; known.add(track.id); return true; }).slice(0, 25);
      recordPlayback("radio.ready", { videoId: tail.id });
      if (more.length) set((state) => ({ queue: [...queue, ...more], original: state.original ? [...state.original, ...more] : null }));
    }).catch((error) => {
      if (!controller.signal.aborted && get().queue === queue) {
        radioFailure = Object.assign(new Error((error as ApiError).failure === "timeout" ? getT().features.networkTimeout : (error as Error).message), { failure: (error as ApiError).failure, code: (error as ApiError).code }); if (radioAttempt?.queue === queue) { radioAttempt.failed = true; radioAttempt.at = Date.now(); }
        recordPlayback("radio.error", { videoId: tail.id, reason: (error as ApiError).failure ?? "provider" });
      }
    }).finally(() => { if (radioJob?.controller === controller) radioJob = null; });
    radioJob = { queue, controller, promise }; return promise;
  }

  async function continueWithRadio() {
    const index = get().index; const mine = token; recordPlayback("player.advance_radio");
    set({ status: "loading", statusText: "fetchingRadio" });
    await primeRadio(true);
    if (mine !== token || sessionLost) return;
    if (get().queue[index + 1]) { load(index + 1); return; }
    if (radioFailure) { const error = radioFailure as ApiError; report(error.message || getT().features.radioRetry, error.code, error.failure); }
    else set({ status: "paused", statusText: null, position: 0 });
  }

  function warmQueue() {
    if (!playbackCanOutput()) return;
    const s = get();
    if (radioJob && (radioJob.queue !== s.queue || !s.autoRadio || s.repeat !== "off")) { radioJob.controller.abort(); radioJob = null; }
    const current = s.queue[s.index];
    const upcoming = upcomingTracks(s.queue, s.index, 10, s.repeat);
    completePreload.retain(!s.preferVideo && lookahead > 0 ? upcoming[0]?.id : undefined);
    if (preloaded && (preloaded.id !== upcoming[0]?.id || s.preferVideo || lookahead === 0)) {
      spareAudio?.removeAttribute("src"); spareAudio?.load(); preloaded = null;
    }
    if (sessionLost || !current || (s.status !== "playing" && s.status !== "loading")) return;
    const queue = s.queue; const index = s.index;
    const signature = `${current.id}:${upcoming.map((track) => track.id).join(",")}:${s.preferVideo}`;
    if (api.prefetch && warming === signature) return;
    if (api.prefetch) { warming = signature; void api.prefetch(current.id, upcoming.map((track) => track.id)).then((result) => {
      if (sessionLost || get().queue !== queue || get().index !== index) return;
      if (result) lookahead = result.lookahead;
      const next = upcoming[0];
      if (lookahead > 0 && next && !s.preferVideo && spareAudio && result?.readyIds?.includes(next.id)) {
        if (preloaded?.id !== next.id) {
          const trace = crypto.randomUUID(); preloaded = { id: next.id, trace };
          const source = streamSource(next.id, "audio", s.quality, trace);
          if (typeof source === "string") { void completePreload.prepare(next.id, source, trace); spareAudio.src = source; spareAudio.load(); recordPlayback("player.preload", { videoId: next.id, traceId: trace }); }
        }
        const readySource = streamSource(next.id, "audio", s.quality, preloaded?.trace);
        if (typeof readySource === "string") void completePreload.prepare(next.id, readySource, preloaded?.trace ?? crypto.randomUUID());
        warmRetries = 0;
      } else if (lookahead > 0 && next && spareAudio && !s.preferVideo && warmRetries++ < 10 && !warmTimer) {
        warmTimer = setTimeout(() => { warmTimer = null; warmQueue(); }, 1500);
      }
      void primeRadio();
    }).catch((error) => recordPlayback("prepare.error", { reason: (error as ApiError).failure ?? "request" }))
      .finally(() => { if (warming === signature) warming = ""; }); }
    else for (const track of upcoming.slice(0, 3)) void api.prepare(track.id).catch(() => {});
    void primeRadio();
    if (s.preferVideo && upcoming[0]) void lookupClip(upcoming[0]).then((id) => api.prepare(id ?? upcoming[0]!.id).catch(() => {}));
  }

  function onStarted() {
    const s = get();
    const track = s.queue[s.index];
    if (!track || recordedToken === token) return;
    recordedToken = token; lastFailure = undefined;
    recordPlayback("player.playing", { videoId: track.id });
    useLibrary.getState().recordPlay(track);
    warmQueue();
  }

  function onEnded() {
    if (!playbackCanOutput()) return;
    recordPlayback("player.ended");
    const s = get();
    if (s.repeat === "one") {
      const media = activeMedia();
      if (media) {
        media.currentTime = 0;
        play(media);
      }
      return;
    }
    if (s.index < s.queue.length - 1) return load(s.index + 1);
    if (s.repeat === "all" && s.queue.length) return load(0);
    if (s.autoRadio) return void continueWithRadio();
    set({ status: "paused", position: 0 });
  }

  /** Shows why a track can't play, then moves on (unless every track would fail the same way). */
  function report(message: string, code?: ErrorCode, failure?: FailureKind) {
    const mine = token; lastFailure = failure; recordPlayback("player.error", { reason: failure ?? code ?? "media" });
    set({ status: "error", statusText: { error: message } });
    const track = get().queue[get().index];
    // Tool problems hit every track: offer the fix instead of skipping through the whole queue.
    const toolProblem = code === "tool_missing" || code === "maybe_outdated";
    const t = getT();
    toast(
      t.player.cantPlay(track?.title ?? t.player.aTrack, message),
      "error",
      toolProblem ? { label: code === "tool_missing" ? t.common.install : t.common.update, run: openSettings } : failure === "authentication" || failure === "edge_challenge" ?
        { label: t.features.signInAgain, run: () => location.reload() } :
        { label: t.features.downloadDiagnostics, run: () => void saveFile("musike-playback-diagnostics.json", JSON.stringify(playbackEvents(), null, 2)) },
    );
    if (!failure && code !== "tool_missing" && get().index < get().queue.length - 1) {
      setTimeout(() => mine === token && get().next(), 2500);
    }
  }

  // A stream URL that expired mid-song gets one fresh try from the same spot before giving up.
  let retriedToken = -1;
  let probingToken = -1;

  function onError(media: HTMLMediaElement, stalled = false) {
    const mine = token;
    if (probingToken === mine) return;
    const url = media.currentSrc || media.src;
    recordPlayback(stalled ? "media.stalled" : "media.error", mediaFields(media));
    if (capabilities.retryOnError && retriedToken !== mine) {
      const at = media.currentTime || get().position;
      load(get().index, { startAt: at, autoplay: true });
      retriedToken = token;
      return;
    }
    probingToken = mine;
    set({ status: "error" });
    explainStreamError(url, media.error?.code).then(({ message, code, failure }) => {
      if (mine !== token || sessionLost) return;
      // A successful probe describes the origin, not the stalled element. It must not turn a
      // confirmed no-progress deadline into an unsupported-codec failure.
      const kind = stalled && !failure && !code ? "timeout" : failure;
      if (resumeWanted && recoverableFailure(kind) && !code && recoveryCount < 2) {
        const at = media.currentTime || get().position; const index = get().index;
        recoveryCount++; lastFailure = kind;
        recordPlayback("player.retry", { reason: kind, position: at });
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (mine === token && !sessionLost && resumeWanted) load(index, { startAt: at, disablePreload: true });
        }, 500 * recoveryCount);
      } else report(stalled && !failure && !code ? getT().features.networkTimeout : message, code, kind);
    }).catch(() => { if (mine === token) report(getT().features.networkFailure, undefined, "network"); });
  }

  onLoadingDeadline = () => { loadingAt = Date.now(); const media = activeMedia(); if (media && resumeWanted) onError(media, true); };

  function wire(media: HTMLMediaElement) {
    const isActive = () => activeMedia() === media;
    media.addEventListener("loadedmetadata", () => {
      if (!isActive()) return;
      if (pendingSeek > 0) {
        media.currentTime = pendingSeek;
        pendingSeek = 0;
      }
      if (Number.isFinite(media.duration)) set({ duration: media.duration });
      if (media === videoEl && videoEl.videoWidth && videoEl.videoHeight) {
        set({ videoAspect: videoEl.videoWidth / videoEl.videoHeight });
      }
      syncPositionState();
    });
    media.addEventListener("durationchange", () => {
      if (isActive() && Number.isFinite(media.duration)) set({ duration: media.duration });
    });
    media.addEventListener("playing", () => {
      if (!isActive()) return;
      loadingAt = Date.now(); set({ status: "playing", statusText: null });
      onStarted();
      syncPlaybackState();
    });
    media.addEventListener("pause", () => {
      if (!isActive() || media.ended || get().status === "loading" || get().status === "error") return;
      set({ status: "paused" });
      syncPlaybackState();
    });
    media.addEventListener("waiting", () => {
      if (isActive() && !media.paused) { if (get().status !== "loading") loadingAt = Date.now(); set({ status: "loading" }); recordPlayback("player.waiting", mediaFields(media)); }
    });
    media.addEventListener("timeupdate", () => {
      if (!isActive() || pendingSeek > 0) return;
      if (Math.abs(media.currentTime - get().position) >= 0.2) { loadingAt = Date.now(); set({ position: media.currentTime }); }
      syncSystemMedia(); // throttled on the other side
    });
    media.addEventListener("progress", () => {
      if (!isActive() || !media.buffered.length) return;
      set({ buffered: media.buffered.end(media.buffered.length - 1) });
    });
    media.addEventListener("seeked", () => isActive() && syncPositionState());
    media.addEventListener("ended", () => isActive() && onEnded());
    media.addEventListener("error", () => isActive() && media.getAttribute("src") && onError(media));
  }
  wire(audio);
  if (spareAudio) wire(spareAudio);
  wire(videoEl);

  const reloadIfKindChanged = () => {
    const s = get();
    const track = s.queue[s.index];
    if (!track) return;
    set({ videoNote: noteFor(track) });
    if (!loaded || loaded.id !== track.id) return;
    const wasPlaying = s.status === "playing" || s.status === "loading";
    if (needsClipLookup(track, s.preferVideo)) return load(s.index, { startAt: s.position, autoplay: wasPlaying });
    const kind = kindFor(track);
    if (loaded.kind === kind && (kind === "audio" || loaded.quality === s.quality)) return;
    load(s.index, { startAt: s.position, autoplay: wasPlaying });
  };

  return {
    queue: saved.queue ?? [],
    original: saved.original ?? null,
    index: saved.index ?? 0,
    status: saved.queue?.length ? "paused" : "idle",
    statusText: null,
    mediaKind: "audio",
    videoNote: null,
    videoAspect: 16 / 9,
    position: saved.position ?? 0,
    duration: saved.queue?.[saved.index ?? 0]?.duration ?? 0,
    buffered: 0,
    volume: saved.volume ?? 0.9,
    muted: saved.muted ?? false,
    shuffle: saved.shuffle ?? false,
    repeat: saved.repeat ?? "off",
    // Builds without video (Android) always play audio, whatever a backup or an old session says.
    preferVideo: capabilities.video && (saved.preferVideo ?? false),
    quality: saved.quality ?? "sd",
    autoRadio: saved.autoRadio ?? true,

    playList: (tracks, start = 0) => {
      if (!tracks.length) return;
      const first = tracks[start] ?? tracks[0];
      if (get().shuffle) {
        const rest = tracks.filter((_, i) => i !== start);
        set({ queue: [first, ...shuffled(rest)], original: tracks.slice() });
        load(0);
      } else {
        set({ queue: tracks.slice(), original: null });
        load(start);
      }
    },

    playTrack: (track) => {
      const s = get();
      const at = s.queue.findIndex((t) => t.id === track.id);
      if (at >= 0) return load(at);
      if (!s.queue.length) return get().playList([track]);
      const insert = s.index + 1;
      set({
        queue: [...s.queue.slice(0, insert), track, ...s.queue.slice(insert)],
        original: s.original ? [...s.original, track] : null,
      });
      load(insert);
    },

    playNext: (track) => {
      const s = get();
      if (!s.queue.length) return get().playList([track]);
      const insert = s.index + 1;
      set({
        queue: [...s.queue.slice(0, insert), track, ...s.queue.slice(insert)],
        original: s.original ? [...s.original, track] : null,
      });
      toast(getT().player.playsNext(track.title));
    },

    addToQueue: (track) => {
      const s = get();
      if (!s.queue.length) return get().playList([track]);
      set({ queue: [...s.queue, track], original: s.original ? [...s.original, track] : null });
      toast(getT().player.addedToQueue(track.title));
    },

    removeAt: (i) => {
      const s = get();
      if (i < 0 || i >= s.queue.length) return;
      const removed = s.queue[i];
      const queue = s.queue.filter((_, j) => j !== i);
      const original = s.original?.filter((t) => t !== removed) ?? null;
      if (i < s.index) return set({ queue, original, index: s.index - 1 });
      if (i > s.index) return set({ queue, original });
      // Removing the current track: move on to whatever takes its place.
      set({ queue, original });
      if (queue[i]) load(i, { autoplay: s.status === "playing" });
      else {
        activeMedia()?.pause();
        loaded = null;
        set({ index: Math.max(0, queue.length - 1), status: queue.length ? "paused" : "idle", position: 0 });
      }
    },

    jumpTo: (i) => load(i),

    clearUpcoming: () => {
      const s = get();
      const keep = s.queue.slice(0, s.index + 1);
      set({ queue: keep, original: s.original ? keep.slice() : null });
    },

    startRadio: async (track) => {
      manualRadio?.abort(); const controller = new AbortController(); manualRadio = controller; const mine = token;
      toast(getT().player.startingRadio(track.title));
      try {
        const related = await api.radio(track.id, controller.signal);
        if (controller.signal.aborted || mine !== token || sessionLost) return;
        get().playList([track, ...related.filter((t) => t.id !== track.id)], 0);
      } catch (e) {
        if (!controller.signal.aborted) toast((e as Error).message, "error");
      }
    },

    toggle: () => {
      const s = get();
      if (retryTimer || s.status === "loading" && resumeWanted) {
        completePreload.clear(); if (activeBlob) { URL.revokeObjectURL(activeBlob); activeBlob = null; }
      cancelRetry(); resumeWanted = false; token++; activeMedia()?.pause(); set({ status: "paused", statusText: null }); return;
      }
      const track = s.queue[s.index];
      if (!track) return;
      const kind = kindFor(track);
      const stale =
        !loaded ||
        loaded.id !== track.id ||
        loaded.kind !== kind ||
        (kind === "video" && loaded.quality !== s.quality) ||
        needsClipLookup(track, s.preferVideo);
      if (stale || s.status === "error") return load(s.index, { startAt: s.position });
      const media = mediaFor(kind);
      if (media.paused) { resumeWanted = true; play(media); }
      else { resumeWanted = false; media.pause(); }
    },

    next: () => {
      const s = get();
      if (s.index < s.queue.length - 1) return load(s.index + 1);
      if (s.repeat === "all" && s.queue.length) return load(0);
      if (s.autoRadio) void continueWithRadio();
    },

    prev: () => {
      const s = get();
      if (s.position > 3 || s.index === 0) return get().seek(0);
      load(s.index - 1);
    },

    seek: (seconds) => {
      const t = Math.max(0, Math.min(seconds, get().duration || seconds));
      set({ position: t });
      const media = activeMedia();
      const track = get().queue[get().index];
      if (!media || !track || loaded?.id !== track.id || media.readyState === 0) {
        pendingSeek = t;
        return;
      }
      media.currentTime = t;
    },

    setVolume: (v) => {
      const volume = Math.max(0, Math.min(1, v));
      audio.volume = videoEl.volume = volume;
      const muted = volume === 0 ? true : false;
      audio.muted = videoEl.muted = muted;
      set({ volume, muted });
    },

    toggleMute: () => {
      const muted = !get().muted;
      audio.muted = videoEl.muted = muted;
      if (!muted && get().volume === 0) get().setVolume(0.6);
      else set({ muted });
    },

    toggleShuffle: () => {
      const s = get();
      const current = s.queue[s.index];
      if (!s.shuffle) {
        const rest = s.queue.filter((_, i) => i !== s.index);
        set({ shuffle: true, original: s.queue, queue: current ? [current, ...shuffled(rest)] : shuffled(rest), index: 0 });
        return;
      }
      const present = new Set(s.queue);
      const base = (s.original ?? s.queue).filter((t) => present.has(t));
      const extra = s.queue.filter((t) => !base.includes(t));
      const queue = [...base, ...extra];
      set({ shuffle: false, original: null, queue, index: Math.max(0, current ? queue.indexOf(current) : 0) });
    },

    cycleRepeat: () => {
      const order: Repeat[] = ["off", "all", "one"];
      set({ repeat: order[(order.indexOf(get().repeat) + 1) % order.length] });
    },

    setPreferVideo: (on) => {
      if (on && !capabilities.video) return;
      set({ preferVideo: on });
      reloadIfKindChanged();
    },

    setQuality: (quality) => {
      qualityChanged = true;
      set({ quality });
      reloadIfKindChanged();
    },

    setAutoRadio: (autoRadio) => set({ autoRadio }),
    suspendOutput: () => {
      completePreload.clear(); if (activeBlob) { URL.revokeObjectURL(activeBlob); activeBlob = null; }
      cancelRetry(); resumeWanted = false; token++; loaded = null; pendingSeek = 0; preloaded = null;
      radioJob?.controller.abort(); manualRadio?.abort();
      if (warmTimer) { clearTimeout(warmTimer); warmTimer = null; }
      for (const media of [audio, videoEl, ...(spareAudio ? [spareAudio] : [])]) { media.pause(); media.removeAttribute("src"); media.load(); }
      set({ status: get().queue.length ? "paused" : "idle", statusText: null, buffered: 0 });
      syncPlaybackState();
    },
    resumeOutput: (snapshot) => {
      set({ ...snapshot, status: "paused", statusText: null, buffered: 0 });
      if (snapshot.queue.length) load(snapshot.index, { startAt: snapshot.position, disablePreload: true, autoplay: snapshot.status === "playing" || snapshot.status === "loading" });
    },
    warmUpcoming: () => { warmRetries = 0; if (warmTimer) { clearTimeout(warmTimer); warmTimer = null; } warmQueue(); },
    stopSession: () => {
      cancelRetry();
      completePreload.clear(); if (activeBlob) { URL.revokeObjectURL(activeBlob); activeBlob = null; }
      radioJob?.controller.abort(); manualRadio?.abort(); if (warmTimer) clearTimeout(warmTimer); token++; loaded = null; resumeWanted = false; preloaded = null;
      for (const media of [audio, videoEl, ...(spareAudio ? [spareAudio] : [])]) { media.pause(); media.removeAttribute("src"); media.load(); }
      set({ queue: [], original: null, index: 0, status: "idle", statusText: null, position: 0, duration: 0, buffered: 0 });
      systemMedia?.setState({ playing: false, position: 0, duration: 0 });
      if ("mediaSession" in navigator) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = "none"; }
    },
  };
});

audio.volume = videoEl.volume = usePlayer.getState().volume;
audio.muted = videoEl.muted = usePlayer.getState().muted;

export const selectCurrent = (s: PlayerState): Track | null => s.queue[s.index] ?? null;

/** Whether the track can be shown as video (art tracks are audio with a still image). */

// Persistence: resume the same queue and position after a reload.

const writePlayer = playerWriter({ setItem: (key, value) => localStorage.setItem(key, value) }, STORAGE_KEY);
function persist() {
  if (sessionLost) return;
  try {
    writePlayer(usePlayer.getState());
  } catch {
    /* storage full or blocked */
  }
}
setInterval(persist, 4000);
// Queue edits (including optimistic/manual additions) refresh look-ahead without waiting for another playing event.
usePlayer.subscribe((state, previous) => {
  if (state.queue !== previous.queue || state.index !== previous.index || state.autoRadio !== previous.autoRadio || state.repeat !== previous.repeat)
    queueMicrotask(() => usePlayer.getState().warmUpcoming());
});
setInterval(() => { if (usePlayer.getState().status === "playing") usePlayer.getState().warmUpcoming(); }, 30_000);
if (api.playbackSettings) void api.playbackSettings().then((settings) => {
  lookahead = settings.lookahead;
  if (saved.quality === undefined && !qualityChanged && !sessionLost) usePlayer.setState({ quality: settings.videoQuality });
  usePlayer.getState().warmUpcoming();
}).catch(() => {});
addEventListener("musike:unauthorized", () => {
  if (sessionLost) return;
  persist(); sessionLost = true; usePlayer.getState().stopSession();
});
addEventListener("pagehide", persist);
function restorePlayback() {
  recordPlayback("page.resume"); void flushPlaybackEvents();
  const state = usePlayer.getState(); state.warmUpcoming();
  if (resumeWanted && state.status === "error" && recoverableFailure(lastFailure) && !unlockRecoveryUsed && document.visibilityState !== "hidden") {
    unlockRecoveryUsed = true; recoveryCount = 0; recordPlayback("player.unlock_recovery"); usePlayer.getState().toggle();
  }
}
document.addEventListener("visibilitychange", () => {
  recordPlayback(document.visibilityState === "hidden" ? "page.hidden" : "page.visible");
  if (document.visibilityState === "hidden") { persist(); usePlayer.getState().warmUpcoming(); void flushPlaybackEvents(); }
  else restorePlayback();
});
addEventListener("online", restorePlayback);
addEventListener("pageshow", restorePlayback);
setInterval(() => {
  const state = usePlayer.getState();
  if (state.status === "loading" && state.statusText !== "fetchingRadio" && state.statusText !== "findingClip" && loaded && Date.now() - loadingAt > 8000) onLoadingDeadline();
  void flushPlaybackEvents();
}, 5000);

// Media Session: lock-screen, headset and notification controls.

function setMetadata(track: Track) {
  systemMedia?.setTrack({ title: track.title, artist: track.artist, album: track.album ?? "", artwork: track.art || track.thumb });
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album ?? "",
    artwork:
      track.kind === "video"
        ? [
            { src: track.art, sizes: "1280x720", type: "image/jpeg" },
            { src: track.thumb, sizes: "320x180", type: "image/jpeg" },
          ]
        : [{ src: track.art, sizes: "544x544", type: "image/jpeg" }],
  });
}

/** The phone's notification and lock screen. A track that is loading is about to play, so it counts as playing:
 *  reporting a pause between tracks would let Android stop the app in the background. */
function syncSystemMedia() {
  if (!systemMedia) return;
  const { status, position, duration } = usePlayer.getState();
  systemMedia.setState({ playing: status === "playing" || status === "loading", position, duration });
}

function syncPlaybackState() {
  syncSystemMedia();
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.playbackState = usePlayer.getState().status === "playing" ? "playing" : "paused";
  syncPositionState();
}

function syncPositionState() {
  syncSystemMedia();
  const { duration, position } = usePlayer.getState();
  if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
  if (!Number.isFinite(duration) || duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({ duration, position: Math.min(position, duration), playbackRate: 1 });
  } catch {
    /* some browsers reject transient states */
  }
}

if (systemMedia) {
  const p = () => usePlayer.getState();
  systemMedia.onAction((action, position) => {
    if (action === "play" && p().status !== "playing") p().toggle();
    else if (action === "pause" && p().status === "playing") p().toggle();
    else if (action === "next") p().next();
    else if (action === "previous") p().prev();
    else if (action === "seek" && position != null) p().seek(position);
  });
}

if ("mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  const p = () => usePlayer.getState();
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ["play", () => p().status !== "playing" && p().toggle()],
    ["pause", () => p().status === "playing" && p().toggle()],
    ["previoustrack", () => p().prev()],
    ["nexttrack", () => p().next()],
    ["seekto", (d) => d.seekTime != null && p().seek(d.seekTime)],
    ["seekbackward", (d) => p().seek(p().position - (d.seekOffset ?? 10))],
    ["seekforward", (d) => p().seek(p().position + (d.seekOffset ?? 10))],
  ];
  for (const [action, handler] of handlers) {
    try {
      ms.setActionHandler(action, handler);
    } catch {
      /* action not supported */
    }
  }
  const restored = selectCurrent(usePlayer.getState());
  if (restored) setMetadata(restored);
}

/** The player's status line in the current language, or null when there is nothing to say. */
export function useStatusText(): string | null {
  const note = usePlayer((s) => s.statusText);
  const t = useT();
  if (note === null) return null;
  return typeof note === "string" ? t.player.status[note] : note.error;
}
