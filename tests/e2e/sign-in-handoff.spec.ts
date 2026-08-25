import { expect, test } from "@playwright/test";

// spec 028 (tasks.md T013, User Story 2) — "Sign in" from any of the
// landing page's three entry points (header, hero, sample-panel teaser) is
// plain navigation to a real Access-protected route, never a fake in-app
// OIDC modal (FR-006 — App.dc.html's design mock had exactly such a modal
// with fabricated ISSUER/SCOPES/CALLBACK details; this feature deliberately
// does not build it). App.tsx's SIGN_IN_PATH is "/workers" — "/" itself
// becomes Access-public by this feature, so it can no longer be the target
// Access actually challenges (see App.tsx's own comment on SIGN_IN_PATH).

// Same stand-in as deep-link-routes.spec.ts uses: the local vite dev server
// has no SPA fallback for a bare GET to a non-root path (production's
// Cloudflare Workers Assets does), so a real `location.assign("/workers")`
// 404s locally. Fulfilling that one navigation request with the already-
// working shell HTML isolates what's actually under test here — that
// clicking "Sign in" performs plain navigation to a real path, not that
// production's asset-serving layer works (that's out of scope for this
// suite).
async function mockWorkersShell(page: import("@playwright/test").Page) {
  const shell = await (await page.request.get("/")).text();
  await page.route(
    "**/workers",
    (route) => route.fulfill({ status: 200, contentType: "text/html", body: shell }),
  );
}

test.beforeEach(async ({ page }) => {
  await page.route(
    "**/api/identity/session",
    (route) => route.fulfill({ status: 403, contentType: "text/plain", body: "Forbidden" }),
  );
});

for (
  const { label, locatorName } of [
    { label: "header SIGN IN button", locatorName: "SIGN IN" },
    { label: "hero CTA", locatorName: "Sign in with Cloudflare Access" },
    { label: "sample-panel teaser CTA", locatorName: "SIGN IN TO SEE YOURS" },
  ]
) {
  test(`${label} navigates to /workers, never an in-app sign-in modal`, async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /every door into your cloudflare account/i }))
      .toBeVisible();

    await mockWorkersShell(page);
    await page.getByRole("button", { name: locatorName }).first().click();

    await expect(page).toHaveURL(/\/workers$/);
    // FR-006 — no protocol detail (issuer/scope/callback) is ever rendered
    // client-side, before or after the click.
    for (const term of ["issuer", "scope", "callback", "oauth", "oidc"]) {
      await expect(page.getByText(new RegExp(term, "i"))).toHaveCount(0);
    }
  });
}
