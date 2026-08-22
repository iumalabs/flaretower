import { expect, test } from "@playwright/test";

const MOCK_PAGES_INVENTORY = {
  run_id: "run-1",
  evaluated_at: "2026-08-08T12:00:00Z",
  critical_finding: {
    project_name: "empty-project",
    reason: "no Access application covers this hostname",
  },
  projects_pagination: { page: 1, page_size: 50, total: 2, total_pages: 1 },
  projects: [
    {
      project_name: "marketing-site",
      production_domain: "example.com",
      production_domain_access: {
        status: "safe",
        reason: "covered by Access application(s): access-app",
        covering_app_id: "access-app",
      },
      production_branch: "main",
      last_build_status: "safe",
      last_build_reason: "latest production deployment succeeded",
      last_build_created_at: "2026-08-08T11:00:00Z",
      health_status: "safe",
      health_reason: "covered by Access application(s): app-1",
      subdomain: {
        subdomain: "marketing-site.pages.dev",
        status: "safe",
        reason: "covered by Access application(s): app-1",
      },
      deployment: {
        deployment_id: "dep-1",
        status: "safe",
        reason: "latest production deployment succeeded",
        created_at: "2026-08-08T11:00:00Z",
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
      production_domain: null,
      production_domain_access: null,
      production_branch: null,
      last_build_status: "warning",
      last_build_reason: "no production deployment exists yet",
      last_build_created_at: null,
      health_status: "critical",
      health_reason: "no Access application covers this hostname",
      subdomain: {
        subdomain: "empty-project.pages.dev",
        status: "critical",
        reason: "no Access application covers this hostname",
      },
      deployment: {
        deployment_id: null,
        status: "warning",
        reason: "no production deployment exists yet",
        created_at: null,
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
  await page.route("**/api/pages/inventory*", (route) =>
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

test("US1 — exactly one row per project, not one row per underlying check", async ({ page }) => {
  await expect(page.getByTestId("findings-row-marketing-site")).toBeVisible();
  await expect(page.getByTestId("findings-row-empty-project")).toBeVisible();
  // Only 2 rows total — no separate subdomain/deployment/domain rows leak through.
  await expect(page.locator("[data-testid^='findings-row-']")).toHaveCount(2);
});

test("US1 — production domain shows the real domain or an explicit none state", async ({ page }) => {
  const withDomain = page.getByTestId("findings-row-marketing-site");
  await expect(withDomain.getByText("example.com", { exact: true })).toBeVisible();

  const withoutDomain = page.getByTestId("findings-row-empty-project");
  await expect(withoutDomain.getByText("none", { exact: true })).toBeVisible();
});

test("US1 — branch shows the real branch or an explicit not-set state", async ({ page }) => {
  const withBranch = page.getByTestId("findings-row-marketing-site");
  await expect(withBranch.getByText("main", { exact: true })).toBeVisible();

  const withoutBranch = page.getByTestId("findings-row-empty-project");
  await expect(withoutBranch.getByText("not set", { exact: true })).toBeVisible();
});

test("US1 — last build shows success, failure, and no-deployment-yet as three distinct states", async ({ page }) => {
  const succeeded = page.getByTestId("findings-row-marketing-site");
  await expect(succeeded.getByText("success", { exact: false })).toBeVisible();

  const noDeployment = page.getByTestId("findings-row-empty-project");
  await expect(noDeployment.getByText("no production deployment yet", { exact: false }))
    .toBeVisible();
});

// issue #435 — the Preview column uses the design's short vocabulary
// (OPEN/ACCESS) for the same underlying subdomain-exposure status, not
// the generic CRITICAL/WARNING/PROTECTED badge text.
test("US1 — the Preview pill uses the design's OPEN/ACCESS vocabulary for the existing subdomain-exposure status", async ({ page }) => {
  const safeRow = page.getByTestId("findings-row-marketing-site");
  await expect(safeRow.getByText("ACCESS", { exact: true })).toBeVisible();

  const criticalRow = page.getByTestId("findings-row-empty-project");
  await expect(criticalRow.getByText("OPEN")).toBeVisible();
});

test("issue #435 — a warning-tier subdomain-exposure status also renders OPEN, not a distinct third label", async ({ page }) => {
  await page.route("**/api/pages/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_PAGES_INVENTORY,
        projects: [
          {
            ...MOCK_PAGES_INVENTORY.projects[0],
            health_status: "warning",
            health_reason:
              "covering Access application(s) do not meaningfully restrict access: app-1 has a policy that allows Everyone",
          },
        ],
        projects_pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
      }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Pages" }).click();

  await expect(page.getByTestId("findings-row-marketing-site").getByText("OPEN")).toBeVisible();
});

// issue #457 — the Access column shows the production custom domain's own
// Access coverage (a separate signal from Preview), with the covering
// app's real name when protected, never a fabricated "public by design"
// claim when it isn't.
test("issue #457 — the Access column shows the covering app's name, WEAK POLICY, NO POLICY, or an explicit none state", async ({ page }) => {
  await page.route("**/api/pages/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_PAGES_INVENTORY,
        projects: [
          {
            ...MOCK_PAGES_INVENTORY.projects[0],
            project_name: "protected-site",
            production_domain_access: {
              status: "safe",
              reason: "covered by Access application(s): access-app",
              covering_app_id: "access-app",
            },
          },
          {
            ...MOCK_PAGES_INVENTORY.projects[0],
            project_name: "weak-policy-site",
            production_domain_access: {
              status: "warning",
              reason:
                "covering Access application(s) do not meaningfully restrict access: app-1 has a policy that allows Everyone",
              covering_app_id: null,
            },
          },
          {
            ...MOCK_PAGES_INVENTORY.projects[0],
            project_name: "no-policy-site",
            production_domain_access: {
              status: "not_evaluated",
              reason: "no Access application covers this domain",
              covering_app_id: null,
            },
          },
          { ...MOCK_PAGES_INVENTORY.projects[1] },
        ],
        projects_pagination: { page: 1, page_size: 50, total: 4, total_pages: 1 },
      }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Pages" }).click();

  await expect(page.getByTestId("findings-row-protected-site").getByText("access-app"))
    .toBeVisible();
  await expect(page.getByTestId("findings-row-weak-policy-site").getByText("WEAK POLICY"))
    .toBeVisible();
  await expect(page.getByTestId("findings-row-no-policy-site").getByText("NO POLICY"))
    .toBeVisible();
  // empty-project has no production domain at all (production_domain_access: null).
  await expect(page.getByTestId("findings-row-empty-project").getByText("—", { exact: true }))
    .toBeVisible();
});

// Regression coverage: a build timestamp a few seconds ahead of the
// client's clock (clock skew, or a fast render right after a build
// completes) must render as "0s ago," never as a negative duration.
test("last build recency clamps a future timestamp to '0s ago', never negative", async ({ page }) => {
  const skewedInventory = {
    ...MOCK_PAGES_INVENTORY,
    projects: [
      {
        ...MOCK_PAGES_INVENTORY.projects[0],
        last_build_created_at: new Date(Date.now() + 5000).toISOString(),
        deployment: {
          ...MOCK_PAGES_INVENTORY.projects[0].deployment,
          created_at: new Date(Date.now() + 5000).toISOString(),
        },
      },
      MOCK_PAGES_INVENTORY.projects[1],
    ],
  };
  await page.route("**/api/pages/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(skewedInventory),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Pages" }).click();

  const row = page.getByTestId("findings-row-marketing-site");
  await expect(row.getByText("0s ago", { exact: false })).toBeVisible();
});

test("specs/020 US2 — projects paginate: page footer, next/prev, boundary disabled states", async ({ page }) => {
  const allProjects = Array.from({ length: 5 }, (_, i) => ({
    ...MOCK_PAGES_INVENTORY.projects[0],
    project_name: `project-${i}`,
  }));
  await page.route("**/api/pages/inventory*", (route) => {
    const url = new URL(route.request().url());
    const requestedPage = Number(url.searchParams.get("page") ?? "1");
    const pageSize = 2;
    const start = (requestedPage - 1) * pageSize;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_PAGES_INVENTORY,
        critical_finding: null,
        projects: allProjects.slice(start, start + pageSize),
        projects_pagination: {
          page: requestedPage,
          page_size: pageSize,
          total: allProjects.length,
          total_pages: Math.ceil(allProjects.length / pageSize),
        },
      }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Pages" }).click();

  await expect(page.getByTestId("findings-row-project-0")).toBeVisible();
  await expect(page.getByTestId("findings-row-project-2")).not.toBeVisible();
  await expect(page.getByTestId("pagination-status")).toHaveText("5 total · page 1 of 3");
  await expect(page.getByTestId("pagination-prev")).toBeDisabled();

  await page.getByTestId("pagination-next").click();
  await page.getByTestId("pagination-next").click();
  await expect(page.getByTestId("findings-row-project-4")).toBeVisible();
  await expect(page.getByTestId("pagination-status")).toHaveText("5 total · page 3 of 3");
  await expect(page.getByTestId("pagination-next")).toBeDisabled();
});

test("US1 — re-scan refreshes the page's findings without a reload (FR-001..FR-003)", async ({ page }) => {
  await expect(page.getByText("run run-1")).toBeVisible();

  await page.route("**/api/pages/evaluate", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ run_id: "run-2" }),
    });
  });
  await page.route("**/api/pages/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_PAGES_INVENTORY,
        run_id: "run-2",
        evaluated_at: "2026-08-09T09:00:00Z",
      }),
    }));

  const button = page.getByRole("button", { name: "Re-scan" });
  await button.click();
  await expect(page.getByRole("button", { name: "Scanning…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-scan" })).toBeEnabled();
  await expect(page.getByText("run run-2")).toBeVisible();
});

test("re-scan failure leaves existing data untouched and shows an inline error (FR-005)", async ({ page }) => {
  await page.route(
    "**/api/pages/evaluate",
    (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({}) }),
  );

  await page.getByRole("button", { name: "Re-scan" }).click();

  await expect(page.getByText("Re-scan failed:", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-scan" })).toBeEnabled();
  await expect(page.getByTestId("findings-row-marketing-site")).toBeVisible();
  await expect(page.getByText("run run-1")).toBeVisible();
});
