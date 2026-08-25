import { expect, test } from "./fixtures.ts";

const MOCK_INVENTORY = {
  run_id: "run-1",
  evaluated_at: "2026-08-07T12:00:00Z",
  workers: [
    {
      worker_name: "billing-api",
      hostnames: [
        {
          hostname: "billing.example.com",
          kind: "custom_domain",
          status: "safe",
          reason: "covered by Access application(s): billing-prod",
        },
        {
          hostname: "billing-api.acct.workers.dev",
          kind: "workers_dev",
          status: "critical",
          reason: "no Access application covers this hostname",
        },
      ],
    },
    {
      worker_name: "status-page",
      hostnames: [
        {
          hostname: "status.example.com",
          kind: "custom_domain",
          status: "warning",
          reason: "Access application policy includes Everyone",
        },
      ],
    },
    {
      worker_name: "docs-site",
      hostnames: [
        {
          hostname: "docs.example.com",
          kind: "custom_domain",
          status: "safe",
          reason: "covered by Access application(s): docs-app",
        },
        {
          hostname: "www.example.com",
          kind: "custom_domain",
          status: "safe",
          reason: "covered by Access application(s): docs-app",
        },
      ],
    },
    {
      worker_name: "queue-worker",
      hostnames: [],
    },
  ],
};

function mockWorkerDetail(workerName: string) {
  const worker = MOCK_INVENTORY.workers.find((w) => w.worker_name === workerName);
  const routes = (worker?.hostnames ?? []).map((h) => ({
    hostname: h.hostname,
    kind: h.kind,
    status: h.status,
    reason: h.reason,
    policy: h.status === "critical" ? null : {
      app_id: "app-1",
      app_name: `${workerName}-app`,
      app_domain: h.hostname,
      policy_rules: [[{ verb: "ALLOW", label: "emails ending in @acme.dev" }]],
    },
  }));
  return {
    worker_name: workerName,
    environment: "production",
    routes,
    recent_changes: [],
    cloudflare_url:
      `https://dash.cloudflare.com/acct/workers/services/view/${workerName}/production`,
    unavailable: [],
  };
}

test.beforeEach(async ({ page }) => {
  // The real endpoint is Access-gated; mocking it here tests UI rendering
  // deterministically without requiring a live Zero Trust test account.
  await page.route("**/api/exposure/inventory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_INVENTORY),
    }));
  await page.route("**/api/workers/*/detail", (route) => {
    const workerName = decodeURIComponent(
      route.request().url().split("/api/workers/")[1].split("/")[0],
    );
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockWorkerDetail(workerName)),
    });
  });
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ modules: [], unavailable_sources: [] }),
    }));
  await page.route("**/api/audit/alerts*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        alerts: [],
        unavailable_sources: [],
        pagination: { page: 1, page_size: 5, total: 0, total_pages: 1 },
      }),
    }));
  await page.route("**/api/audit/changes*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        since: "",
        until: "",
        changes: [],
        unavailable_sources: [],
        pagination: { page: 1, page_size: 5, total: 0, total_pages: 1 },
      }),
    }));
  // "overview" is now the default page (tasks.md T033) — navigate into
  // Exposure explicitly, matching every other module's spec convention.
  await page.goto("/");
  await page.getByRole("button", { name: "Exposure" }).click();
});

function row(page: import("@playwright/test").Page, workerName: string) {
  return page.getByTestId(`matrix-row-${workerName}`);
}

// The row's own bounding box grows a lot once expanded (the detail panel is
// part of the same testid'd wrapper) — clicking the row div itself would
// hit the detail panel's content on a second click instead of the toggle
// bar. Click the row's stable role=button summary bar instead.
function toggleHandle(page: import("@playwright/test").Page, workerName: string) {
  return row(page, workerName).getByRole("button");
}

// ---- User Story 1 — matrix structure ----

test("US1 — one row per Worker, not one row per hostname", async ({ page }) => {
  await expect(row(page, "billing-api")).toBeVisible();
  await expect(row(page, "status-page")).toBeVisible();
  await expect(row(page, "docs-site")).toBeVisible();
  await expect(row(page, "queue-worker")).toBeVisible();
  await expect(page.locator("[data-testid^='matrix-row-']")).toHaveCount(4);
});

test("US1 — each entry-point column shows its own independent status in the same row", async ({ page }) => {
  const billing = row(page, "billing-api");
  // Custom domain is safe, workers.dev is critical — both visible together,
  // not merged into one status for the Worker.
  await expect(billing.getByText("PROTECTED")).toBeVisible();
  // CRITICAL legitimately appears twice — once in the workers.dev cell,
  // once in the rightmost overall Status column (the Worker's overall
  // status is the worst among its entry points).
  await expect(billing.getByText("CRITICAL").first()).toBeVisible();
  await expect(billing.getByText("CRITICAL")).toHaveCount(2);
});

test("US1 — an entry-point type a Worker doesn't have shows an explicit not-present state", async ({ page }) => {
  const statusPage = row(page, "status-page");
  await expect(statusPage.getByText("not present")).toHaveCount(2); // workers.dev + preview URL
});

test("US1 — an access-coverage summary is shown per row", async ({ page }) => {
  const billing = row(page, "billing-api");
  await expect(billing.getByText("1 / 2 routes")).toBeVisible();
});

test("US1 — a Worker with two hostnames of the same entry-point kind shows a summarized cell, nothing dropped", async ({ page }) => {
  const docsSite = row(page, "docs-site");
  await expect(docsSite.getByText("2 custom domains")).toBeVisible();
  await toggleHandle(page, "docs-site").click();
  await expect(docsSite.getByText("docs.example.com")).toBeVisible();
  await expect(docsSite.getByText("www.example.com")).toBeVisible();
});

test("US1 — a Worker with zero HTTP routes renders as not-applicable, not omitted or errored", async ({ page }) => {
  const queueWorker = row(page, "queue-worker");
  await expect(queueWorker.getByText("no http routes")).toBeVisible();
  await expect(queueWorker.getByText("not present")).toHaveCount(3);
});

test("US2/AC3 — an alert banner surfaces the most urgent finding above the table", async ({ page }) => {
  await expect(
    page.getByText("A Worker is publicly reachable with no Access policy"),
  ).toBeVisible();
  await expect(page.getByText("billing-api.acct.workers.dev").first()).toBeVisible();
});

// ---- User Story 2 — row-expand detail ----

test("US2 — expanding a row shows its routes and effective policy inline; collapsing hides them", async ({ page }) => {
  const billing = row(page, "billing-api");
  await expect(billing.getByText("billing.example.com")).toHaveCount(0);

  await toggleHandle(page, "billing-api").click();
  await expect(billing.getByText("billing.example.com")).toBeVisible();
  await expect(billing.getByText("billing-api.acct.workers.dev")).toBeVisible();
  await expect(billing.getByText("emails ending in @acme.dev")).toBeVisible();

  await toggleHandle(page, "billing-api").click();
  await expect(billing.getByText("billing.example.com")).toHaveCount(0);
});

// Regression (issue #432): panel headings are body text at weight 600, not
// the small mono/uppercase label style meant for table column headers.
test("US2 — the expanded row's headings use plain Sans text, not mono/uppercase", async ({ page }) => {
  const billing = row(page, "billing-api");
  await toggleHandle(page, "billing-api").click();

  for (const text of ["Routes & effective policy", "Actions"]) {
    const heading = billing.getByText(text, { exact: true });
    const style = await heading.evaluate((el) => ({
      fontFamily: getComputedStyle(el).fontFamily,
      textTransform: getComputedStyle(el).textTransform,
    }));
    expect(style.fontFamily).toContain("IBM Plex Sans");
    expect(style.textTransform).not.toBe("uppercase");
  }
});

test("US2 — collapsing one row and expanding a different one works independently (each shows its own data)", async ({ page }) => {
  const billing = row(page, "billing-api");
  const statusPage = row(page, "status-page");

  await toggleHandle(page, "billing-api").click();
  await expect(billing.getByText("billing.example.com")).toBeVisible();

  await toggleHandle(page, "billing-api").click();
  await expect(billing.getByText("billing.example.com")).toHaveCount(0);

  await toggleHandle(page, "status-page").click();
  await expect(statusPage.getByText("status.example.com")).toBeVisible();
  // Switching to a different row didn't leak billing-api's routes into it.
  await expect(statusPage.getByText("billing.example.com")).toHaveCount(0);
});

test("US2 — a route with no covering Access policy states so explicitly, not blank", async ({ page }) => {
  const billing = row(page, "billing-api");
  await toggleHandle(page, "billing-api").click();
  await expect(billing.getByText("No Access application policy covers this route.")).toBeVisible();
});

test("US2 — action controls reflect the row's actual finding; the only real action is View in Cloudflare", async ({ page }) => {
  await toggleHandle(page, "billing-api").click();
  await expect(page.getByTestId("action-billing-api-Disable workers.dev")).toBeVisible();

  const viewInCloudflare = page.getByTestId("action-billing-api-view-in-cloudflare");
  await expect(viewInCloudflare).toBeVisible();
  await expect(viewInCloudflare).toHaveAttribute(
    "href",
    "https://dash.cloudflare.com/acct/workers/services/view/billing-api/production",
  );

  // Every other action is visual only — a plain div with no href/navigation.
  const disableAction = page.getByTestId("action-billing-api-Disable workers.dev");
  await expect(disableAction).not.toHaveAttribute("href");
});

// ---- User Story 3 — navigation, search, re-scan ----

test("US3 — clicking a severity count scrolls the matching row into view", async ({ page }) => {
  await page.getByTestId("jump-to-row-critical").click();
  await expect(row(page, "billing-api")).toBeInViewport();
});

test("US3 — the search box narrows the table to matching Workers, no reload", async ({ page }) => {
  await page.getByPlaceholder("filter workers…").fill("docs");
  await expect(row(page, "docs-site")).toBeVisible();
  await expect(row(page, "billing-api")).toHaveCount(0);

  await page.getByPlaceholder("filter workers…").fill("");
  await expect(row(page, "billing-api")).toBeVisible();
});

test("US3 — a search with no matches shows an explicit no-matches state", async ({ page }) => {
  await page.getByPlaceholder("filter workers…").fill("nonexistent-worker-xyz");
  await expect(page.getByText("No matches")).toBeVisible();
});

test("US1 — re-scan refreshes the page's findings without a reload (FR-001..FR-003)", async ({ page }) => {
  await expect(page.getByText("run run-1")).toBeVisible();

  await page.route("**/api/exposure/evaluate", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ run_id: "run-2" }),
    });
  });
  await page.route("**/api/exposure/inventory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_INVENTORY,
        run_id: "run-2",
        evaluated_at: "2026-08-08T09:00:00Z",
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
    "**/api/exposure/evaluate",
    (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({}) }),
  );

  await page.getByRole("button", { name: "Re-scan" }).click();

  await expect(page.getByText("Re-scan failed:", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-scan" })).toBeEnabled();
  await expect(row(page, "billing-api")).toBeVisible();
  await expect(page.getByText("run run-1")).toBeVisible();
});
