import { App } from "@capacitor/app";
import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { installTvMode, installTvModeOnRemoteUse } from "../tv/tvMode";

/** MusikeDevicePlugin.java: what kind of device this is. */
const Device = registerPlugin<{ info(): Promise<{ tv: boolean }> }>("MusikeDevice", {
  web: () => ({ info: async () => ({ tv: false }) }),
});

// How the app fits into Android itself: Android TV, the Back button and the system bars.
if (Capacitor.isNativePlatform()) {
  // One APK for phones and TVs: on a TV, switch to the remote-friendly 10-foot UI (web/src/tv).
  installTvModeOnRemoteUse();
  void Device.info()
    .then(({ tv }) => {
      if (!tv) return;
      document.documentElement.dataset.tv = "1";
      installTvMode();
    })
    .catch(() => {});

  // Back closes what's on top (a dialog, a menu), then goes back through pages, then sends the app to the
  // background, where the music keeps playing.
  void App.addListener("backButton", () => {
    const overlay = [...document.querySelectorAll("[data-escape-closes]")].some((el) => el.getClientRects().length > 0);
    if (overlay) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      return;
    }
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) window.history.back();
    else void App.minimizeApp();
  });

  // Status and navigation bar icons stay readable in both themes.
  const syncBars = () => {
    const light = document.documentElement.dataset.theme === "light";
    void SystemBars.setStyle({ style: light ? SystemBarsStyle.Light : SystemBarsStyle.Dark });
  };
  syncBars();
  new MutationObserver(syncBars).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}
