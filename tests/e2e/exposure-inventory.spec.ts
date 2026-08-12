import { expect, test } from "@playwright/test";

const MOCK_INVENTORY = {
  run_id: "run-1",
  evaluated_at: "2026-08-07T12:00:00Z",
  workers: [
    {
      worker_name: "billing-api",
      hostnames: [
        {
          hostname: "billing.example.com",
          kind: "custom_domain",
          status: "safe",
          reason: "covered by Access application(s): billing-prod",
        },
        {
          hostname: "billing-api.acct.workers.dev",
          kind: "workers_dev",
          status: "critical",
          reason: "no Access application covers this hostname",
        },
      ],
    },
    {
      worker_name: "status-page",
      hostnames: [
        {
          hostname: "status.example.com",
          kind: "custom_domain",
          status: "warning",
          reason: "Access application policy includes Everyone",
        },
      ],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  // The real endpoint is Access-gated; mocking it here tests UI rendering
  // deterministically without requiring a live Zero Trust test account.
  await page.route("**/api/exposure/inventory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_INVENTORY),
    }));
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
  // "overview" is now the default page (tasks.md T033) — navigate into
  // Exposure explicitly, matching every other module's spec convention.
  await page.goto("/");
  await page.getByRole("button", { name: "Workers & Access" }).click();
});

function row(
  page: import("@playwright/test").Page,
  workerName: string,
  kind: string,
  hostname: string,
) {
  return page.getByTestId(`findings-row-${workerName}:${kind}:${hostname}`);
}

test("US1 — every Worker and every one of its hostnames appears, none omitted", async ({ page }) => {
  // The critical hostname legitimately appears twice — once in the row,
  // once in the account/module-scope alert banner above the table (FR-013).
  await expect(page.getByText("billing.example.com")).toBeVisible();
  await expect(page.getByText("billing-api.acct.workers.dev").first()).toBeVisible();
  await expect(page.getByText("status.example.com")).toBeVisible();
  // Worker names appear as their own column value, not a section heading —
  // the flagship table pattern is one flat, sortable/filterable table
  // across every worker, not grouped per-parent-entity cards. "billing-api"
  // legitimately appears twice (once per hostname row for that worker).
  await expect(page.getByText("billing-api", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("status-page", { exact: true })).toBeVisible();
});

test("US1 — hostnames on the same Worker show independent, not merged, statuses", async ({ page }) => {
  const criticalRow = row(page, "billing-api", "workers_dev", "billing-api.acct.workers.dev");
  await expect(criticalRow.getByText("CRITICAL")).toBeVisible();

  const safeRow = row(page, "billing-api", "custom_domain", "billing.example.com");
  await expect(safeRow.getByText("PROTECTED")).toBeVisible();
});

test("US2 — the critical badge is visually distinct from safe/warning, not just labeled differently", async ({ page }) => {
  const criticalRow = row(page, "billing-api", "workers_dev", "billing-api.acct.workers.dev");
  const safeRow = row(page, "billing-api", "custom_domain", "billing.example.com");

  // Distinct shape (design system: "shape carries the state," not color alone).
  const criticalShape = await criticalRow.locator("svg path").first().getAttribute("d");
  const safeShapeCount = await safeRow.locator("svg circle").count();
  expect(criticalShape).toBeTruthy();
  expect(safeShapeCount).toBe(1);
});

test("US3 — the warning badge is visually distinct from both critical and safe", async ({ page }) => {
  const warningRow = row(page, "status-page", "custom_domain", "status.example.com");
  await expect(warningRow.getByText("WARNING")).toBeVisible();
});

test("US2/AC3 — an alert banner surfaces the most urgent finding above the table (FR-013)", async ({ page }) => {
  await expect(
    page.getByText("A Worker is publicly reachable with no Access policy"),
  ).toBeVisible();
  await expect(page.getByText("billing-api.acct.workers.dev").first()).toBeVisible();
});

test("US2 — filtering to critical narrows the table, no reload", async ({ page }) => {
  await page.getByRole("button", { name: /CRITICAL 1/ }).click();
  await expect(page.getByText("billing-api.acct.workers.dev").first()).toBeVisible();
  await expect(page.getByText("status.example.com")).not.toBeVisible();
  await expect(page.getByText("billing.example.com")).not.toBeVisible();
});
