import { expect, test } from "@playwright/test";

// Issue #480 — a full page load on a non-root route (typed URL, bookmark,
// refresh) must render that route's page, not silently fall back to
// Overview with the URL/sidebar left pointing at the wrong thing.

const EMPTY_INVENTORY = { run_id: null, evaluated_at: null, workers: [] };

const EMPTY_WORKERS_DASHBOARD = {
  generated_at: "2026-08-13T12:00:00Z",
  summary: {
    deployed_count: 0,
    deployed_by_environment: { production: 0, preview: 0 },
    requests_24h_total: null,
    requests_24h_change_pct: null,
    error_rate_pct: null,
    errors_24h_total: null,
    cpu_p99_ms: null,
  },
  workers: [],
  workers_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
  recent_changes: [],
  unavailable: [],
};

const EMPTY_DNS_INVENTORY = {
  run_id: null,
  evaluated_at: null,
  total_records: 0,
  total_dangling: 0,
  zone_summaries: [],
  selected_zone: null,
  critical_finding: null,
  records: [],
  records_pagination: { page: 1, page_size: 25, total: 0, total_pages: 1 },
};

test.beforeEach(async ({ page }) => {
  // Baseline every page/App.tsx mount needs regardless of which route is
  // requested — same set app-shell.spec.ts's beforeEach uses.
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ modules: [], unavailable_sources: [] }),
    }));
  await page.route(
    "**/api/exposure/inventory",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(EMPTY_INVENTORY),
      }),
  );
  await page.route(
    "**/api/workers/dashboard*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(EMPTY_WORKERS_DASHBOARD),
      }),
  );
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
  await page.route("**/api/audit/trend*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ points: [] }),
    }));
  await page.route(
    "**/api/dns/inventory*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(EMPTY_DNS_INVENTORY),
      }),
  );
});

// Prod (Cloudflare Workers Assets, `not_found_handling: "single-page-
// application"` in wrangler.jsonc) already serves the app shell's
// index.html for any unmapped path — that part is confirmed working (issue
// #480's own repro: "URL bar and browser history keep the requested path").
// The local `vite dev` server this suite runs against has no equivalent —
// it 404s a bare GET for e.g. /workers instead of falling back to
// index.html — so these tests stand in for Cloudflare's asset-serving layer
// by fulfilling the navigation request with the real dev shell HTML
// (fetched from "/", which `vite dev` does serve). What's under test is
// purely the client-side routing this issue is actually about: given the
// shell has loaded at a non-root path, does App.tsx render the right page.
async function mockDeepLinkShell(page: import("@playwright/test").Page, path: string) {
  const shell = await (await page.request.get("/")).text();
  await page.route(
    `**${path}`,
    (route) => route.fulfill({ status: 200, contentType: "text/html", body: shell }),
  );
}

test("issue #480 — a direct load of /workers renders Workers, not Overview", async ({ page }) => {
  await mockDeepLinkShell(page, "/workers");
  await page.goto("/workers");

  await expect(page.getByRole("heading", { name: "Workers", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Workers" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("button", { name: "Overview" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page).toHaveURL(/\/workers$/);
});

test("issue #480 — a direct load of /token-tools renders Token Tools, not Overview", async ({ page }) => {
  await mockDeepLinkShell(page, "/token-tools");
  await page.goto("/token-tools");

  await expect(page.getByRole("heading", { name: "Token Tools", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Token Tools" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("issue #480 — a direct load of /dns renders DNS records, not Overview", async ({ page }) => {
  await mockDeepLinkShell(page, "/dns");
  await page.goto("/dns");

  await expect(page.getByRole("heading", { name: "DNS records", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "DNS" })).toHaveAttribute("aria-current", "page");
});

test("an unrecognized path falls back to Overview instead of a blank page", async ({ page }) => {
  await mockDeepLinkShell(page, "/this-route-does-not-exist");
  await page.goto("/this-route-does-not-exist");

  await expect(page.getByRole("button", { name: "Overview" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("clicking a sidebar destination updates the URL, and a refresh from it lands on the same page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();
  await expect(page).toHaveURL(/\/workers$/);

  await mockDeepLinkShell(page, "/workers");
  await page.reload();

  await expect(page.getByRole("heading", { name: "Workers", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Workers" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the browser back button restores the previous page after in-app navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Workers" }).click();
  await expect(page.getByRole("button", { name: "Workers" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.goBack();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Overview" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
