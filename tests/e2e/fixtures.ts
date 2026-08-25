import { expect, test as base } from "@playwright/test";

// spec 028 — every existing e2e spec navigates to "/" (or another route)
// expecting the authenticated dashboard shell to render immediately, the
// same way it always has. Now that App.tsx picks between the landing page
// and the dashboard based on a client-side session probe
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
      await use();
    },
    { auto: true },
  ],
});

export { expect };
