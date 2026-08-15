import { expect, test } from "@playwright/test";

async function mockShellEndpoints(page: import("@playwright/test").Page) {
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ modules: [], unavailable_sources: [] }),
    }));
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
  await page.route("**/api/workers/dashboard*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generated_at: "2026-08-14T12:00:00Z",
        summary: {
          deployed_count: 0,
          deployed_by_environment: {},
          requests_24h_total: 0,
          requests_24h_change_pct: 0,
          error_rate_pct: 0,
          errors_24h_total: 0,
          cpu_p99_ms: 0,
        },
        workers: [],
        workers_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        recent_changes: [],
        unavailable: [],
      }),
    }));
}

test.beforeEach(async ({ page }) => {
  await mockShellEndpoints(page);
});

// docs/design.zip's sidebar nav() mockup added a hover tooltip on every nav
// item — a short uppercase category tag plus a one-sentence description,
// shown to the right of the item.
test("sidebar nav item shows a tooltip on hover with its tag and description", async ({ page }) => {
  await page.goto("/");

  const workersButton = page.getByRole("button", { name: "Workers" });
  await expect(page.getByTestId("nav-tooltip-workers")).not.toBeVisible();

  await workersButton.hover();
  const tooltip = page.getByTestId("nav-tooltip-workers");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("INVENTORY");
  await expect(tooltip).toContainText(
    "Every deployed Worker with its routes, environments, bindings and traffic.",
  );

  await page.getByRole("button", { name: "DNS" }).hover();
  await expect(tooltip).not.toBeVisible();
});

test("sidebar nav item shows its tooltip on keyboard focus too", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Exposure" }).focus();
  const tooltip = page.getByTestId("nav-tooltip-exposure");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("FLAGSHIP");
});
