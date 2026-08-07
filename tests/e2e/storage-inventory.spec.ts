import { expect, test } from "@playwright/test";

const MOCK_STORAGE_INVENTORY = {
  run_id: "run-1",
  evaluated_at: "2026-08-08T12:00:00Z",
  buckets: [
    {
      bucket_name: "public-uploads",
      status: "critical",
      reason: "r2.dev managed public URL is enabled",
    },
    {
      bucket_name: "private-backups",
      status: "safe",
      reason: "no r2.dev domain and no enabled custom domains",
    },
  ],
  kv_namespaces: [
    {
      namespace_id: "kv-1",
      title: "SESSIONS",
      status: "safe",
      reason: "usage evaluation not yet implemented",
    },
  ],
  d1_databases: [
    {
      database_uuid: "db-1",
      name: "flaretower",
      status: "safe",
      reason: "usage evaluation not yet implemented",
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
      body: JSON.stringify(MOCK_STORAGE_INVENTORY),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "R2 / KV / D1" }).click();
});

test("US1 — every bucket, namespace, and database appears, none omitted", async ({ page }) => {
  await expect(page.locator("tr", { hasText: "public-uploads" })).toBeVisible();
  await expect(page.locator("tr", { hasText: "SESSIONS" })).toBeVisible();
  await expect(page.locator("tr", { hasText: "flaretower" })).toBeVisible();
});

test("US2 — an r2.dev-exposed bucket renders critical, a private bucket renders safe", async ({ page }) => {
  const exposedRow = page.locator("tr", { hasText: "public-uploads" });
  await expect(exposedRow.getByText("CRITICAL")).toBeVisible();

  const privateRow = page.locator("tr", { hasText: "private-backups" });
  await expect(privateRow.getByText("PROTECTED")).toBeVisible();
});
