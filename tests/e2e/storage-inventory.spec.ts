import { expect, test } from "./fixtures.ts";

const MOCK_STORAGE_INVENTORY = {
  run_id: "run-1",
  evaluated_at: "2026-08-08T12:00:00Z",
  total_resources: 9,
  total_exposed: 2,
  critical_finding: {
    title: "An R2 bucket is publicly exposed",
    target: "public-uploads",
    reason: "r2.dev managed public URL is enabled",
  },
  buckets_pagination: { page: 1, page_size: 50, total: 5, total_pages: 1 },
  kv_namespaces_pagination: { page: 1, page_size: 50, total: 2, total_pages: 1 },
  d1_databases_pagination: { page: 1, page_size: 50, total: 2, total_pages: 1 },
  buckets: [
    {
      bucket_name: "public-uploads",
      status: "critical",
      reason: "r2.dev managed public URL is enabled",
      custom_domain: "cdn.example.com",
      bound_to: "img-resize",
    },
    {
      bucket_name: "private-backups",
      status: "safe",
      reason: "no r2.dev domain and no enabled custom domains",
      custom_domain: null,
      bound_to: "none",
    },
    {
      bucket_name: "loosely-covered-assets",
      status: "warning",
      reason:
        "enabled custom domain(s) covered by an Access application that does not meaningfully restrict access: assets.example.com",
      custom_domain: "assets.example.com",
      bound_to: "3 workers",
    },
    {
      bucket_name: "uncovered-domain-assets",
      status: "critical",
      reason: "enabled custom domain(s) not covered by any Access application: exports.example.com",
      custom_domain: "exports.example.com",
      bound_to: "none",
    },
    {
      bucket_name: "scoped-domain-assets",
      status: "safe",
      reason: "every enabled custom domain is covered by a meaningfully scoped Access policy",
      custom_domain: "reports.example.com",
      bound_to: "none",
    },
  ],
  kv_namespaces: [
    {
      namespace_id: "kv-used",
      title: "USED_SESSIONS",
      status: "safe",
      reason: "referenced by at least one deployed Worker's bindings",
      bound_to: "auth-broker",
    },
    {
      namespace_id: "kv-unused",
      title: "UNUSED_SESSIONS",
      status: "warning",
      reason: "not referenced by any deployed Worker's bindings",
      bound_to: "none",
    },
  ],
  d1_databases: [
    {
      database_uuid: "db-1",
      name: "flaretower",
      status: "safe",
      reason: "referenced by at least one deployed Worker's bindings",
      bound_to: "billing-api",
      num_tables: 18,
      file_size: 880640,
    },
    {
      database_uuid: "db-2",
      name: "search-shadow",
      status: "safe",
      reason: "referenced by at least one deployed Worker's bindings",
      bound_to: "billing-api",
      num_tables: null,
      file_size: null,
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
  await page.route("**/api/storage/inventory*", (route) =>
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
  await expect(page.getByTestId("findings-row-private-backups")).toBeVisible();
  await expect(page.getByTestId("findings-row-loosely-covered-assets")).toBeVisible();

  await page.getByRole("tab", { name: "KV namespaces" }).click();
  await expect(page.getByTestId("findings-row-kv-used")).toBeVisible();
  await expect(page.getByTestId("findings-row-kv-unused")).toBeVisible();

  await page.getByRole("tab", { name: "D1 databases" }).click();
  await expect(page.getByTestId("findings-row-db-1")).toBeVisible();
});

test("US2 — an r2.dev-exposed bucket renders critical, a private bucket renders safe", async ({ page }) => {
  // issue #436 — buckets use the EXPOSURE vocabulary (PUBLIC READ/PRIVATE/
  // WEAK POLICY), not the generic CRITICAL/WARNING/PROTECTED badge text.
  const exposedRow = page.getByTestId("findings-row-public-uploads");
  await expect(exposedRow.getByText("PUBLIC READ")).toBeVisible();

  const privateRow = page.getByTestId("findings-row-private-backups");
  await expect(privateRow.getByText("PRIVATE", { exact: true })).toBeVisible();
});

test("US2/T012 — a bucket with a custom domain covered by an open Access policy renders warning, distinct from critical/safe", async ({ page }) => {
  const exposedRow = page.getByTestId("findings-row-public-uploads");
  await expect(exposedRow.getByText("PUBLIC READ")).toBeVisible();

  const privateRow = page.getByTestId("findings-row-private-backups");
  await expect(privateRow.getByText("PRIVATE", { exact: true })).toBeVisible();

  const looselyCoveredRow = page.getByTestId("findings-row-loosely-covered-assets");
  await expect(looselyCoveredRow.getByText("WEAK POLICY")).toBeVisible();
});

test("US2/AC2 — an enabled custom domain not covered by any Access application renders critical", async ({ page }) => {
  const row = page.getByTestId("findings-row-uncovered-domain-assets");
  await expect(row.getByText("PUBLIC READ")).toBeVisible();
  await expect(row.getByText("not covered by any Access application")).toBeVisible();
});

test("US2/AC4 — an enabled custom domain covered by a meaningfully scoped Access policy renders safe", async ({ page }) => {
  const row = page.getByTestId("findings-row-scoped-domain-assets");
  await expect(row.getByText("PRIVATE", { exact: true })).toBeVisible();
});

test("US3 — a namespace referenced by a Worker renders safe, an unreferenced one renders warning", async ({ page }) => {
  // issue #436 — KV/D1 use the EXPOSURE vocabulary (INTERNAL/ORPHANED), a
  // binding-usage axis distinct from buckets' public-reachability axis.
  await page.getByRole("tab", { name: "KV namespaces" }).click();
  const usedRow = page.getByTestId("findings-row-kv-used");
  await expect(usedRow.getByText("INTERNAL")).toBeVisible();

  const unusedRow = page.getByTestId("findings-row-kv-unused");
  await expect(unusedRow.getByText("ORPHANED")).toBeVisible();
});

test("specs/016 US1 — Bound to shows the Worker name, a count, or an explicit none state, across all 3 tables", async ({ page }) => {
  const singleWorker = page.getByTestId("findings-row-public-uploads");
  await expect(singleWorker.getByText("img-resize", { exact: true })).toBeVisible();

  const multiWorker = page.getByTestId("findings-row-loosely-covered-assets");
  await expect(multiWorker.getByText("3 workers", { exact: true })).toBeVisible();

  const noWorker = page.getByTestId("findings-row-private-backups");
  await expect(noWorker.getByText("none", { exact: true }).first()).toBeVisible();

  await page.getByRole("tab", { name: "KV namespaces" }).click();
  const kvRow = page.getByTestId("findings-row-kv-used");
  await expect(kvRow.getByText("auth-broker", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "D1 databases" }).click();
  const d1Row = page.getByTestId("findings-row-db-1");
  await expect(d1Row.getByText("billing-api", { exact: true })).toBeVisible();
});

test("specs/016 US2 — Custom domain shows the real domain or an explicit none state", async ({ page }) => {
  const withDomain = page.getByTestId("findings-row-public-uploads");
  await expect(withDomain.getByText("cdn.example.com", { exact: true })).toBeVisible();

  const withoutDomain = page.getByTestId("findings-row-private-backups");
  await expect(withoutDomain.getByText("none", { exact: true }).first()).toBeVisible();
});

test("specs/016 US3 — Tables/Size show real values, and an explicit not-available state when the detail fetch failed", async ({ page }) => {
  await page.getByRole("tab", { name: "D1 databases" }).click();
  const withDetail = page.getByTestId("findings-row-db-1");
  await expect(withDetail.getByText("18", { exact: true })).toBeVisible();
  await expect(withDetail.getByText("860.0 KB", { exact: true })).toBeVisible();

  const withoutDetail = page.getByTestId("findings-row-db-2");
  await expect(withoutDetail.getByText("not available").first()).toBeVisible();
});

test("specs/020 US2 — each of the 3 tables paginates independently", async ({ page }) => {
  await page.unroute("**/api/storage/inventory*");
  await page.route("**/api/storage/inventory*", (route) => {
    const url = new URL(route.request().url());
    const bucketPage = Number(url.searchParams.get("bucket_page") ?? "1");
    // Only buckets is split across pages here — kv/d1 stay single-page, to
    // prove each collection's pagination is independent of the others.
    const bucketPageSize = 2;
    const start = (bucketPage - 1) * bucketPageSize;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_STORAGE_INVENTORY,
        buckets: MOCK_STORAGE_INVENTORY.buckets.slice(start, start + bucketPageSize),
        buckets_pagination: {
          page: bucketPage,
          page_size: bucketPageSize,
          total: MOCK_STORAGE_INVENTORY.buckets.length,
          total_pages: Math.ceil(MOCK_STORAGE_INVENTORY.buckets.length / bucketPageSize),
        },
      }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "R2 / KV / D1" }).click();

  await expect(page.getByTestId("findings-row-public-uploads")).toBeVisible();
  await expect(page.getByTestId("findings-row-loosely-covered-assets")).not.toBeVisible();

  // Both kv rows still visible on their own single, unpaginated page — on
  // its own tab, since only one tab's content is ever rendered at once.
  await page.getByRole("tab", { name: "KV namespaces" }).click();
  await expect(page.getByTestId("findings-row-kv-used")).toBeVisible();
  await expect(page.getByTestId("findings-row-kv-unused")).toBeVisible();
  await page.getByRole("tab", { name: "R2 buckets" }).click();

  // Only the buckets table is paginated here (kv/d1 fit on one page each),
  // so pagination-status matches exactly one element.
  await expect(page.getByTestId("pagination-status")).toHaveText("5 total · page 1 of 3");

  await page.getByTestId("pagination-next").click();
  await expect(page.getByTestId("findings-row-loosely-covered-assets")).toBeVisible();
  await expect(page.getByTestId("findings-row-public-uploads")).not.toBeVisible();
});

// specs/021-dashboard-panel-tabs
test("specs/021 US1 — three tabs replace the stacked blocks; only the active tab's table renders", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "R2 buckets" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "KV namespaces" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "D1 databases" })).toBeVisible();

  // R2 buckets is the default/first tab.
  await expect(page.getByTestId("findings-row-public-uploads")).toBeVisible();
  await expect(page.getByTestId("findings-row-kv-used")).not.toBeVisible();
  await expect(page.getByTestId("findings-row-db-1")).not.toBeVisible();

  await page.getByRole("tab", { name: "KV namespaces" }).click();
  await expect(page.getByTestId("findings-row-kv-used")).toBeVisible();
  await expect(page.getByTestId("findings-row-public-uploads")).not.toBeVisible();

  await page.getByRole("tab", { name: "D1 databases" }).click();
  await expect(page.getByTestId("findings-row-db-1")).toBeVisible();
  await expect(page.getByTestId("findings-row-kv-used")).not.toBeVisible();
});

test("specs/021 US2 — switching tabs and back preserves a table's page and sort", async ({ page }) => {
  await page.unroute("**/api/storage/inventory*");
  await page.route("**/api/storage/inventory*", (route) => {
    const url = new URL(route.request().url());
    const bucketPage = Number(url.searchParams.get("bucket_page") ?? "1");
    const bucketSortDir = url.searchParams.get("bucket_sort_dir") ?? "asc";
    const bucketPageSize = 2;
    const sorted = [...MOCK_STORAGE_INVENTORY.buckets].sort((a, b) =>
      bucketSortDir === "desc"
        ? b.bucket_name.localeCompare(a.bucket_name)
        : a.bucket_name.localeCompare(b.bucket_name)
    );
    const start = (bucketPage - 1) * bucketPageSize;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_STORAGE_INVENTORY,
        buckets: sorted.slice(start, start + bucketPageSize),
        buckets_pagination: {
          page: bucketPage,
          page_size: bucketPageSize,
          total: MOCK_STORAGE_INVENTORY.buckets.length,
          total_pages: Math.ceil(MOCK_STORAGE_INVENTORY.buckets.length / bucketPageSize),
        },
      }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "R2 / KV / D1" }).click();

  await page.getByTestId("pagination-next").click();
  await expect(page.getByTestId("pagination-status")).toHaveText("5 total · page 2 of 3");

  await page.getByRole("tab", { name: "KV namespaces" }).click();
  await page.getByRole("tab", { name: "R2 buckets" }).click();

  await expect(page.getByTestId("pagination-status")).toHaveText("5 total · page 2 of 3");
});

test("US1 — re-scan refreshes the page's findings without a reload (FR-001..FR-003)", async ({ page }) => {
  await expect(page.getByText("run run-1")).toBeVisible();

  await page.route("**/api/storage/evaluate", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ run_id: "run-2" }),
    });
  });
  await page.route("**/api/storage/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_STORAGE_INVENTORY,
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

// issue #450 — the page-header toolbar's primary action is brand-orange
// filled, not the generic gray/transparent ghost-button style.
test("issue #450 — the Re-scan button is filled brand-orange, not gray/transparent", async ({ page }) => {
  const background = await page.getByRole("button", { name: "Re-scan" }).evaluate((el) =>
    getComputedStyle(el).backgroundColor
  );
  expect(background).toBe("rgb(246, 130, 31)");
});

test("re-scan failure leaves existing data untouched and shows an inline error (FR-005)", async ({ page }) => {
  await page.route(
    "**/api/storage/evaluate",
    (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({}) }),
  );

  await page.getByRole("button", { name: "Re-scan" }).click();

  await expect(page.getByText("Re-scan failed:", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-scan" })).toBeEnabled();
  await expect(page.getByTestId("findings-row-public-uploads")).toBeVisible();
  await expect(page.getByText("run run-1")).toBeVisible();
});
