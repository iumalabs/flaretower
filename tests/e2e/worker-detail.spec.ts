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
}

const MOCK_DASHBOARD = {
  generated_at: "2026-08-16T12:00:00Z",
  summary: {
    deployed_count: 1,
    deployed_by_environment: { production: 1, preview: 0 },
    requests_24h_total: 100,
    requests_24h_change_pct: 0,
    error_rate_pct: 0,
    errors_24h_total: 0,
    cpu_p99_ms: 5,
  },
  workers: [
    {
      worker_name: "api-gateway",
      environment: "production",
      route_count: 2,
      last_deploy_at: "2026-08-15T00:00:00Z",
      requests_24h: 100,
      errors_24h: 0,
      cpu_p50_ms: 4,
      exposure_status: "critical",
    },
  ],
  workers_pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
  recent_changes: [],
  unavailable: [],
};

const MOCK_DETAIL = {
  worker_name: "api-gateway",
  environment: "production",
  routes: [
    {
      hostname: "api.acme.dev",
      kind: "custom_domain",
      status: "safe",
      reason: "covered by Access application(s): app-1",
      policy: null,
    },
    {
      hostname: "api-gateway.acme-labs.workers.dev",
      kind: "workers_dev",
      status: "critical",
      reason: "no Access application covers this hostname",
      policy: null,
    },
  ],
  recent_changes: [],
  cloudflare_url: "https://dash.cloudflare.com/acct-1/workers/services/view/api-gateway/production",
  unavailable: [],
};

test.beforeEach(async ({ page }) => {
  await mockShellEndpoints(page);
});

test("US1 — clicking a Worker row opens its detail page with per-route status", async ({ page }) => {
  await page.route(
    "**/api/workers/dashboard*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DASHBOARD),
      }),
  );
  await page.route(
    "**/api/workers/api-gateway/detail",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DETAIL),
      }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();
  await page.getByTestId("findings-row-api-gateway").click();

  await expect(page.getByRole("heading", { name: "api-gateway" })).toBeVisible();
  await expect(page.getByText("api.acme.dev")).toBeVisible();
  await expect(page.getByText("api-gateway.acme-labs.workers.dev")).toBeVisible();
  await expect(page.getByText("CRITICAL")).toBeVisible();
  await expect(page.getByText("PROTECTED")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open in Cloudflare" })).toHaveAttribute(
    "href",
    MOCK_DETAIL.cloudflare_url,
  );
});

// issue #431 — a real breadcrumb, and visual-only action buttons derived
// from this Worker's own routes (workers.dev is critical here -> "Disable
// workers.dev"; the custom domain is safe, not critical -> no "Attach
// Access application"; no route is warning -> no "Review policy"; re-scan
// is always offered).
test("issue #431 — breadcrumb navigates back, and action buttons reflect this Worker's own findings", async ({ page }) => {
  await page.route(
    "**/api/workers/dashboard*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DASHBOARD),
      }),
  );
  await page.route(
    "**/api/workers/api-gateway/detail",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DETAIL),
      }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();
  await page.getByTestId("findings-row-api-gateway").click();

  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumb.getByText("Workers", { exact: true })).toBeVisible();
  await expect(breadcrumb.getByText("api-gateway", { exact: true })).toBeVisible();

  await expect(page.getByTestId("worker-action-Disable workers.dev")).toBeVisible();
  await expect(page.getByTestId("worker-action-Re-scan Worker")).toBeVisible();
  await expect(page.getByTestId("worker-action-Attach Access application")).toHaveCount(0);
  await expect(page.getByTestId("worker-action-Review policy")).toHaveCount(0);

  await breadcrumb.getByRole("button", { name: "Workers" }).click();
  await expect(page.getByTestId("findings-row-api-gateway")).toBeVisible();
});

test("issue #431 — a critical custom domain derives Attach Access application; a warning route derives Review policy", async ({ page }) => {
  await page.route(
    "**/api/workers/dashboard*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DASHBOARD),
      }),
  );
  await page.route("**/api/workers/api-gateway/detail", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_DETAIL,
        routes: [
          {
            hostname: "api.acme.dev",
            kind: "custom_domain",
            status: "critical",
            reason: "no Access application covers this hostname",
            policy: null,
          },
          {
            hostname: "status.acme.dev",
            kind: "custom_domain",
            status: "warning",
            reason: "Access application policy includes Everyone",
            policy: null,
          },
        ],
      }),
    }));

  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();
  await page.getByTestId("findings-row-api-gateway").click();

  await expect(page.getByTestId("worker-action-Attach Access application")).toBeVisible();
  await expect(page.getByTestId("worker-action-Review policy")).toBeVisible();
  await expect(page.getByTestId("worker-action-Disable workers.dev")).toHaveCount(0);
});

test("US1 — a Worker not in the latest evaluation run shows an explicit not-found state", async ({ page }) => {
  await page.route(
    "**/api/workers/dashboard*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DASHBOARD),
      }),
  );
  await page.route("**/api/workers/api-gateway/detail", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "worker not found in latest evaluation run" }),
    }));

  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();
  await page.getByTestId("findings-row-api-gateway").click();

  await expect(page.getByText("Worker not found")).toBeVisible();
});

test("US2 — a covered route shows its Access policy in plain language; an uncovered route says so explicitly", async ({ page }) => {
  await page.route(
    "**/api/workers/dashboard*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DASHBOARD),
      }),
  );
  await page.route("**/api/workers/api-gateway/detail", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_DETAIL,
        routes: [
          {
            hostname: "api.acme.dev",
            kind: "custom_domain",
            status: "safe",
            reason: "covered by Access application(s): app-1",
            policy: {
              app_id: "app-1",
              app_name: "gateway-admin",
              app_domain: "api.acme.dev",
              policy_rules: [[{ verb: "ALLOW", label: "emails ending in @acme.dev" }]],
            },
          },
          {
            hostname: "api-gateway.acme-labs.workers.dev",
            kind: "workers_dev",
            status: "critical",
            reason: "no Access application covers this hostname",
            policy: null,
          },
        ],
      }),
    }));

  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();
  await page.getByTestId("findings-row-api-gateway").click();

  await expect(page.getByText("gateway-admin")).toBeVisible();
  await expect(page.getByText("ALLOW")).toBeVisible();
  await expect(page.getByText("emails ending in @acme.dev")).toBeVisible();
  await expect(page.getByText("No Access application policy covers this route.")).toBeVisible();
});

// issue #416: a null policy on a route whose own `reason` already names a
// covering Access application (i.e. any non-critical status) must not say
// "no policy covers this route" — that directly contradicts the reason
// text shown on the same row. Reproduced live: the exposure evaluation run
// that produced the route predated covering_app_ids being populated
// (research.md §2's documented degradation path), not a genuine gap.
test("issue #416 — a safe route with an unresolved policy shows a non-contradictory message, not the uncovered-route text", async ({ page }) => {
  await page.route(
    "**/api/workers/dashboard*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DASHBOARD),
      }),
  );
  await page.route("**/api/workers/api-gateway/detail", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_DETAIL,
        routes: [
          {
            hostname: "memos.maksimyugai.com",
            kind: "custom_domain",
            status: "safe",
            reason: "covered by Access application(s): app-1",
            policy: null,
          },
        ],
      }),
    }));

  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();
  await page.getByTestId("findings-row-api-gateway").click();

  await expect(page.getByTestId("route-policy-unavailable")).toHaveText(
    "Policy details unavailable for this route right now.",
  );
  await expect(page.getByText("No Access application policy covers this route.")).not.toBeVisible();
});

test("US3 — recent changes are scoped to this Worker, with an explicit empty state when there are none", async ({ page }) => {
  await page.route(
    "**/api/workers/dashboard*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DASHBOARD),
      }),
  );
  await page.route("**/api/workers/api-gateway/detail", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_DETAIL,
        recent_changes: [
          {
            occurred_at: "2026-08-15T13:00:00Z",
            actor: "wrangler",
            actor_source: "deploy",
            action: "Enabled workers.dev subdomain",
            target: "api-gateway.acme-labs.workers.dev",
            result_summary: "workers_dev: false -> true",
          },
        ],
      }),
    }));

  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();
  await page.getByTestId("findings-row-api-gateway").click();

  await expect(page.getByTestId("recent-change-0")).toContainText("Enabled workers.dev subdomain");
  await expect(page.getByTestId("recent-change-0")).toContainText("wrangler · deploy");

  // Regression (issue #432): panel headings are body text at weight 600,
  // not the small mono/uppercase label style meant for table column
  // headers.
  for (const text of ["Routes", "Recent changes"]) {
    const heading = page.getByText(text, { exact: true });
    const style = await heading.evaluate((el) => ({
      fontFamily: getComputedStyle(el).fontFamily,
      textTransform: getComputedStyle(el).textTransform,
    }));
    expect(style.fontFamily).toContain("IBM Plex Sans");
    expect(style.textTransform).not.toBe("uppercase");
  }
});

test("US3 — a Worker with no recent changes shows an explicit empty state, distinct from unavailable", async ({ page }) => {
  await page.route(
    "**/api/workers/dashboard*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DASHBOARD),
      }),
  );
  await page.route("**/api/workers/api-gateway/detail", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...MOCK_DETAIL, recent_changes: [] }),
    }));

  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();
  await page.getByTestId("findings-row-api-gateway").click();

  await expect(page.getByText("No recent changes for this Worker.")).toBeVisible();
});

test("US3 — an audit log fetch failure shows an explicit unavailable state, not an empty list", async ({ page }) => {
  await page.route(
    "**/api/workers/dashboard*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DASHBOARD),
      }),
  );
  await page.route("**/api/workers/api-gateway/detail", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_DETAIL,
        recent_changes: [],
        unavailable: [{
          source: "recent_changes",
          error: "Cloudflare Audit Logs API returned HTTP 403",
        }],
      }),
    }));

  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();
  await page.getByTestId("findings-row-api-gateway").click();

  await expect(page.getByTestId("recent-changes-unavailable")).toContainText(
    "Cloudflare Audit Logs API returned HTTP 403",
  );
  await expect(page.getByText("No recent changes for this Worker.")).not.toBeVisible();
});

test("US1/FR-007 — a Worker with zero HTTP routes shows an explicit 'exposure does not apply' state", async ({ page }) => {
  await page.route(
    "**/api/workers/dashboard*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DASHBOARD),
      }),
  );
  await page.route("**/api/workers/api-gateway/detail", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...MOCK_DETAIL, routes: [] }),
    }));

  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();
  await page.getByTestId("findings-row-api-gateway").click();

  await expect(page.getByText("Exposure does not apply")).toBeVisible();
});
