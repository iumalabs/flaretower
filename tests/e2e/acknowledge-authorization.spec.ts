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
  await page.route("**/api/audit/alerts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ alerts: [MOCK_ALERT] }),
    }));
  await page.route("**/api/audit/changes", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        since: "2026-08-10T06:00:00Z",
        until: "2026-08-11T06:00:00Z",
        changes: [],
      }),
    }));
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ modules: [] }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Audit & Drift" }).click();
});

test("a member operator's acknowledge attempt is rejected and the alert stays outstanding", async ({ page }) => {
  await page.route(
    "**/api/audit/alerts/security/ssl_tls/a1/acknowledge",
    (route) => route.fulfill({ status: 403, contentType: "text/plain", body: "Forbidden" }),
  );

  const row = page.locator("tr", { hasText: "flaretower-ack-test.example" });
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

  const row = page.locator("tr", { hasText: "flaretower-ack-test.example" });
  await row.getByRole("button", { name: "Acknowledge" }).click();

  await expect(page.locator("tr", { hasText: "flaretower-ack-test.example" })).not.toBeVisible();
});
