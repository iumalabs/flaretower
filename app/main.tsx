import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { App } from "./App.tsx";
import "./styles/fonts.css";
import "./styles/tokens.css";

// FlightDeck (iumalabs/flightdeck) integration test — real error/trace
// reporting for FlareTower's own production deployment. The DSN is a
// Sentry-protocol public key, meant to ship in client code (same as any
// Sentry.io DSN) — no point routing it through a build var/secret, since
// it ends up readable in the shipped bundle either way. Gated on
// __APP_VERSION__ (empty on local dev, preview, and feature-branch builds —
// vite.config.ts's readAppVersion) so only a genuine production build ever
// reports, matching the footer's own "real release only" convention; this
// also keeps Playwright's e2e suite (always run against the plain dev
// server, never a production build) from ever sending telemetry.
if (__APP_VERSION__) {
  Sentry.init({
    dsn:
      "https://c0bac7046fadd98f5ceaea515abb842f@flightdeck.iuma.dev/8d73d949-01f3-4328-b836-928fb44507c9",
    environment: "production",
    release: __APP_VERSION__,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.2,
  });
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root element not found");
}

createRoot(root).render(<App />);
