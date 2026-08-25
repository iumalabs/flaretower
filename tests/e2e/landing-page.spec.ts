import { expect, test } from "@playwright/test";

// spec 028 (tasks.md T011, User Story 1) — an unauthenticated visitor to
// "/" sees the public landing page, not the authenticated dashboard, and
// nothing on that page requires a session (SC-005: zero requests that need
// auth). An authenticated visitor sees the dashboard instead, unchanged.
//
// This file intentionally does NOT use the shared ./fixtures.ts session
// mock (which defaults every other spec to "authenticated") — the whole
// point here is exercising both session states explicitly per test.

test.describe("unauthenticated visitor", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(
      "**/api/identity/session",
      (route) => route.fulfill({ status: 403, contentType: "text/plain", body: "Forbidden" }),
    );
  });

  test("sees the public landing page at / instead of the dashboard", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /every door into your cloudflare account/i }))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "Overview" })).not.toBeVisible();
  });

  test("the landing page issues no request that requires an authenticated session", async ({ page }) => {
    const authRequiringPaths = [
      "/api/audit/summary",
      "/api/exposure/inventory",
      "/api/workers/dashboard",
      "/api/audit/alerts",
      "/api/audit/changes",
    ];
    const seen: string[] = [];
    await page.route("**/api/**", (route) => {
      const url = new URL(route.request().url());
      if (authRequiringPaths.some((p) => url.pathname.startsWith(p))) {
        seen.push(url.pathname);
      }
      // fallback (not continue) — continue() would send the request
      // straight to the network, bypassing this describe block's own
      // beforeEach mock for /api/identity/session (registered earlier,
      // so it's checked after this one falls back to it).
      route.fallback();
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /every door into your cloudflare account/i }))
      .toBeVisible();

    expect(seen).toEqual([]);
  });

  test("shows the sample exposure matrix panel with fixed, non-fetched sample data", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Exposure matrix · Sample", { exact: false })).toBeVisible();
    await expect(page.getByTestId("sample-row-api-gateway")).toBeVisible();
  });

  test("Documentation link navigates to the public /docs page without requiring sign-in", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "DOCUMENTATION" }).first().click();

    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByRole("heading", { name: "Documentation" })).toBeVisible();
  });
});

test.describe("authenticated visitor", () => {
  test.beforeEach(async ({ page }) => {
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
  });

  test("sees the authenticated dashboard at /, not the landing page", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("heading", { name: /every door into your cloudflare account/i }))
      .not.toBeVisible();
  });
});
