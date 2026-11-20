/** Browser audio is used by both the website and installed PWA. */
export function createAudio(): HTMLAudioElement {
  const audio = new Audio(); audio.preload = "auto"; return audio;
}
