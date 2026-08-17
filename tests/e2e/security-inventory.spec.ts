import { expect, test } from "@playwright/test";

const MOCK_SECURITY_INVENTORY = {
  run_id: "run-1",
  evaluated_at: "2026-08-10T12:00:00Z",
  critical_finding: {
    zone_name: "insecure.example.com",
    description:
      "SSL/TLS: SSL/TLS mode is Flexible — the connection between Cloudflare and the origin is unencrypted",
  },
  zones_pagination: { page: 1, page_size: 50, total: 2, total_pages: 1 },
  certificates_pagination: { page: 1, page_size: 50, total: 2, total_pages: 1 },
  waf_custom_rules_pagination: { page: 1, page_size: 50, total: 3, total_pages: 1 },
  zones: [
    {
      zone_id: "zone-1",
      zone_name: "safe-strict-zone.test",
      overall_status: "safe",
      ssl_tls: { status: "safe", reason: "SSL/TLS mode is Full (strict)" },
      dnssec: { status: "safe", reason: "DNSSEC is active" },
      waf: {
        status: "safe",
        reason: "a WAF managed ruleset is deployed with at least one enabled rule",
      },
      rate_limiting: {
        status: "safe",
        reason: "a rate-limiting ruleset is deployed with at least one enabled rule",
      },
      bot_fight_mode: { status: "safe", reason: "Bot Fight Mode is on" },
      always_use_https: { status: "safe", reason: "Always Use HTTPS is on" },
      min_tls_version: { status: "safe", reason: "minimum TLS version is 1.2" },
    },
    {
      zone_id: "zone-2",
      zone_name: "insecure.example.com",
      overall_status: "critical",
      ssl_tls: {
        status: "critical",
        reason:
          "SSL/TLS mode is Flexible — the connection between Cloudflare and the origin is unencrypted",
      },
      dnssec: {
        status: "warning",
        reason: "DNSSEC is not yet providing protection (status: disabled)",
      },
      waf: {
        status: "warning",
        reason: "no WAF managed ruleset deployed, or every rule in it is disabled",
      },
      rate_limiting: {
        status: "warning",
        reason: "no rate-limiting ruleset deployed, or every rule in it is disabled",
      },
      bot_fight_mode: { status: "warning", reason: "Bot Fight Mode is off" },
      always_use_https: { status: "warning", reason: "Always Use HTTPS is off" },
      min_tls_version: {
        status: "warning",
        reason: "minimum TLS version is 1.0 — TLS 1.0/1.1 are deprecated",
      },
    },
  ],
  certificates: [
    {
      zone_id: "zone-1",
      zone_name: "safe-strict-zone.test",
      hosts: ["safe-strict-zone.test"],
      issuer: "Let's Encrypt",
      expires_on: "2026-10-13T00:00:00Z",
      status: "safe",
    },
    {
      zone_id: "zone-2",
      zone_name: "insecure.example.com",
      hosts: [],
      issuer: "",
      expires_on: null,
      status: "not_evaluated",
    },
  ],
  waf_custom_rules: [
    {
      zone_id: "zone-1",
      zone_name: "safe-strict-zone.test",
      description: "block-admin-paths",
      expression: 'http.request.uri.path contains "/admin"',
      action: "block",
      enabled: true,
      status: "safe",
    },
    {
      zone_id: "zone-2",
      zone_name: "insecure.example.com",
      description: "allow-ci-egress",
      expression: "ip.src in $ci_ranges",
      action: "skip",
      enabled: true,
      status: "warning",
    },
    {
      zone_id: "zone-2",
      zone_name: "insecure.example.com",
      description: "legacy-ua-block",
      expression: 'http.user_agent contains "MSIE"',
      action: "block",
      enabled: false,
      status: "not_evaluated",
    },
  ],
  turnstile_widgets: [
    { sitekey: "0x123", name: "login-widget", domains: ["example.com"] },
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
  await page.route("**/api/security/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SECURITY_INVENTORY),
    }));
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ modules: [], unavailable_sources: [] }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Security Posture" }).click();
});

test("US1 — exactly one row per zone, not one row per underlying check", async ({ page }) => {
  await expect(page.getByTestId("findings-row-zone-1")).toBeVisible();
  await expect(page.getByTestId("findings-row-zone-2")).toBeVisible();
  // Only the zone table's own rows — not the Certificates/WAF Custom
  // Rules panels' rows, which share the same "findings-row-" testid
  // prefix but a distinct "cert:"/"waf-rule:" infix.
  await expect(
    page.locator(
      "[data-testid^='findings-row-']:not([data-testid*='cert:']):not([data-testid*='waf-rule:'])",
    ),
  ).toHaveCount(2);

  await page.getByRole("tab", { name: "Turnstile widgets" }).click();
  await expect(page.getByText("login-widget")).toBeVisible();
});

test("US1 — a zone's overall status is the worst of its checks: all-safe renders safe, one critical renders critical", async ({ page }) => {
  await expect(page.getByTestId("findings-row-zone-1").getByText("PROTECTED").first())
    .toBeVisible();
  await expect(page.getByTestId("findings-row-zone-2").getByText("CRITICAL").first())
    .toBeVisible();
});

test("US1 — each zone row shows a pill per check", async ({ page }) => {
  const safeZone = page.getByTestId("findings-row-zone-1");
  // 1 leftmost overall-status badge + 7 per-check badges, all PROTECTED.
  await expect(safeZone.getByText("PROTECTED")).toHaveCount(8);

  const gapZone = page.getByTestId("findings-row-zone-2");
  await expect(gapZone.getByText("CRITICAL")).toHaveCount(2); // overall + ssl_tls
  await expect(gapZone.getByText("WARNING")).toHaveCount(6); // the other 6 checks
});

test("US2 — Bot Fight Mode/Always Use HTTPS/Minimum TLS Version render per zone", async ({ page }) => {
  const safeZone = page.getByTestId("findings-row-zone-1");
  await safeZone.click();
  await expect(safeZone.getByText("Bot Fight Mode is on")).toBeVisible();
  await expect(safeZone.getByText("Always Use HTTPS is on")).toBeVisible();
  await expect(safeZone.getByText("minimum TLS version is 1.2")).toBeVisible();

  const gapZone = page.getByTestId("findings-row-zone-2");
  await gapZone.click();
  await expect(gapZone.getByText("Bot Fight Mode is off")).toBeVisible();
  await expect(gapZone.getByText("Always Use HTTPS is off")).toBeVisible();
  await expect(gapZone.getByText("TLS 1.0/1.1 are deprecated", { exact: false })).toBeVisible();
});

test("US3 — Certificates panel shows real host/issuer/expiry, or an explicit not-available state", async ({ page }) => {
  await page.getByRole("tab", { name: "Certificates" }).click();
  const withCert = page.getByTestId("findings-row-cert:zone-1");
  await expect(withCert.getByText("safe-strict-zone.test", { exact: true }).first()).toBeVisible();
  await expect(withCert.getByText("Let's Encrypt", { exact: true })).toBeVisible();
  await expect(withCert.getByText("expires in", { exact: false })).toBeVisible();

  const noCert = page.getByTestId("findings-row-cert:zone-2");
  await expect(noCert.getByText("not available", { exact: true }).first()).toBeVisible();
});

test("US3 — WAF Custom Rules panel labels every rule with its real zone; a skip rule is warning, a disabled rule is not-evaluated", async ({ page }) => {
  await page.getByRole("tab", { name: "WAF custom rules" }).click();
  const skipRule = page.getByTestId("findings-row-waf-rule:zone-2:1");
  await expect(skipRule.getByText("allow-ci-egress", { exact: true })).toBeVisible();
  await expect(skipRule.getByText("WARNING")).toBeVisible();

  const disabledRule = page.getByTestId("findings-row-waf-rule:zone-2:2");
  await expect(disabledRule.getByText("legacy-ua-block", { exact: true })).toBeVisible();
  await expect(disabledRule.getByText("N/A")).toBeVisible();

  const blockRule = page.getByTestId("findings-row-waf-rule:zone-1:0");
  await expect(blockRule.getByText("block-admin-paths", { exact: true })).toBeVisible();
  await expect(blockRule.getByText("PROTECTED")).toBeVisible();
});

// Regression coverage for the spec's "account has zero zones" edge case
// (Edge Cases / SC-002): a completed run against a zero-zone account must
// render the confirmed-empty result, not the "no evaluation runs yet"
// message — the empty-state check must key off `run_id === null`, not
// off the zones/turnstile_widgets arrays being empty, since a real
// completed run can legitimately produce empty arrays too.
test("a completed run against a zero-zone account renders confirmed-empty, not 'no evaluation runs yet'", async ({ page }) => {
  await page.route("**/api/security/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run_id: "run-2",
        evaluated_at: "2026-08-12T00:00:00Z",
        critical_finding: null,
        zones_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        certificates_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        waf_custom_rules_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        zones: [],
        certificates: [],
        waf_custom_rules: [],
        turnstile_widgets: [],
      }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Security Posture" }).click();

  await expect(page.getByText("No evaluation runs yet", { exact: false })).not.toBeVisible();
  await expect(page.getByText("Security posture", { exact: true })).toBeVisible();
  await expect(page.getByText("run run-2", { exact: false })).toBeVisible();

  await page.getByRole("tab", { name: "Turnstile widgets" }).click();
  await expect(page.getByText("No Turnstile widgets configured.")).toBeVisible();
});

// Regression coverage: the critical-alert banner must describe whichever
// check actually made the zone critical, not always SSL/TLS — a zone can
// be critical via any one of its 7 checks.
test("critical-alert banner describes the check that's actually critical, not always SSL/TLS", async ({ page }) => {
  await page.route("**/api/security/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run_id: "run-3",
        evaluated_at: "2026-08-13T00:00:00Z",
        critical_finding: {
          zone_name: "waf-gap.example.com",
          description: "WAF: no WAF managed ruleset deployed, or every rule in it is disabled",
        },
        zones_pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
        certificates_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        waf_custom_rules_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        zones: [
          {
            zone_id: "zone-3",
            zone_name: "waf-gap.example.com",
            overall_status: "critical",
            ssl_tls: { status: "safe", reason: "SSL/TLS mode is Full (strict)" },
            dnssec: { status: "safe", reason: "DNSSEC is active" },
            waf: {
              status: "critical",
              reason: "no WAF managed ruleset deployed, or every rule in it is disabled",
            },
            rate_limiting: {
              status: "safe",
              reason: "a rate-limiting ruleset is deployed with at least one enabled rule",
            },
            bot_fight_mode: { status: "safe", reason: "Bot Fight Mode is on" },
            always_use_https: { status: "safe", reason: "Always Use HTTPS is on" },
            min_tls_version: { status: "safe", reason: "minimum TLS version is 1.2" },
          },
        ],
        certificates: [],
        waf_custom_rules: [],
        turnstile_widgets: [],
      }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Security Posture" }).click();

  await expect(page.getByText("A zone has a critical security gap")).toBeVisible();
  await expect(
    page.getByText("WAF: no WAF managed ruleset deployed, or every rule in it is disabled"),
  ).toBeVisible();
  await expect(page.getByText("SSL/TLS mode is Full (strict)", { exact: false })).not.toBeVisible();
});

test("specs/020 US2 — the zones table paginates independently of the Certificates/WAF panels", async ({ page }) => {
  const allZones = Array.from({ length: 3 }, (_, i) => ({
    zone_id: `z${i}`,
    zone_name: `z${i}.test`,
    overall_status: "safe",
    ssl_tls: { status: "safe", reason: "strict" },
  }));
  await page.route("**/api/security/inventory*", (route) => {
    const url = new URL(route.request().url());
    const zonePage = Number(url.searchParams.get("zone_page") ?? "1");
    const zonePageSize = 2;
    const start = (zonePage - 1) * zonePageSize;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run_id: "run-4",
        evaluated_at: "2026-08-14T00:00:00Z",
        critical_finding: null,
        zones: allZones.slice(start, start + zonePageSize),
        zones_pagination: {
          page: zonePage,
          page_size: zonePageSize,
          total: allZones.length,
          total_pages: Math.ceil(allZones.length / zonePageSize),
        },
        certificates: [],
        certificates_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        waf_custom_rules: [],
        waf_custom_rules_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        turnstile_widgets: [],
      }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Security Posture" }).click();

  await expect(page.getByTestId("findings-row-z0")).toBeVisible();
  await expect(page.getByTestId("findings-row-z2")).not.toBeVisible();
  await expect(page.getByTestId("pagination-status")).toHaveText("3 total · page 1 of 2");

  await page.getByTestId("pagination-next").click();
  await expect(page.getByTestId("findings-row-z2")).toBeVisible();
});

test("no evaluation run yet (run_id null) still renders the 'trigger one' message", async ({ page }) => {
  await page.route("**/api/security/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run_id: null,
        evaluated_at: null,
        critical_finding: null,
        zones_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        certificates_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        waf_custom_rules_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        zones: [],
        turnstile_widgets: [],
      }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Security Posture" }).click();

  await expect(page.getByText("No evaluation runs yet", { exact: false })).toBeVisible();
  // The page heading now renders in every state (including "not yet
  // evaluated"), matching the design shell's consistent page-identity
  // pattern — only the body content below it differs.
  await expect(page.getByText("Security posture", { exact: true })).toBeVisible();
});

// specs/021-dashboard-panel-tabs
test("specs/021 US1 — four tabs replace the stacked blocks; only the active tab's content renders", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Zones" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Certificates" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "WAF custom rules" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Turnstile widgets" })).toBeVisible();

  // Zones is the default/first tab.
  await expect(page.getByTestId("findings-row-zone-1")).toBeVisible();
  await expect(page.getByTestId("findings-row-cert:zone-1")).not.toBeVisible();

  await page.getByRole("tab", { name: "Certificates" }).click();
  await expect(page.getByTestId("findings-row-cert:zone-1")).toBeVisible();
  await expect(page.getByTestId("findings-row-zone-1")).not.toBeVisible();
});

test("specs/021 US2 — switching tabs and back preserves the zones table's page and sort", async ({ page }) => {
  const allZones = Array.from({ length: 3 }, (_, i) => ({
    zone_id: `z${i}`,
    zone_name: `z${i}.test`,
    overall_status: "safe",
    ssl_tls: { status: "safe", reason: "strict" },
  }));
  await page.route("**/api/security/inventory*", (route) => {
    const url = new URL(route.request().url());
    const zonePage = Number(url.searchParams.get("zone_page") ?? "1");
    const zonePageSize = 2;
    const start = (zonePage - 1) * zonePageSize;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run_id: "run-4",
        evaluated_at: "2026-08-14T00:00:00Z",
        critical_finding: null,
        zones: allZones.slice(start, start + zonePageSize),
        zones_pagination: {
          page: zonePage,
          page_size: zonePageSize,
          total: allZones.length,
          total_pages: Math.ceil(allZones.length / zonePageSize),
        },
        certificates: [],
        certificates_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        waf_custom_rules: [],
        waf_custom_rules_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        turnstile_widgets: [],
      }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Security Posture" }).click();

  await page.getByTestId("pagination-next").click();
  await expect(page.getByTestId("pagination-status")).toHaveText("3 total · page 2 of 2");

  await page.getByRole("tab", { name: "Certificates" }).click();
  await page.getByRole("tab", { name: "Zones" }).click();

  await expect(page.getByTestId("pagination-status")).toHaveText("3 total · page 2 of 2");
});

test("US1 — re-scan refreshes the page's findings without a reload (FR-001..FR-003)", async ({ page }) => {
  await expect(page.getByText("run run-1", { exact: false })).toBeVisible();

  await page.route("**/api/security/evaluate", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ run_id: "run-2" }),
    });
  });
  await page.route("**/api/security/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_SECURITY_INVENTORY,
        run_id: "run-2",
        evaluated_at: "2026-08-11T09:00:00Z",
      }),
    }));

  const button = page.getByRole("button", { name: "Re-scan" });
  await button.click();
  await expect(page.getByRole("button", { name: "Scanning…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-scan" })).toBeEnabled();
  await expect(page.getByText("run run-2", { exact: false })).toBeVisible();
});

test("re-scan failure leaves existing data untouched and shows an inline error (FR-005)", async ({ page }) => {
  await page.route(
    "**/api/security/evaluate",
    (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({}) }),
  );

  await page.getByRole("button", { name: "Re-scan" }).click();

  await expect(page.getByText("Re-scan failed:", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-scan" })).toBeEnabled();
  await expect(page.getByTestId("findings-row-zone-1")).toBeVisible();
  await expect(page.getByText("run run-1", { exact: false })).toBeVisible();
});

test("US2 — first-ever scan from the never-evaluated empty state (FR-006)", async ({ page }) => {
  await page.route("**/api/security/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run_id: null,
        evaluated_at: null,
        critical_finding: null,
        zones_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        certificates_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        waf_custom_rules_pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 },
        zones: [],
        turnstile_widgets: [],
      }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Security Posture" }).click();

  await expect(page.getByText("No evaluation runs yet", { exact: false })).toBeVisible();
  await expect(page.getByText("POST /api/security/evaluate")).not.toBeVisible();

  await page.route("**/api/security/evaluate", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ run_id: "run-1" }),
    });
  });
  await page.route("**/api/security/inventory*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SECURITY_INVENTORY),
    }));

  await page.getByRole("button", { name: "Re-scan" }).click();
  await expect(page.getByTestId("findings-row-zone-1")).toBeVisible();
  await expect(page.getByText("No evaluation runs yet", { exact: false })).not.toBeVisible();
});
