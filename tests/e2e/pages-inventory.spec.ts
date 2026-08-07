import { expect, test } from "@playwright/test";

const MOCK_PAGES_INVENTORY = {
  run_id: "run-1",
  evaluated_at: "2026-08-08T12:00:00Z",
  projects: [
    {
      project_name: "marketing-site",
      subdomain: {
        subdomain: "marketing-site.pages.dev",
        status: "safe",
        reason: "covered by Access application(s): app-1",
      },
      deployment: {
        deployment_id: null,
        status: "not_evaluated",
        reason: "deployment health evaluation not yet implemented",
      },
      domains: [
        { domain_name: "example.com", status: "safe", reason: "domain is active" },
        {
          domain_name: "staging.example.com",
          status: "warning",
          reason: "domain is not active (status: pending)",
        },
      ],
    },
    {
      project_name: "empty-project",
      subdomain: {
        subdomain: "empty-project.pages.dev",
        status: "critical",
        reason: "no Access application covers this hostname",
      },
      deployment: {
        deployment_id: null,
        status: "not_evaluated",
        reason: "deployment health evaluation not yet implemented",
      },
      domains: [],
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
      body: JSON.stringify(MOCK_PAGES_INVENTORY),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Pages" }).click();
});

test("US1 — every project and every one of its custom domains appears, none omitted", async ({ page }) => {
  await expect(page.getByText("marketing-site", { exact: true })).toBeVisible();
  await expect(page.getByText("empty-project", { exact: true })).toBeVisible();
  await expect(page.getByText("example.com", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("staging.example.com", { exact: false }).first()).toBeVisible();
});

test("US1 — an active domain renders safe, a non-active one renders warning", async ({ page }) => {
  const activeRow = page.locator("tr", { hasText: "example.com" }).filter({
    hasNotText: "staging",
  });
  await expect(activeRow.getByText("PROTECTED")).toBeVisible();

  const pendingRow = page.locator("tr", { hasText: "staging.example.com" });
  await expect(pendingRow.getByText("WARNING")).toBeVisible();
});

test("US2 — a covered pages.dev subdomain renders safe, an uncovered one renders critical", async ({ page }) => {
  const coveredRow = page.locator("tr", { hasText: "marketing-site.pages.dev" });
  await expect(coveredRow.getByText("PROTECTED")).toBeVisible();

  const uncoveredRow = page.locator("tr", { hasText: "empty-project.pages.dev" });
  await expect(uncoveredRow.getByText("CRITICAL")).toBeVisible();
});
