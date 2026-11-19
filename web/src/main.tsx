import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { lazy, Suspense, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { registerSW } from "virtual:pwa-register";
import { AuthGate } from "./components/AuthGate";
const App = lazy(() => import("./App"));
import "./styles.css";
import "./tv/tv.css";
import { installTvMode } from "./tv/tvMode";

registerSW({ immediate: true });

// Browser TV mode: spatial D-pad navigation and TV styling (no-op elsewhere).
installTvMode();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthGate><Suspense fallback={null}><App /></Suspense></AuthGate>
    </BrowserRouter>
  </StrictMode>,
);
