import { expect, test } from "@playwright/test";

// Acknowledging an alert is the one in-app mutating action in the product
// today, and the unified inbox (Audit & Drift) is the only screen that ever
// renders an alert to acknowledge — every module's own alerts route through
// it (data-model.md), so this is the one place Module 8's role-gating
// (User Story 2) has any UI surface to exercise (research.md §7).
const MOCK_ALERT = {
  id: "a1",
  module: "security",
  kind: "ssl_tls",
  entity_label: "flaretower-ack-test.example",
  previous_status: "safe",
  new_status: "critical",
  detected_at: "2026-08-11T06:00:00Z",
  acknowledged_at: null,
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
  await page.route("**/api/audit/alerts*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      // unavailable_sources is required here — AuditInventory.tsx renders
      // <UnavailableSourcesNotice sources={data.unavailable_sources} />
      // unconditionally (added by the T025 per-source-availability fix,
      // #299), which crashed on this mock predating that field. Pre-
      // existing gap, unrelated to this feature — found and fixed while
      // running the full e2e suite for this PR. critical_alert/pagination
      // are required the same way, added by specs/022-audit-list-pagination.
      body: JSON.stringify({
        alerts: [MOCK_ALERT],
        critical_alert: MOCK_ALERT,
        unavailable_sources: [],
        pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
      }),
    }));
  await page.route("**/api/audit/changes*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        since: "2026-08-10T06:00:00Z",
        until: "2026-08-11T06:00:00Z",
        changes: [],
        unavailable_sources: [],
        pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
      }),
    }));
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ modules: [], unavailable_sources: [] }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Audit & Drift" }).click();
  // specs/021-dashboard-panel-tabs: the unified alerts inbox is no longer
  // the default tab (Audit log is) — every test here needs it active.
  await page.getByRole("tab", { name: "Unified alerts inbox" }).click();
});

test("a member operator's acknowledge attempt is rejected and the alert stays outstanding", async ({ page }) => {
  await page.route(
    "**/api/audit/alerts/security/ssl_tls/a1/acknowledge",
    (route) => route.fulfill({ status: 403, contentType: "text/plain", body: "Forbidden" }),
  );

  const row = page.getByTestId("findings-row-a1");
  await row.getByRole("button", { name: "Acknowledge" }).click();

  await expect(row.getByText("You don't have permission", { exact: false })).toBeVisible();
  await expect(row).toBeVisible();
});

test("an admin operator's acknowledge attempt succeeds and the alert leaves the outstanding list", async ({ page }) => {
  await page.route("**/api/audit/alerts/security/ssl_tls/a1/acknowledge", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "a1", acknowledged_at: "2026-08-11T09:00:00Z" }),
    }));

  const row = page.getByTestId("findings-row-a1");
  await row.getByRole("button", { name: "Acknowledge" }).click();

  await expect(page.getByTestId("findings-row-a1")).not.toBeVisible();
});

test("a member operator promoted to admin has their subsequent acknowledge attempt succeed", async ({ page }) => {
  await page.route("**/api/identity/users/operator-2/role", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sub: "operator-2", role: "admin" }),
    }));
  await page.route("**/api/audit/alerts/security/ssl_tls/a1/acknowledge", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "a1", acknowledged_at: "2026-08-11T09:00:00Z" }),
    }));

  const promotion = await page.evaluate(async () => {
    const res = await fetch("/api/identity/users/operator-2/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    return { status: res.status, body: await res.json() };
  });
  expect(promotion.status).toBe(200);
  expect(promotion.body).toEqual({ sub: "operator-2", role: "admin" });

  const row = page.getByTestId("findings-row-a1");
  await row.getByRole("button", { name: "Acknowledge" }).click();

  await expect(page.getByTestId("findings-row-a1")).not.toBeVisible();
});
