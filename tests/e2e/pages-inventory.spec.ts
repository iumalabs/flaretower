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
        deployment_id: "dep-1",
        status: "safe",
        reason: "latest production deployment succeeded",
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
        status: "warning",
        reason: "no production deployment exists yet",
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
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ modules: [], unavailable_sources: [] }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Pages" }).click();
});

test("US1 — every project and every one of its custom domains appears, none omitted", async ({ page }) => {
  await expect(page.getByText("marketing-site", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("empty-project", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("example.com", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("staging.example.com", { exact: false }).first()).toBeVisible();
});

test("US1 — an active domain renders safe, a non-active one renders warning", async ({ page }) => {
  const activeRow = page.getByTestId("findings-row-marketing-site:domain:example.com");
  await expect(activeRow.getByText("PROTECTED")).toBeVisible();

  const pendingRow = page.getByTestId("findings-row-marketing-site:domain:staging.example.com");
  await expect(pendingRow.getByText("WARNING")).toBeVisible();
});

test("US2 — a covered pages.dev subdomain renders safe, an uncovered one renders critical", async ({ page }) => {
  const coveredRow = page.getByTestId("findings-row-marketing-site:subdomain");
  await expect(coveredRow.getByText("PROTECTED")).toBeVisible();

  const uncoveredRow = page.getByTestId("findings-row-empty-project:subdomain");
  await expect(uncoveredRow.getByText("CRITICAL")).toBeVisible();
});

test("US3 — a successful production deployment renders safe, a missing one renders warning", async ({ page }) => {
  const successRow = page.getByTestId("findings-row-marketing-site:deployment");
  await expect(successRow.getByText("PROTECTED")).toBeVisible();

  const missingRow = page.getByTestId("findings-row-empty-project:deployment");
  await expect(missingRow.getByText("WARNING")).toBeVisible();
});
