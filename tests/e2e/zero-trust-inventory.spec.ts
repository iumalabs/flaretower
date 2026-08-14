import { expect, test } from "@playwright/test";

const MOCK_ZT_INVENTORY = {
  run_id: "run-1",
  evaluated_at: "2026-08-07T12:00:00Z",
  critical_finding: {
    kind: "service_token",
    title: "A service token needs attention",
    target: "old-ci-token",
    description: "expired",
  },
  applications_pagination: { page: 1, page_size: 50, total: 4, total_pages: 1 },
  service_tokens_pagination: { page: 1, page_size: 50, total: 3, total_pages: 1 },
  applications: [
    {
      app_id: "app-open",
      app_name: "status-public",
      app_domain: "internal-tool.example.com",
      status: "warning",
      reason: "policy allows Everyone",
      policy_count: 1,
      covered_hostname_count: 1,
      identity_summary: "— none —",
      session_duration: null,
      policy_rules: [[{ verb: "ALLOW", label: "everyone" }]],
    },
    {
      app_id: "app-scoped",
      app_name: "gateway-admin",
      app_domain: "scoped-tool.example.com",
      status: "safe",
      reason: "policy scoped to group finance",
      policy_count: 2,
      covered_hostname_count: 2,
      identity_summary: "Okta",
      session_duration: "24h",
      policy_rules: [
        [
          { verb: "ALLOW", label: "emails ending in @acme.dev" },
          { verb: "REQUIRE", label: "identity provider · Okta" },
        ],
        [
          { verb: "ALLOW", label: "an unrecognized rule (custom_future_rule)" },
        ],
      ],
    },
    {
      app_id: "app-bypass",
      app_name: "legacy-bypass",
      app_domain: "bypass-tool.example.com",
      status: "warning",
      reason: "a policy allows Everyone or bypasses identity verification",
      policy_count: 1,
      covered_hostname_count: 1,
      identity_summary: "— none —",
      session_duration: null,
      policy_rules: [[{ verb: "ALLOW", label: "bypass (skips identity verification)" }]],
    },
    {
      app_id: "app-no-policies",
      app_name: "unconfigured-tool",
      app_domain: "unconfigured-tool.example.com",
      status: "warning",
      reason: "no policies attached",
      policy_count: 0,
      covered_hostname_count: 1,
      identity_summary: "— none —",
      session_duration: null,
      policy_rules: [],
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
  access_groups: [
    {
      group_id: "grp-platform",
      name: "platform",
      rule_summary: "Okta group",
      referenced_by_app_count: 4,
    },
    {
      group_id: "grp-unused",
      name: "unused-group",
      rule_summary: "everyone",
      referenced_by_app_count: 0,
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
  await page.route("**/api/zero-trust/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_ZT_INVENTORY),
    }));
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ modules: [], unavailable_sources: [] }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Zero Trust" }).click();
});

test("US1 — every application and every service token appears, none omitted", async ({ page }) => {
  await expect(page.getByText("internal-tool.example.com")).toBeVisible();
  await expect(page.getByText("scoped-tool.example.com")).toBeVisible();
  // old-ci-token is critical and legitimately appears twice — once in its
  // row, once in the module-scope alert banner above the table (FR-013).
  await expect(page.getByText("old-ci-token").first()).toBeVisible();
  await expect(page.getByText("soon-to-expire-token")).toBeVisible();
  await expect(page.getByText("healthy-token")).toBeVisible();
});

test("US2 — the open-policy application renders as warning, the scoped one as safe", async ({ page }) => {
  const openRow = page.getByTestId("findings-row-app-open");
  await expect(openRow.getByText("WARNING")).toBeVisible();

  const scopedRow = page.getByTestId("findings-row-app-scoped");
  await expect(scopedRow.getByText("PROTECTED")).toBeVisible();
});

test("US2/AC3 — a Bypass-policy application is flagged as open, the same as an Allow-Everyone one", async ({ page }) => {
  const bypassRow = page.getByTestId("findings-row-app-bypass");
  await expect(bypassRow.getByText("WARNING")).toBeVisible();
  await expect(bypassRow.getByText("bypasses identity verification")).toBeVisible();
});

test("US2/AC4 — an application with zero policies attached is flagged, not silently treated as safe", async ({ page }) => {
  const noPoliciesRow = page.getByTestId("findings-row-app-no-policies");
  await expect(noPoliciesRow.getByText("WARNING")).toBeVisible();
  await expect(noPoliciesRow.getByText("no policies attached")).toBeVisible();
});

test("US3 — service token statuses render distinctly: critical, warning, safe", async ({ page }) => {
  const expiredRow = page.getByTestId("findings-row-tok-expired");
  await expect(expiredRow.getByText("CRITICAL")).toBeVisible();

  const soonRow = page.getByTestId("findings-row-tok-soon");
  await expect(soonRow.getByText("WARNING")).toBeVisible();

  const healthyRow = page.getByTestId("findings-row-tok-healthy");
  await expect(healthyRow.getByText("PROTECTED")).toBeVisible();
});

test("specs/014 US1 — the applications table shows real name, covers, policies, identity, and session data", async ({ page }) => {
  const row = page.getByTestId("findings-row-app-scoped");
  await expect(row.getByText("gateway-admin")).toBeVisible();
  await expect(row.getByText("scoped-tool.example.com")).toBeVisible();
  await expect(row.getByText("+1")).toBeVisible();
  await expect(row.getByText("2", { exact: true })).toBeVisible();
  await expect(row.getByText("Okta")).toBeVisible();
  await expect(row.getByText("24h")).toBeVisible();

  const openRow = page.getByTestId("findings-row-app-open");
  await expect(openRow.getByText("— none —")).toBeVisible();
  await expect(openRow.getByText("not set")).toBeVisible();
});

test("specs/014 US2 — selecting an application shows its policy rules in plain language, including an unrecognized-rule fallback", async ({ page }) => {
  // status-public (app-open) is selected by default (first application).
  await expect(page.getByText("Policy detail — status-public")).toBeVisible();
  await expect(page.getByText("everyone", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "gateway-admin" }).click();
  await expect(page.getByText("Policy detail — gateway-admin")).toBeVisible();
  await expect(page.getByText("emails ending in @acme.dev")).toBeVisible();
  await expect(page.getByText("identity provider · Okta")).toBeVisible();
  await expect(page.getByText("an unrecognized rule (custom_future_rule)")).toBeVisible();
});

test("specs/014 US3 — the Groups panel shows real reference counts, including a group referenced by zero applications", async ({ page }) => {
  const platform = page.getByTestId("access-group-grp-platform");
  await expect(platform.getByText("4 apps")).toBeVisible();
  await expect(platform.getByText("Okta group")).toBeVisible();

  const unused = page.getByTestId("access-group-grp-unused");
  await expect(unused.getByText("0 apps")).toBeVisible();
});

test("specs/014 US3 — a Groups-fetch failure shows an explicit 'not available' state without blocking the table", async ({ page }) => {
  await page.unroute("**/api/zero-trust/inventory*");
  await page.route("**/api/zero-trust/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...MOCK_ZT_INVENTORY, access_groups: null }),
    }));
  await page.reload();
  await page.getByRole("button", { name: "Zero Trust" }).click();

  await expect(page.getByText("not available")).toBeVisible();
  // The applications table is unaffected by the Groups failure.
  await expect(page.getByTestId("findings-row-app-scoped")).toBeVisible();
});

// Regression coverage for specs/003-zero-trust/tasks.md T025/T026 — the
// empty-state message must be driven by `run_id`, not by array emptiness,
// so "never evaluated" and "evaluated, found nothing" read differently.
test("T026 — a completed run with zero apps and zero tokens shows a distinct message from 'never evaluated'", async ({ page }) => {
  await page.route("**/api/zero-trust/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run_id: "run-empty",
        evaluated_at: "2026-08-12T00:00:00Z",
        critical_finding: null,
        applications_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        service_tokens_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        applications: [],
        service_tokens: [],
        access_groups: [],
      }),
    }));
  await page.reload();
  await page.getByRole("button", { name: "Zero Trust" }).click();

  await expect(page.getByText("No Access applications", { exact: true })).toBeVisible();
  await expect(page.getByText("No service tokens", { exact: true })).toBeVisible();
  await expect(page.getByText("No evaluation runs yet.")).not.toBeVisible();
});

test("T026 — a run_id of null renders the 'never evaluated' message, not the empty-account message", async ({ page }) => {
  await page.route("**/api/zero-trust/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run_id: null,
        evaluated_at: null,
        critical_finding: null,
        applications_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        service_tokens_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        applications: [],
        service_tokens: [],
        access_groups: [],
      }),
    }));
  await page.reload();
  await page.getByRole("button", { name: "Zero Trust" }).click();

  await expect(page.getByText("No evaluation runs yet.")).toBeVisible();
});

test("specs/020 US2 — Access applications paginate independently of Service tokens", async ({ page }) => {
  const apps = MOCK_ZT_INVENTORY.applications;
  await page.route("**/api/zero-trust/inventory*", (route) => {
    const url = new URL(route.request().url());
    const appPage = Number(url.searchParams.get("app_page") ?? "1");
    const appPageSize = 2;
    const start = (appPage - 1) * appPageSize;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_ZT_INVENTORY,
        applications: apps.slice(start, start + appPageSize),
        applications_pagination: {
          page: appPage,
          page_size: appPageSize,
          total: apps.length,
          total_pages: Math.ceil(apps.length / appPageSize),
        },
      }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Zero Trust" }).click();

  await expect(page.getByTestId("findings-row-app-open")).toBeVisible();
  await expect(page.getByTestId("findings-row-app-bypass")).not.toBeVisible();
  // Service tokens (3, fits one page) show no pager of their own.
  await expect(page.getByTestId("findings-row-tok-expired")).toBeVisible();
  await expect(page.getByTestId("findings-row-tok-healthy")).toBeVisible();

  await expect(page.getByTestId("pagination-status")).toHaveText("4 total · page 1 of 2");
  await page.getByTestId("pagination-next").click();
  await expect(page.getByTestId("findings-row-app-bypass")).toBeVisible();
});
