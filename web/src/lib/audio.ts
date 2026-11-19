/** Browser audio is used by both the website and installed PWA. */
export function createAudio(): HTMLAudioElement {
  const audio = new Audio(); audio.preload = "auto"; return audio;
}

/** iOS keeps the single-player path. A spare element cannot keep a killed PWA alive. */
export function createUpcomingAudio(): HTMLAudioElement | null {
  if (!["https:", "http:"].includes(location.protocol) || /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return null;
  return createAudio();
}
