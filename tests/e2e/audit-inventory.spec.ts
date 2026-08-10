import { expect, test } from "@playwright/test";

const MOCK_AUDIT_ALERTS = {
  alerts: [
    {
      id: "a1",
      module: "security",
      kind: "ssl_tls",
      entity_label: "example.com",
      previous_status: "safe",
      new_status: "critical",
      detected_at: "2026-08-10T06:00:00Z",
      acknowledged_at: null,
    },
    {
      id: "a2",
      module: "storage",
      kind: "r2_bucket",
      entity_label: "uploads",
      previous_status: "safe",
      new_status: "warning",
      detected_at: "2026-08-10T05:00:00Z",
      acknowledged_at: null,
    },
  ],
};

const MOCK_AUDIT_CHANGES = {
  since: "2026-08-09T14:00:00Z",
  until: "2026-08-10T14:00:00Z",
  changes: [
    {
      module: "security",
      kind: "dnssec",
      entity_label: "flaretower-changed.test",
      previous_status: "safe",
      current_status: "critical",
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
  await page.route("**/api/audit/alerts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_AUDIT_ALERTS),
    }));
  await page.route("**/api/audit/changes", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_AUDIT_CHANGES),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Audit & Drift" }).click();
});

test("US1 — alerts from multiple modules appear in the unified inbox, each labeled with its source", async ({ page }) => {
  const sslRow = page.locator("tr", { hasText: "example.com" });
  await expect(sslRow).toBeVisible();
  await expect(sslRow.getByText("security/ssl_tls", { exact: false })).toBeVisible();

  const bucketRow = page.locator("tr", { hasText: "uploads" });
  await expect(bucketRow).toBeVisible();
  await expect(bucketRow.getByText("storage/r2_bucket", { exact: false })).toBeVisible();
});

test("US2 — the what changed section shows an entity whose status changed since the cutoff", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "What changed" })).toBeVisible();

  const changeRow = page.locator("tr", { hasText: "flaretower-changed.test" });
  await expect(changeRow).toBeVisible();
  await expect(changeRow.getByText("security/dnssec", { exact: false })).toBeVisible();
  await expect(changeRow.getByText("safe → critical", { exact: false })).toBeVisible();
});
