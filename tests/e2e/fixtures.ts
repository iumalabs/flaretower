import { expect, test as base } from "@playwright/test";

// spec 028 — every existing e2e spec navigates to "/app" (or another route
// under it) expecting the authenticated dashboard shell to render
// immediately, the same way it always has. Now that App.tsx picks between
// the landing page and the dashboard based on a client-side session probe
// (GET /api/identity/session — contracts/session-probe.md), that probe
// needs a response before any of those specs' assumptions hold. Rather
// than duplicating a route mock in all 15 files' beforeEach blocks, this
// autouse fixture registers one here; specs testing the unauthenticated
// experience itself (landing-page.spec.ts, sign-in-handoff.spec.ts)
// re-register the same route with their own response — Playwright checks
// the most-recently-registered matching route first, so a test-local
// page.route call always wins over this default.
export const MOCK_SESSION_IDENTITY = { email: "operator@example.com", role: "admin" };

export const test = base.extend<{ mockSession: void }>({
  mockSession: [
    async ({ page }, use) => {
      await page.route(
        "**/api/identity/session",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(MOCK_SESSION_IDENTITY),
          }),
      );
      // "/" no longer auto-redirects an authenticated visitor into the
      // dashboard (App.tsx's landing-page comment — an authenticated
      // operator can now open the public landing page too), so every spec
      // exercising the dashboard itself must navigate to "/app" directly.
      // The local vite dev server this suite runs against has no SPA
      // fallback for a bare GET to a non-root path (deep-link-routes.spec.ts's
      // own mockDeepLinkShell comment explains why in detail) — registered
      // here, once, rather than in every one of those files, exactly like
      // the session-probe mock above.
      const shell = await (await page.request.get("/")).text();
      await page.route(
        "**/app",
        (route) => route.fulfill({ status: 200, contentType: "text/html", body: shell }),
      );
      await use();
    },
    { auto: true },
  ],
});

export { expect };
