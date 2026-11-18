import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { lazy, Suspense, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { registerSW } from "virtual:pwa-register";
import { AuthGate } from "./components/AuthGate";
const App = lazy(() => import("./App"));
import { desktop } from "./lib/desktop";
import "./styles.css";
import "./tv/tv.css";
import { installTvMode } from "./tv/tvMode";

// The desktop app ships its files locally; a service worker would only risk serving an old version after updates.
if (!desktop) registerSW({ immediate: true });

// Android TV: spatial D-pad navigation + 10-foot styling (no-op elsewhere).
installTvMode();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthGate><Suspense fallback={null}><App /></Suspense></AuthGate>
    </BrowserRouter>
  </StrictMode>,
);
