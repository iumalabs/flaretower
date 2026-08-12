import { expect, test } from "@playwright/test";

const MOCK_SECURITY_INVENTORY = {
  run_id: "run-1",
  evaluated_at: "2026-08-10T12:00:00Z",
  zones: [
    {
      zone_id: "zone-1",
      zone_name: "safe-strict-zone.test",
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
    },
    {
      zone_id: "zone-2",
      zone_name: "insecure.example.com",
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
  await page.route("**/api/security/inventory", (route) =>
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

test("US1 — every zone's four checks and every Turnstile widget appear, none omitted", async ({ page }) => {
  await expect(page.getByText("safe-strict-zone.test").first()).toBeVisible();
  await expect(page.getByText("insecure.example.com").first()).toBeVisible();
  for (const kind of ["ssl_tls", "dnssec", "waf", "rate_limiting"]) {
    await expect(page.getByTestId(`findings-row-zone-1:${kind}`)).toBeVisible();
    await expect(page.getByTestId(`findings-row-zone-2:${kind}`)).toBeVisible();
  }
  await expect(page.getByText("login-widget")).toBeVisible();
});

test("US2 — a fully strict zone's SSL/TLS mode renders safe, a flexible one renders critical", async ({ page }) => {
  await expect(page.getByTestId("findings-row-zone-1:ssl_tls").getByText("PROTECTED"))
    .toBeVisible();
  await expect(page.getByTestId("findings-row-zone-2:ssl_tls").getByText("CRITICAL")).toBeVisible();
});

test("US3 — DNSSEC/WAF/rate-limiting gaps render warning, protected zone renders safe", async ({ page }) => {
  await expect(page.getByTestId("findings-row-zone-1:dnssec").getByText("PROTECTED")).toBeVisible();
  await expect(page.getByTestId("findings-row-zone-1:waf").getByText("PROTECTED")).toBeVisible();
  await expect(page.getByTestId("findings-row-zone-1:rate_limiting").getByText("PROTECTED"))
    .toBeVisible();

  await expect(page.getByTestId("findings-row-zone-2:dnssec").getByText("WARNING")).toBeVisible();
  await expect(page.getByTestId("findings-row-zone-2:waf").getByText("WARNING")).toBeVisible();
  await expect(page.getByTestId("findings-row-zone-2:rate_limiting").getByText("WARNING"))
    .toBeVisible();
});

// Regression coverage for the spec's "account has zero zones" edge case
// (Edge Cases / SC-002): a completed run against a zero-zone account must
// render the confirmed-empty result, not the "no evaluation runs yet"
// message — the empty-state check must key off `run_id === null`, not
// off the zones/turnstile_widgets arrays being empty, since a real
// completed run can legitimately produce empty arrays too.
test("a completed run against a zero-zone account renders confirmed-empty, not 'no evaluation runs yet'", async ({ page }) => {
  await page.route("**/api/security/inventory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run_id: "run-2",
        evaluated_at: "2026-08-12T00:00:00Z",
        zones: [],
        turnstile_widgets: [],
      }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Security Posture" }).click();

  await expect(page.getByText("No evaluation runs yet", { exact: false })).not.toBeVisible();
  await expect(page.getByText("Security posture inventory")).toBeVisible();
  await expect(page.getByText("run run-2", { exact: false })).toBeVisible();
  await expect(page.getByText("No Turnstile widgets configured.")).toBeVisible();
});

test("no evaluation run yet (run_id null) still renders the 'trigger one' message", async ({ page }) => {
  await page.route("**/api/security/inventory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run_id: null, evaluated_at: null, zones: [], turnstile_widgets: [] }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Security Posture" }).click();

  await expect(page.getByText("No evaluation runs yet", { exact: false })).toBeVisible();
  // The page heading now renders in every state (including "not yet
  // evaluated"), matching the design shell's consistent page-identity
  // pattern — only the body content below it differs.
  await expect(page.getByText("Security posture inventory")).toBeVisible();
});
