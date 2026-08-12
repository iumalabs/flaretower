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
      namespace_id: "kv-used",
      title: "USED_SESSIONS",
      status: "safe",
      reason: "referenced by at least one deployed Worker's bindings",
    },
    {
      namespace_id: "kv-unused",
      title: "UNUSED_SESSIONS",
      status: "warning",
      reason: "not referenced by any deployed Worker's bindings",
    },
  ],
  d1_databases: [
    {
      database_uuid: "db-1",
      name: "flaretower",
      status: "safe",
      reason: "referenced by at least one deployed Worker's bindings",
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
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ modules: [], unavailable_sources: [] }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "R2 / KV / D1" }).click();
});

test("US1 — every bucket, namespace, and database appears, none omitted", async ({ page }) => {
  await expect(page.getByTestId("findings-row-public-uploads")).toBeVisible();
  await expect(page.getByTestId("findings-row-kv-used")).toBeVisible();
  await expect(page.getByTestId("findings-row-kv-unused")).toBeVisible();
  await expect(page.getByTestId("findings-row-db-1")).toBeVisible();
});

test("US2 — an r2.dev-exposed bucket renders critical, a private bucket renders safe", async ({ page }) => {
  const exposedRow = page.getByTestId("findings-row-public-uploads");
  await expect(exposedRow.getByText("CRITICAL")).toBeVisible();

  const privateRow = page.getByTestId("findings-row-private-backups");
  await expect(privateRow.getByText("PROTECTED")).toBeVisible();
});

test("US3 — a namespace referenced by a Worker renders safe, an unreferenced one renders warning", async ({ page }) => {
  const usedRow = page.getByTestId("findings-row-kv-used");
  await expect(usedRow.getByText("PROTECTED")).toBeVisible();

  const unusedRow = page.getByTestId("findings-row-kv-unused");
  await expect(unusedRow.getByText("WARNING")).toBeVisible();
});
