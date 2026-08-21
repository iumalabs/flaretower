import { expect, test } from "@playwright/test";

const MOCK_SUMMARY = {
  modules: [
    {
      module: "exposure",
      kind: "hostname",
      has_data: true,
      counts: { safe: 2, warning: 1, critical: 1, not_evaluated: 0 },
      evaluated_at: "2026-08-18T09:55:00Z",
    },
    {
      module: "dns",
      kind: "record",
      has_data: true,
      counts: { safe: 5, warning: 0, critical: 0, not_evaluated: 0 },
      evaluated_at: "2026-08-18T09:50:00Z",
    },
    {
      module: "zero-trust",
      kind: "application",
      has_data: false,
      counts: { safe: 0, warning: 0, critical: 0, not_evaluated: 0 },
      evaluated_at: null,
    },
  ],
  unavailable_sources: [],
  account_scope: { zone_count: 3, worker_count: 15 },
};

const MOCK_ALERTS = {
  alerts: [
    {
      id: "a1",
      module: "exposure",
      kind: "hostname",
      entity_label: "api-gateway.acct.workers.dev",
      previous_status: "safe",
      new_status: "critical",
      detected_at: "2026-08-12T00:00:00Z",
      acknowledged_at: null,
      reason: "no Access application covers this hostname",
    },
    {
      id: "a2",
      module: "exposure",
      kind: "hostname",
      entity_label: "status.example.com",
      previous_status: "safe",
      new_status: "warning",
      detected_at: "2026-08-11T00:00:00Z",
      acknowledged_at: null,
      reason: "Access application policy includes Everyone",
    },
  ],
  unavailable_sources: [],
  pagination: { page: 1, page_size: 5, total: 2, total_pages: 1 },
};

const MOCK_TREND = {
  days: [
    {
      date: "2026-08-17",
      has_data: true,
      counts: { safe: 6, warning: 1, critical: 0, not_evaluated: 0 },
    },
    {
      date: "2026-08-18",
      has_data: true,
      counts: { safe: 7, warning: 1, critical: 1, not_evaluated: 0 },
    },
  ],
  unavailable_sources: [],
};

const MOCK_CHANGES = {
  since: "2026-08-11T00:00:00Z",
  until: "2026-08-12T00:00:00Z",
  changes: [
    {
      module: "exposure",
      kind: "hostname",
      entity_label: "api-gateway.acct.workers.dev",
      previous_status: "safe",
      current_status: "critical",
    },
  ],
  unavailable_sources: [],
  pagination: { page: 1, page_size: 5, total: 1, total_pages: 1 },
};

async function mockModulePages(page: import("@playwright/test").Page) {
  await page.route("**/api/exposure/inventory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run_id: null, evaluated_at: null, workers: [] }),
    }));
}

test.beforeEach(async ({ page }) => {
  await mockModulePages(page);
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SUMMARY),
    }));
  await page.route("**/api/audit/alerts*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_ALERTS),
    }));
  await page.route("**/api/audit/changes*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CHANGES),
    }));
  await page.route("**/api/audit/trend*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_TREND),
    }));
  await page.goto("/");
});

test("US3/AC1 — aggregate per-severity counts render across all modules", async ({ page }) => {
  // critical: 1 (exposure) + 0 (dns) = 1; warning: 1 (exposure); safe: 2+5=7.
  // zero-trust is has_data:false so contributes nothing.
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("critical findings")).toBeVisible();
  await expect(page.getByText("warning findings")).toBeVisible();
  // Metric card label is lowercase "protected" — distinct from the badge's
  // uppercase "PROTECTED" text (Playwright's default text match is case-
  // insensitive, so {exact:true} is needed to disambiguate the two).
  await expect(page.getByText("protected", { exact: true })).toBeVisible();
});

test("US3/AC2 — aggregate counts match the sum of per-module data", async ({ page }) => {
  const criticalCard = page.getByText("critical findings").locator("..");
  await expect(criticalCard.getByText("1", { exact: true })).toBeVisible();

  const safeCard = page.getByText("protected", { exact: true }).locator("..");
  await expect(safeCard.getByText("7", { exact: true })).toBeVisible();
});

test("US3/AC3 — a critical finding appears in the prioritized list with an acknowledge affordance", async ({ page }) => {
  // The critical entity_label legitimately appears twice — once in the
  // Findings list, once in the Scan log (both mocks reference the same
  // entity).
  await expect(page.getByText("api-gateway.acct.workers.dev").first()).toBeVisible();
  // issue #429 — the row's one button is labeled contextually ("Review
  // exposure" for this module) but performs the real acknowledge action.
  await expect(page.getByRole("button", { name: "Review exposure" }).first()).toBeVisible();
});

test("US3/AC4 — a recent-activity log renders", async ({ page }) => {
  await expect(page.getByText("Scan log")).toBeVisible();
  await expect(page.getByText("safe → critical", { exact: false })).toBeVisible();
});

test("US3/AC5 — an all-clear state renders when every module has zero findings", async ({ page }) => {
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        modules: [
          {
            module: "exposure",
            kind: "hostname",
            has_data: true,
            counts: { safe: 3, warning: 0, critical: 0, not_evaluated: 0 },
            evaluated_at: "2026-08-18T09:55:00Z",
          },
        ],
        unavailable_sources: [],
        account_scope: { zone_count: 1, worker_count: 3 },
      }),
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
  await page.goto("/");

  await expect(page.getByText("Nothing needs attention right now")).toBeVisible();
});

test("FR-018 — a module reported unavailable is shown as not-available, not folded into zero", async ({ page }) => {
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        modules: [
          {
            module: "exposure",
            kind: "hostname",
            has_data: true,
            counts: { safe: 3, warning: 0, critical: 0, not_evaluated: 0 },
            evaluated_at: "2026-08-18T09:55:00Z",
          },
        ],
        unavailable_sources: [
          { module: "dns", kind: "record", error: "could not read dns_findings: D1_ERROR" },
        ],
        account_scope: { zone_count: 1, worker_count: 3 },
      }),
    }));
  await page.goto("/");

  await expect(page.getByText("dns/record could not be read", { exact: false })).toBeVisible();
});

// specs/022-audit-list-pagination
test("specs/022 US2 — more than 5 alerts shows a bounded top-5 with an accurate 'N more' indicator", async ({ page }) => {
  const manyAlerts = Array.from({ length: 8 }, (_, i) => ({
    id: `a${i}`,
    module: "exposure",
    kind: "hostname",
    entity_label: `host-${i}.example.com`,
    previous_status: "safe",
    new_status: "warning",
    detected_at: "2026-08-12T00:00:00Z",
    acknowledged_at: null,
    reason: "no Access application covers this hostname",
  }));
  await page.route("**/api/audit/alerts*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        alerts: manyAlerts.slice(0, 5),
        unavailable_sources: [],
        pagination: { page: 1, page_size: 5, total: manyAlerts.length, total_pages: 2 },
      }),
    }));
  await page.goto("/");

  for (let i = 0; i < 5; i++) {
    await expect(page.getByText(`host-${i}.example.com`)).toBeVisible();
  }
  for (let i = 5; i < 8; i++) {
    await expect(page.getByText(`host-${i}.example.com`)).not.toBeVisible();
  }
  await expect(page.getByTestId("overview-alerts-more")).toHaveText("3 more — see full list");
});

test("specs/022 US2 — 5 or fewer alerts shows no 'more' indicator", async ({ page }) => {
  // beforeEach's MOCK_ALERTS has 2 alerts, total: 2.
  await page.goto("/");
  await expect(page.getByTestId("overview-alerts-more")).not.toBeVisible();
});

test("specs/022 US2 — the 'more' indicator navigates to Audit & Drift's Unified alerts inbox tab", async ({ page }) => {
  const manyAlerts = Array.from({ length: 7 }, (_, i) => ({
    id: `a${i}`,
    module: "exposure",
    kind: "hostname",
    entity_label: `host-${i}.example.com`,
    previous_status: "safe",
    new_status: "warning",
    detected_at: "2026-08-12T00:00:00Z",
    acknowledged_at: null,
    reason: "no Access application covers this hostname",
  }));
  await page.route("**/api/audit/alerts*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        alerts: manyAlerts.slice(0, 5),
        unavailable_sources: [],
        pagination: { page: 1, page_size: 5, total: manyAlerts.length, total_pages: 2 },
      }),
    }));
  // AuditInventory's own required shell/route mocks, once navigated to.
  await page.route("**/api/audit/log", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        since: "",
        until: "",
        unavailable: false,
        total: 0,
        truncated: false,
        entries: [],
      }),
    }));
  await page.route("**/api/dns/inventory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run_id: null, evaluated_at: null, zones: [] }),
    }));
  await page.route("**/api/zero-trust/inventory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run_id: null,
        evaluated_at: null,
        applications: [],
        service_tokens: [],
      }),
    }));
  await page.route("**/api/pages/inventory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run_id: null, evaluated_at: null, projects: [] }),
    }));
  await page.route("**/api/storage/inventory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run_id: null,
        evaluated_at: null,
        buckets: [],
        kv_namespaces: [],
        d1_databases: [],
      }),
    }));
  await page.route("**/api/security/inventory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run_id: null, evaluated_at: null, zones: [], turnstile_widgets: [] }),
    }));
  await page.goto("/");

  await page.getByTestId("overview-alerts-more").click();

  await expect(page.getByRole("heading", { name: "Audit & Drift" })).toBeVisible();
  await page.getByRole("tab", { name: "Unified alerts inbox" }).click();
  await expect(page.getByTestId("findings-row-a0")).toBeVisible();
});

// ---- User Story 1 — header context row ----

const EVALUATE_ENDPOINTS = [
  "**/api/exposure/evaluate",
  "**/api/dns/evaluate",
  "**/api/zero-trust/evaluate",
  "**/api/pages/evaluate",
  "**/api/storage/evaluate",
  "**/api/security/evaluate",
];

test("US1 — header shows real zone/Worker counts and a last-scanned time", async ({ page }) => {
  await expect(page.getByText("3 zones · 15 workers")).toBeVisible();
  await expect(page.getByText(/^last scanned .+ ago$/)).toBeVisible();
  await expect(page.getByText("runs hourly")).toBeVisible();
});

test("US1 — a never-evaluated account shows an explicit 'never scanned' state", async ({ page }) => {
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        modules: [
          {
            module: "exposure",
            kind: "hostname",
            has_data: false,
            counts: { safe: 0, warning: 0, critical: 0, not_evaluated: 0 },
            evaluated_at: null,
          },
        ],
        unavailable_sources: [],
        account_scope: { zone_count: 0, worker_count: 0 },
      }),
    }));
  await page.goto("/");

  await expect(page.getByText("never scanned")).toBeVisible();
});

test("US1 — RE-SCAN shows in-progress state, can't be re-triggered, and refreshes data on completion", async ({ page }) => {
  for (const endpoint of EVALUATE_ENDPOINTS) {
    await page.route(endpoint, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ run_id: "run-2" }),
      });
    });
  }

  const button = page.getByRole("button", { name: "RE-SCAN" });
  await button.click();
  await expect(page.getByRole("button", { name: "SCANNING…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "SCANNING…" })).toBeDisabled();

  await expect(page.getByRole("button", { name: "RE-SCAN" })).toBeVisible();
});

test("US1 — one module's evaluate failure doesn't hide the other five's success", async ({ page }) => {
  await page.route(
    "**/api/exposure/evaluate",
    (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({}) }),
  );
  for (const endpoint of EVALUATE_ENDPOINTS.slice(1)) {
    await page.route(endpoint, (route) =>
      route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ run_id: "run-2" }),
      }));
  }

  await page.getByRole("button", { name: "RE-SCAN" }).click();

  await expect(page.getByText("Exposure failed to re-scan")).toBeVisible();
  await expect(page.getByRole("button", { name: "RE-SCAN" })).toBeEnabled();
});

test("US1 — a stale fetch-error banner clears once a later RE-SCAN succeeds", async ({ page }) => {
  await page.route(
    "**/api/audit/summary",
    (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/");
  await expect(page.getByText("GET /api/audit/summary failed: 500")).toBeVisible();

  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SUMMARY),
    }));
  for (const endpoint of EVALUATE_ENDPOINTS) {
    await page.route(endpoint, (route) =>
      route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ run_id: "run-2" }),
      }));
  }

  await page.getByRole("button", { name: "RE-SCAN" }).click();

  await expect(page.getByText("3 zones · 15 workers")).toBeVisible();
  await expect(page.getByText("GET /api/audit/summary failed: 500")).not.toBeVisible();
});

// ---- User Story 2 — findings row reason + contextual action ----

test("US2 — each finding row shows its real plain-language reason, not a slug", async ({ page }) => {
  await expect(page.getByText("no Access application covers this hostname")).toBeVisible();
  await expect(page.getByText("Access application policy includes Everyone")).toBeVisible();
});

// issue #429 — the design reference shows one button per row, not a
// decorative contextual label alongside a separate real Acknowledge
// control; merged into a single button whose text is the contextual
// label and whose click performs the real acknowledge action.
test("US2 — the row's single button is labeled contextually and performs the real acknowledge action", async ({ page }) => {
  await page.route(
    "**/api/audit/alerts/exposure/hostname/a1/acknowledge",
    (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );

  await expect(page.getByText("api-gateway.acct.workers.dev").first()).toBeVisible();
  const button = page.getByRole("button", { name: "Review exposure" }).first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByText("no Access application covers this hostname")).toHaveCount(0);
});

// ---- User Story 3 — Exposure over time trend chart ----

test("US3 — the trend chart renders real historical days", async ({ page }) => {
  await expect(page.getByText("Exposure over time")).toBeVisible();
  await expect(page.getByTestId("trend-day-2026-08-17")).toBeVisible();
  await expect(page.getByTestId("trend-day-2026-08-18")).toBeVisible();
});

test("US3 — a day before the account's evaluation history shows an explicit no-data state", async ({ page }) => {
  await page.route("**/api/audit/trend*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        days: [
          {
            date: "2026-08-16",
            has_data: false,
            counts: { safe: 0, warning: 0, critical: 0, not_evaluated: 0 },
          },
          {
            date: "2026-08-17",
            has_data: true,
            counts: { safe: 6, warning: 1, critical: 0, not_evaluated: 0 },
          },
        ],
        unavailable_sources: [],
      }),
    }));
  await page.goto("/");

  const noDataDay = page.getByTestId("trend-day-2026-08-16");
  await expect(noDataDay).toHaveAttribute("title", "2026-08-16: no data");
});

test("US3 — a trend-fetch failure degrades gracefully, without blocking the rest of the page", async ({ page }) => {
  await page.route(
    "**/api/audit/trend*",
    (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({}) }),
  );
  await page.goto("/");

  // The rest of the page (Findings panel) still works despite the trend
  // endpoint failing.
  await expect(page.getByText("api-gateway.acct.workers.dev").first()).toBeVisible();
});
