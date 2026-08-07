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
  await page.goto("/");
});

test("US1 — every Worker and every one of its hostnames appears, none omitted", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "billing-api" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "status-page" })).toBeVisible();
  await expect(page.getByText("billing.example.com")).toBeVisible();
  await expect(page.getByText("billing-api.acct.workers.dev")).toBeVisible();
  await expect(page.getByText("status.example.com")).toBeVisible();
});

test("US1 — hostnames on the same Worker show independent, not merged, statuses", async ({ page }) => {
  const row = page.locator("tr", { hasText: "billing-api.acct.workers.dev" });
  await expect(row.getByText("CRITICAL")).toBeVisible();

  const safeRow = page.locator("tr", { hasText: "billing.example.com" });
  await expect(safeRow.getByText("PROTECTED")).toBeVisible();
});

test("US2 — the critical badge is visually distinct from safe/warning, not just labeled differently", async ({ page }) => {
  const criticalRow = page.locator("tr", { hasText: "billing-api.acct.workers.dev" });
  const safeRow = page.locator("tr", { hasText: "billing.example.com" });

  // Distinct shape (design system: "shape carries the state," not color alone).
  const criticalShape = await criticalRow.locator("svg path").getAttribute("d");
  const safeShapeCount = await safeRow.locator("svg circle").count();
  expect(criticalShape).toBeTruthy();
  expect(safeShapeCount).toBe(1);

  // Distinct color token.
  await expect(criticalRow.locator("svg")).toHaveAttribute("fill", "var(--status-critical-fg)");
  await expect(safeRow.locator("svg")).toHaveAttribute("fill", "var(--status-safe)");

  // The row itself carries the critical tint + edge bar (constitution:
  // "MUST read as critical everywhere it appears"), not just the badge.
  await expect(criticalRow).toHaveCSS("background-color", "rgb(26, 12, 11)"); // --status-critical-row: #1A0C0B
});

test("US3 — the warning badge is visually distinct from both critical and safe", async ({ page }) => {
  const warningRow = page.locator("tr", { hasText: "status.example.com" });
  await expect(warningRow.getByText("WARNING")).toBeVisible();
  const diamondCount = await warningRow.locator("svg path").count();
  expect(diamondCount).toBe(1);
  await expect(warningRow.locator("svg")).toHaveAttribute("fill", "var(--status-warning)");
});
