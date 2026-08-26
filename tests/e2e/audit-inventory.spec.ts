import { expect, test } from "./fixtures.ts";

const MOCK_AUDIT_LOG = {
  since: "2026-08-06T12:00:00Z",
  until: "2026-08-13T12:00:00Z",
  unavailable: false,
  total: 2,
  truncated: false,
  entries: [
    {
      occurred_at: "2026-08-13T09:04:12Z",
      actor: "@ilse",
      actor_source: "dashboard",
      action: "Bound route to Access application",
      target: "internal.acme.dev/gateway/*",
      result_summary: '"—" -> "platform-core"',
    },
    {
      occurred_at: "2026-08-13T08:00:00Z",
      actor: "wrangler · deploy",
      actor_source: "api",
      action: "Enabled workers.dev subdomain",
      target: "api-gateway",
      result_summary: '"false" -> "true"',
    },
  ],
};

const MOCK_ALERT_A1 = {
  id: "a1",
  module: "security",
  kind: "ssl_tls",
  entity_label: "example.com",
  previous_status: "safe",
  new_status: "critical",
  detected_at: "2026-08-10T06:00:00Z",
  acknowledged_at: null,
};

const MOCK_AUDIT_ALERTS = {
  alerts: [
    MOCK_ALERT_A1,
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
  critical_alert: MOCK_ALERT_A1,
  unavailable_sources: [],
  pagination: { page: 1, page_size: 50, total: 2, total_pages: 1 },
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
  unavailable_sources: [],
  pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
};

const MOCK_AUDIT_SUMMARY = {
  modules: [
    {
      module: "exposure",
      kind: "hostname",
      has_data: true,
      counts: { safe: 4, warning: 1, critical: 0, not_evaluated: 0 },
    },
    {
      module: "dns",
      kind: "record",
      has_data: false,
      counts: { safe: 0, warning: 0, critical: 0, not_evaluated: 0 },
    },
    {
      module: "zero-trust",
      kind: "application",
      has_data: false,
      counts: { safe: 0, warning: 0, critical: 0, not_evaluated: 0 },
    },
  ],
  unavailable_sources: [
    {
      module: "zero-trust",
      kind: "application",
      error: "could not read zt_app_findings: D1_ERROR",
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
  await page.route("**/api/audit/log", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_AUDIT_LOG),
    }));
  await page.route("**/api/audit/alerts*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_AUDIT_ALERTS),
    }));
  await page.route("**/api/audit/changes*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_AUDIT_CHANGES),
    }));
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_AUDIT_SUMMARY),
    }));
  await page.goto("/app");
  await page.getByRole("button", { name: "Audit & Drift" }).click();
});

test("specs/018 US1 — the Audit log panel shows real account activity, alongside the existing unchanged sections", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Audit log" })).toBeVisible();

  const row0 = page.getByTestId("audit-log-row-0");
  await expect(row0.getByText("@ilse", { exact: false })).toBeVisible();
  await expect(row0.getByText("Bound route to Access application")).toBeVisible();
  await expect(row0.getByText("internal.acme.dev/gateway/*")).toBeVisible();

  // The existing 3 sections still exist, now as tabs (specs/021) rather
  // than always-visible stacked blocks.
  await expect(page.getByRole("tab", { name: "Unified alerts inbox" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "What changed" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Account-wide posture summary" })).toBeVisible();
});

test("specs/018 US1 — a confirmed-empty window renders distinctly from an unavailable Audit Logs API", async ({ page }) => {
  await page.route("**/api/audit/log", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        since: "2026-08-06T12:00:00Z",
        until: "2026-08-13T12:00:00Z",
        unavailable: false,
        total: 0,
        truncated: false,
        entries: [],
      }),
    }));
  await page.goto("/app");
  await page.getByRole("button", { name: "Audit & Drift" }).click();

  await expect(page.getByText("No account activity in the last 7 days.")).toBeVisible();
  await expect(page.getByText("Audit log could not be retrieved.")).not.toBeVisible();
});

test("specs/018 US1 — an unavailable Audit Logs API shows an explicit unavailable state", async ({ page }) => {
  await page.route("**/api/audit/log", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        since: "2026-08-06T12:00:00Z",
        until: "2026-08-13T12:00:00Z",
        unavailable: true,
        entries: [],
      }),
    }));
  await page.goto("/app");
  await page.getByRole("button", { name: "Audit & Drift" }).click();

  await expect(page.getByText("Audit log could not be retrieved.")).toBeVisible();
});

test("specs/020 US1 — the true total event count is shown, not just the rendered rows", async ({ page }) => {
  await expect(page.getByTestId("audit-log-total")).toHaveText("2 events");
  await expect(page.getByTestId("audit-log-capped")).not.toBeVisible();
});

test("specs/020 US1 — a capped result is clearly indicated, not shown as if complete", async ({ page }) => {
  await page.route("**/api/audit/log", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        since: "2026-08-06T12:00:00Z",
        until: "2026-08-13T12:00:00Z",
        unavailable: false,
        total: 1000,
        truncated: true,
        entries: MOCK_AUDIT_LOG.entries,
      }),
    }));
  await page.goto("/app");
  await page.getByRole("button", { name: "Audit & Drift" }).click();

  await expect(page.getByTestId("audit-log-total")).toHaveText("1000 events");
  await expect(page.getByTestId("audit-log-capped")).toBeVisible();
  await expect(page.getByTestId("audit-log-capped")).toContainText("capped");
});

test("specs/018 US2 — the source filter narrows the Audit log to Dashboard-only or API-only entries", async ({ page }) => {
  await expect(page.getByText("Bound route to Access application")).toBeVisible();
  await expect(page.getByText("Enabled workers.dev subdomain")).toBeVisible();

  await page.getByRole("button", { name: "DASHBOARD" }).click();
  await expect(page.getByText("Bound route to Access application")).toBeVisible();
  await expect(page.getByText("Enabled workers.dev subdomain")).not.toBeVisible();

  await page.getByRole("button", { name: "API" }).click();
  await expect(page.getByText("Bound route to Access application")).not.toBeVisible();
  await expect(page.getByText("Enabled workers.dev subdomain")).toBeVisible();

  await page.getByRole("button", { name: "All sources" }).click();
  await expect(page.getByText("Bound route to Access application")).toBeVisible();
  await expect(page.getByText("Enabled workers.dev subdomain")).toBeVisible();
});

test("specs/018 US3 — exporting a filtered view downloads only the currently-visible entries as JSONL", async ({ page }) => {
  await page.getByRole("button", { name: "API" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT JSONL" }).click();
  const download = await downloadPromise;

  const stream = await download.createReadStream();
  const decoder = new TextDecoder();
  let content = "";
  for await (const chunk of stream!) {
    content += decoder.decode(chunk as Uint8Array, { stream: true });
  }
  const lines = content.trim().split("\n");

  expect(lines.length).toBe(1);
  const entry = JSON.parse(lines[0]);
  expect(entry.actor_source).toBe("api");
  expect(entry.target).toBe("api-gateway");
});

// issue #450 — the page-header toolbar's primary action is brand-orange
// filled, not the generic gray/transparent ghost-button style.
test("issue #450 — the Export button is filled brand-orange, not gray/transparent", async ({ page }) => {
  const background = await page.getByRole("button", { name: "EXPORT JSONL" }).evaluate((el) =>
    getComputedStyle(el).backgroundColor
  );
  expect(background).toBe("rgb(246, 130, 31)");
});

test("US1 — alerts from multiple modules appear in the unified inbox, each labeled with its source", async ({ page }) => {
  await page.getByRole("tab", { name: "Unified alerts inbox" }).click();
  const sslRow = page.getByTestId("findings-row-a1");
  await expect(sslRow).toBeVisible();
  await expect(sslRow.getByText("security/ssl_tls", { exact: false })).toBeVisible();

  const bucketRow = page.getByTestId("findings-row-a2");
  await expect(bucketRow).toBeVisible();
  await expect(bucketRow.getByText("storage/r2_bucket", { exact: false })).toBeVisible();
});

test("US2 — the what changed section shows an entity whose status changed since the cutoff", async ({ page }) => {
  await page.getByRole("tab", { name: "What changed" }).click();

  const changeRow = page.getByTestId("findings-row-security/dnssec/flaretower-changed.test");
  await expect(changeRow).toBeVisible();
  await expect(changeRow.getByText("security/dnssec", { exact: false })).toBeVisible();
  await expect(changeRow.getByText("safe → critical", { exact: false })).toBeVisible();
});

test("US3 — the posture summary renders per-module counts, and a no-data module renders distinctly from a confirmed-clean one", async ({ page }) => {
  await page.getByRole("tab", { name: "Account-wide posture summary" }).click();

  const exposureRow = page.locator("tr", { hasText: "exposure/hostname" });
  await expect(exposureRow).toBeVisible();
  await expect(exposureRow.getByText("4 safe", { exact: false })).toBeVisible();

  const dnsRow = page.locator("tr", { hasText: "dns/record" });
  await expect(dnsRow).toBeVisible();
  await expect(dnsRow.getByText("no data yet", { exact: false })).toBeVisible();
});

test("T025 — a source whose D1 read failed renders as not available, distinct from a source with no data yet", async ({ page }) => {
  await page.getByRole("tab", { name: "Account-wide posture summary" }).click();

  // zero-trust/application rejected outright — must read "(not available)",
  // never fold into the same "no data yet" wording a source that simply
  // hasn't run yet gets (dns/record, from the same mocked response).
  const zeroTrustRow = page.locator("tr", { hasText: "zero-trust/application" });
  await expect(zeroTrustRow).toBeVisible();
  await expect(zeroTrustRow.getByText("(not available)", { exact: false })).toBeVisible();

  const dnsRow = page.locator("tr", { hasText: "dns/record" });
  await expect(dnsRow).toBeVisible();
  await expect(dnsRow.getByText("no data yet", { exact: false })).toBeVisible();
  await expect(dnsRow.getByText("(not available)", { exact: false })).toHaveCount(0);

  // The section-level notice names the failed source and its error.
  await expect(
    page.getByText("zero-trust/application data not available", { exact: false }),
  ).toBeVisible();
});

// specs/021-dashboard-panel-tabs
test("specs/021 US1 — four tabs replace the stacked blocks; only the active tab's content renders", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Audit log" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Unified alerts inbox" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "What changed" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Account-wide posture summary" })).toBeVisible();

  // Audit log is the default/first tab.
  await expect(page.getByTestId("audit-log-row-0")).toBeVisible();
  await expect(page.getByTestId("findings-row-a1")).not.toBeVisible();

  await page.getByRole("tab", { name: "Unified alerts inbox" }).click();
  await expect(page.getByTestId("findings-row-a1")).toBeVisible();
  await expect(page.getByTestId("audit-log-row-0")).not.toBeVisible();
});

test("specs/021 FR-006 — the account-wide critical alert banner stays visible on every tab", async ({ page }) => {
  // MOCK_AUDIT_ALERTS' "a1" is already status "critical" by default.
  const banner = page.getByText("An outstanding critical alert needs attention");
  await expect(banner).toBeVisible();

  await page.getByRole("tab", { name: "What changed" }).click();
  await expect(banner).toBeVisible();

  await page.getByRole("tab", { name: "Account-wide posture summary" }).click();
  await expect(banner).toBeVisible();
});

// specs/022-audit-list-pagination
test("specs/022 US1 — the Unified alerts inbox tab paginates: page footer, next/prev", async ({ page }) => {
  const allAlerts = Array.from({ length: 5 }, (_, i) => ({
    ...MOCK_ALERT_A1,
    id: `alert-${i}`,
    new_status: "warning",
    entity_label: `entity-${i}`,
  }));
  await page.route("**/api/audit/alerts*", (route) => {
    const url = new URL(route.request().url());
    const requestedPage = Number(url.searchParams.get("page") ?? "1");
    const pageSize = 2;
    const start = (requestedPage - 1) * pageSize;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        alerts: allAlerts.slice(start, start + pageSize),
        critical_alert: null,
        unavailable_sources: [],
        pagination: {
          page: requestedPage,
          page_size: pageSize,
          total: allAlerts.length,
          total_pages: Math.ceil(allAlerts.length / pageSize),
        },
      }),
    });
  });
  await page.goto("/app");
  await page.getByRole("button", { name: "Audit & Drift" }).click();
  await page.getByRole("tab", { name: "Unified alerts inbox" }).click();

  await expect(page.getByTestId("findings-row-alert-0")).toBeVisible();
  await expect(page.getByTestId("pagination-status")).toHaveText("5 total · page 1 of 3");
  await expect(page.getByTestId("pagination-prev")).toBeDisabled();

  await page.getByTestId("pagination-next").click();
  await expect(page.getByTestId("findings-row-alert-2")).toBeVisible();
  await expect(page.getByTestId("findings-row-alert-0")).not.toBeVisible();
  await expect(page.getByTestId("pagination-status")).toHaveText("5 total · page 2 of 3");
});

test("specs/022 US1 — the What changed tab paginates: page footer, next/prev", async ({ page }) => {
  const allChanges = Array.from({ length: 5 }, (_, i) => ({
    module: "security",
    kind: "ssl_tls",
    entity_label: `change-${i}`,
    previous_status: "safe",
    current_status: "warning",
  }));
  await page.route("**/api/audit/changes*", (route) => {
    const url = new URL(route.request().url());
    const requestedPage = Number(url.searchParams.get("page") ?? "1");
    const pageSize = 2;
    const start = (requestedPage - 1) * pageSize;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        since: "2026-08-09T14:00:00Z",
        until: "2026-08-10T14:00:00Z",
        changes: allChanges.slice(start, start + pageSize),
        unavailable_sources: [],
        pagination: {
          page: requestedPage,
          page_size: pageSize,
          total: allChanges.length,
          total_pages: Math.ceil(allChanges.length / pageSize),
        },
      }),
    });
  });
  await page.goto("/app");
  await page.getByRole("button", { name: "Audit & Drift" }).click();
  await page.getByRole("tab", { name: "What changed" }).click();

  await expect(page.getByTestId("findings-row-security/ssl_tls/change-0")).toBeVisible();
  await expect(page.getByTestId("pagination-status")).toHaveText("5 total · page 1 of 3");

  await page.getByTestId("pagination-next").click();
  await expect(page.getByTestId("findings-row-security/ssl_tls/change-2")).toBeVisible();
  await expect(page.getByTestId("pagination-status")).toHaveText("5 total · page 2 of 3");
});

test("specs/022 — critical_alert still shows the banner when the critical alert isn't on the current page", async ({ page }) => {
  await page.route("**/api/audit/alerts*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        alerts: [
          { ...MOCK_ALERT_A1, id: "a2", new_status: "warning" },
        ],
        critical_alert: MOCK_ALERT_A1,
        unavailable_sources: [],
        pagination: { page: 1, page_size: 1, total: 2, total_pages: 2 },
      }),
    }));
  await page.goto("/app");
  await page.getByRole("button", { name: "Audit & Drift" }).click();

  await expect(page.getByText("An outstanding critical alert needs attention")).toBeVisible();
});
