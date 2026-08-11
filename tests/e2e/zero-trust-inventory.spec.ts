import { expect, test } from "@playwright/test";

const MOCK_ZT_INVENTORY = {
  run_id: "run-1",
  evaluated_at: "2026-08-07T12:00:00Z",
  applications: [
    {
      app_id: "app-open",
      app_domain: "internal-tool.example.com",
      status: "warning",
      reason: "policy allows Everyone",
    },
    {
      app_id: "app-scoped",
      app_domain: "scoped-tool.example.com",
      status: "safe",
      reason: "policy scoped to group finance",
    },
  ],
  service_tokens: [
    {
      token_id: "tok-expired",
      token_name: "old-ci-token",
      expires_at: "2020-01-01T00:00:00Z",
      status: "critical",
      reason: "expired",
    },
    {
      token_id: "tok-soon",
      token_name: "soon-to-expire-token",
      expires_at: "2026-08-14T00:00:00Z",
      status: "warning",
      reason: "expires within 14 days",
    },
    {
      token_id: "tok-healthy",
      token_name: "healthy-token",
      expires_at: "2027-01-01T00:00:00Z",
      status: "safe",
      reason: "expiration healthy",
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/exposure/inventory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run_id: null, evaluated_at: null, workers: [] }),
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
      body: JSON.stringify(MOCK_ZT_INVENTORY),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Zero Trust" }).click();
});

test("US1 — every application and every service token appears, none omitted", async ({ page }) => {
  await expect(page.getByText("internal-tool.example.com")).toBeVisible();
  await expect(page.getByText("scoped-tool.example.com")).toBeVisible();
  await expect(page.getByText("old-ci-token")).toBeVisible();
  await expect(page.getByText("soon-to-expire-token")).toBeVisible();
  await expect(page.getByText("healthy-token")).toBeVisible();
});

test("US2 — the open-policy application renders as warning, the scoped one as safe", async ({ page }) => {
  const openRow = page.locator("tr", { hasText: "internal-tool.example.com" });
  await expect(openRow.getByText("WARNING")).toBeVisible();

  const scopedRow = page.locator("tr", { hasText: "scoped-tool.example.com" });
  await expect(scopedRow.getByText("PROTECTED")).toBeVisible();
});

test("US3 — service token statuses render distinctly: critical, warning, safe", async ({ page }) => {
  const expiredRow = page.locator("tr", { hasText: "old-ci-token" });
  await expect(expiredRow.getByText("CRITICAL")).toBeVisible();

  const soonRow = page.locator("tr", { hasText: "soon-to-expire-token" });
  await expect(soonRow.getByText("WARNING")).toBeVisible();

  const healthyRow = page.locator("tr", { hasText: "healthy-token" });
  await expect(healthyRow.getByText("PROTECTED")).toBeVisible();
});

// Regression coverage for specs/003-zero-trust/tasks.md T025/T026 — the
// empty-state message must be driven by `run_id`, not by array emptiness,
// so "never evaluated" and "evaluated, found nothing" read differently.
test("T026 — a completed run with zero apps and zero tokens shows a distinct message from 'never evaluated'", async ({ page }) => {
  await page.route("**/api/zero-trust/inventory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run_id: "run-empty",
        evaluated_at: "2026-08-12T00:00:00Z",
        applications: [],
        service_tokens: [],
      }),
    }));
  await page.reload();
  await page.getByRole("button", { name: "Zero Trust" }).click();

  await expect(page.getByText("no Access applications or service tokens found")).toBeVisible();
  await expect(page.getByText("No evaluation runs yet.")).not.toBeVisible();
});

test("T026 — a run_id of null renders the 'never evaluated' message, not the empty-account message", async ({ page }) => {
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
  await page.reload();
  await page.getByRole("button", { name: "Zero Trust" }).click();

  await expect(page.getByText("No evaluation runs yet.")).toBeVisible();
});
