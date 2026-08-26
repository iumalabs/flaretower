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
  // "*" (not an exact "/workers" match) — handleSignIn now appends
  // issue #512's own "?post-sign-in=1" marker, so the real navigation
  // target is "/workers?post-sign-in=1", not a bare "/workers".
  await page.route(
    "**/workers*",
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

    await expect(page).toHaveURL(/\/workers\?post-sign-in=1$/);
    // FR-006 — no protocol detail (issuer/scope/callback) is ever rendered
    // client-side, before or after the click.
    for (const term of ["issuer", "scope", "callback", "oauth", "oidc"]) {
      await expect(page.getByText(new RegExp(term, "i"))).toHaveCount(0);
    }
  });
}

// issue #512 — landing on SIGN_IN_PATH is an implementation detail of how
// the hand-off guarantees a real Access challenge (see App.tsx's own
// comment); it must never be the operator's actual resting place once
// Access's challenge completes. This simulates that completed state
// directly (identity/session now resolves to a real identity, exactly as
// it would once Access has redirected back with a valid session) rather
// than driving a real Access challenge, which this suite has no way to do.
test("once Access's challenge completes, the operator lands on Overview, not stranded on Workers", async ({ page }) => {
  const shell = await (await page.request.get("/")).text();
  await page.route(
    "**/workers*",
    (route) => route.fulfill({ status: 200, contentType: "text/html", body: shell }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "SIGN IN" }).first().click();
  await expect(page).toHaveURL(/\/workers\?post-sign-in=1$/);

  // From here on, the browser is "back from Access" with a real session —
  // re-route the session probe (and everything Overview needs) to reflect
  // that, then reload to re-run the boot sequence against the new state.
  await page.unroute("**/api/identity/session");
  await page.route(
    "**/api/identity/session",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ email: "operator@example.com", role: "admin" }),
      }),
  );
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ modules: [], unavailable_sources: [] }),
    }));
  await page.route(
    "**/api/exposure/inventory",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ run_id: null, evaluated_at: null, workers: [] }),
      }),
  );
  await page.route(
    "**/api/workers/dashboard*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          generated_at: "2026-08-13T12:00:00Z",
          summary: {
            deployed_count: 0,
            deployed_by_environment: { production: 0, preview: 0 },
            requests_24h_total: null,
            requests_24h_change_pct: null,
            error_rate_pct: null,
            errors_24h_total: null,
            cpu_p99_ms: null,
          },
          workers: [],
          workers_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
          recent_changes: [],
          unavailable: [],
        }),
      }),
  );
  await page.route("**/api/audit/alerts*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        alerts: [],
        unavailable_sources: [],
        pagination: { page: 1, page_size: 5, total: 0, total_pages: 1 },
      }),
    }));
  await page.route("**/api/audit/changes*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        since: "",
        until: "",
        changes: [],
        unavailable_sources: [],
        pagination: { page: 1, page_size: 5, total: 0, total_pages: 1 },
      }),
    }));
  await page.route(
    "**/api/audit/trend*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ points: [] }),
      }),
  );

  await page.reload();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Overview" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
