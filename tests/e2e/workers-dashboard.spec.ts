import { expect, test } from "@playwright/test";

const MOCK_DASHBOARD = {
  generated_at: "2026-08-13T12:00:00Z",
  summary: {
    deployed_count: 2,
    deployed_by_environment: { production: 1, preview: 1 },
    requests_24h_total: 3481220,
    requests_24h_change_pct: 11.0,
    error_rate_pct: 0.011,
    errors_24h_total: 412,
    cpu_p99_ms: 18,
  },
  workers: [
    {
      worker_name: "api-gateway",
      environment: "production",
      route_count: 4,
      last_deploy_at: "2026-08-13T06:00:00Z",
      requests_24h: 3200000,
      errors_24h: 400,
      cpu_p50_ms: 6,
      exposure_status: "critical",
    },
    {
      worker_name: "search-index",
      environment: "preview",
      route_count: 1,
      last_deploy_at: "2026-08-12T06:00:00Z",
      requests_24h: 281220,
      errors_24h: 12,
      cpu_p50_ms: 4,
      exposure_status: "safe",
    },
  ],
  workers_pagination: { page: 1, page_size: 50, total: 2, total_pages: 1 },
  recent_changes: [
    {
      occurred_at: "2026-08-07T13:42:08Z",
      actor: "wrangler",
      actor_source: "deploy",
      action: "Enabled workers.dev subdomain",
      target: "api-gateway",
      result_summary: "workers_dev: false -> true",
    },
  ],
  unavailable: [],
};

async function mockShellEndpoints(page: import("@playwright/test").Page) {
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ modules: [], unavailable_sources: [] }),
    }));
  await page.route("**/api/audit/alerts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ alerts: [], unavailable_sources: [] }),
    }));
  await page.route("**/api/audit/changes", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ since: "", until: "", changes: [], unavailable_sources: [] }),
    }));
}

test.beforeEach(async ({ page }) => {
  await mockShellEndpoints(page);
});

test("US1 — every deployed Worker appears once, with environment and rolled-up exposure status", async ({ page }) => {
  await page.route("**/api/workers/dashboard*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_DASHBOARD),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();

  const gatewayRow = page.getByTestId("findings-row-api-gateway");
  await expect(gatewayRow).toBeVisible();
  await expect(gatewayRow.getByText("production")).toBeVisible();
  await expect(gatewayRow.getByText("CRITICAL")).toBeVisible();

  const searchRow = page.getByTestId("findings-row-search-index");
  await expect(searchRow).toBeVisible();
  await expect(searchRow.getByText("preview")).toBeVisible();
  await expect(searchRow.getByText("PROTECTED")).toBeVisible();
});

test("US1 — sidebar shows Workers and Exposure as separate nav items with independent badges", async ({ page }) => {
  await page.route("**/api/workers/dashboard*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_DASHBOARD),
    }));
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Workers" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Exposure" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Workers" }).getByText("2", { exact: true }))
    .toBeVisible();
});

test("US1 — empty account renders an explicit empty state, not an empty table", async ({ page }) => {
  await page.route("**/api/workers/dashboard*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_DASHBOARD,
        summary: { ...MOCK_DASHBOARD.summary, deployed_count: 0 },
        workers: [],
        workers_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
      }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();

  await expect(page.getByText("No Workers in this account")).toBeVisible();
});

test("US2 — metric cards show real figures including the day-over-day delta", async ({ page }) => {
  await page.route("**/api/workers/dashboard*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_DASHBOARD),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();

  await expect(page.getByText("+11.0% vs yesterday")).toBeVisible();
  await expect(page.getByText("412 errors")).toBeVisible();
  await expect(page.getByText("18ms")).toBeVisible();
});

test("US2 — an unavailable analytics source degrades per-row metrics to 'not available', not zero", async ({ page }) => {
  await page.route("**/api/workers/dashboard*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_DASHBOARD,
        summary: {
          ...MOCK_DASHBOARD.summary,
          requests_24h_total: null,
          requests_24h_change_pct: null,
          error_rate_pct: null,
          errors_24h_total: null,
          cpu_p99_ms: null,
        },
        workers: MOCK_DASHBOARD.workers.map((w) => ({
          ...w,
          requests_24h: null,
          errors_24h: null,
          cpu_p50_ms: null,
        })),
        unavailable: [{ source: "analytics", error: "mocked failure" }],
      }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();

  const gatewayRow = page.getByTestId("findings-row-api-gateway");
  // Every "not available" figure — exact count depends on layout (metric
  // cards + per-row columns) so this asserts at least the row's own cells
  // degrade, not a fabricated 0.
  await expect(gatewayRow.getByText("not available").first()).toBeVisible();
  // Inventory/exposure columns are unaffected by the analytics failure.
  await expect(gatewayRow.getByText("CRITICAL")).toBeVisible();
});

test("US3 — recent changes panel shows Workers-relevant entries", async ({ page }) => {
  await page.route("**/api/workers/dashboard*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_DASHBOARD),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();

  await expect(page.getByText("Enabled workers.dev subdomain")).toBeVisible();
  await expect(page.getByText("wrangler · deploy", { exact: false })).toBeVisible();
});

test("specs/020 US2 — the Workers table paginates: page footer, next/prev, and boundary disabled states", async ({ page }) => {
  const allWorkers = Array.from({ length: 5 }, (_, i) => ({
    worker_name: `worker-${i}`,
    environment: "production",
    route_count: 1,
    last_deploy_at: null,
    requests_24h: null,
    errors_24h: null,
    cpu_p50_ms: null,
    exposure_status: "safe",
  }));

  await page.route("**/api/workers/dashboard*", (route) => {
    const url = new URL(route.request().url());
    const requestedPage = Number(url.searchParams.get("page") ?? "1");
    const pageSize = 2;
    const start = (requestedPage - 1) * pageSize;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_DASHBOARD,
        summary: { ...MOCK_DASHBOARD.summary, deployed_count: allWorkers.length },
        workers: allWorkers.slice(start, start + pageSize),
        workers_pagination: {
          page: requestedPage,
          page_size: pageSize,
          total: allWorkers.length,
          total_pages: Math.ceil(allWorkers.length / pageSize),
        },
      }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();

  await expect(page.getByTestId("findings-row-worker-0")).toBeVisible();
  await expect(page.getByTestId("findings-row-worker-1")).toBeVisible();
  await expect(page.getByTestId("findings-row-worker-2")).not.toBeVisible();
  await expect(page.getByTestId("pagination-status")).toHaveText("5 total · page 1 of 3");
  await expect(page.getByTestId("pagination-prev")).toBeDisabled();
  await expect(page.getByTestId("pagination-next")).toBeEnabled();

  await page.getByTestId("pagination-next").click();
  await expect(page.getByTestId("findings-row-worker-2")).toBeVisible();
  await expect(page.getByTestId("findings-row-worker-3")).toBeVisible();
  await expect(page.getByTestId("pagination-status")).toHaveText("5 total · page 2 of 3");
  await expect(page.getByTestId("pagination-prev")).toBeEnabled();

  await page.getByTestId("pagination-next").click();
  await expect(page.getByTestId("findings-row-worker-4")).toBeVisible();
  await expect(page.getByTestId("pagination-status")).toHaveText("5 total · page 3 of 3");
  await expect(page.getByTestId("pagination-next")).toBeDisabled();
});

test("specs/020 US2 — a small result set (fits one page) shows no pagination controls", async ({ page }) => {
  await page.route("**/api/workers/dashboard*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_DASHBOARD),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();

  await expect(page.getByTestId("findings-row-api-gateway")).toBeVisible();
  // FR-004: a result set that fits on one page renders with no pagination
  // controls at all, not a disabled/inert pager.
  await expect(page.getByTestId("pagination-footer")).not.toBeVisible();
});

test("US3 — recent changes panel shows an explicit empty state when there are none", async ({ page }) => {
  await page.route("**/api/workers/dashboard*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...MOCK_DASHBOARD, recent_changes: [] }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();

  await expect(page.getByText("No recent Workers-related changes.")).toBeVisible();
});
