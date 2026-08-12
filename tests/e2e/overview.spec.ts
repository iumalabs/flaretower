import { expect, test } from "@playwright/test";

const MOCK_SUMMARY = {
  modules: [
    {
      module: "exposure",
      kind: "hostname",
      has_data: true,
      counts: { safe: 2, warning: 1, critical: 1, not_evaluated: 0 },
    },
    {
      module: "dns",
      kind: "record",
      has_data: true,
      counts: { safe: 5, warning: 0, critical: 0, not_evaluated: 0 },
    },
    {
      module: "zero-trust",
      kind: "application",
      has_data: false,
      counts: { safe: 0, warning: 0, critical: 0, not_evaluated: 0 },
    },
  ],
  unavailable_sources: [],
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
  await page.route("**/api/audit/alerts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_ALERTS),
    }));
  await page.route("**/api/audit/changes", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CHANGES),
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
  await expect(page.getByRole("button", { name: "Acknowledge" }).first()).toBeVisible();
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
          },
        ],
        unavailable_sources: [],
      }),
    }));
  await page.route("**/api/audit/alerts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ alerts: [], unavailable_sources: [] }),
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
          },
        ],
        unavailable_sources: [
          { module: "dns", kind: "record", error: "could not read dns_findings: D1_ERROR" },
        ],
      }),
    }));
  await page.goto("/");

  await expect(page.getByText("dns/record could not be read", { exact: false })).toBeVisible();
});
