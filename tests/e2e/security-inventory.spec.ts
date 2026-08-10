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
  await page.goto("/");
  await page.getByRole("button", { name: "Security Posture" }).click();
});

test("US1 — every zone's four checks and every Turnstile widget appear, none omitted", async ({ page }) => {
  await expect(page.locator("h2", { hasText: "safe-strict-zone.test" })).toBeVisible();
  await expect(page.locator("h2", { hasText: "insecure.example.com" })).toBeVisible();
  await expect(page.locator("tr", { hasText: "SSL/TLS mode" }).first()).toBeVisible();
  await expect(page.locator("tr", { hasText: "DNSSEC" }).first()).toBeVisible();
  await expect(page.locator("tr", { hasText: "WAF" }).first()).toBeVisible();
  await expect(page.locator("tr", { hasText: "Rate limiting" }).first()).toBeVisible();
  await expect(page.getByText("login-widget")).toBeVisible();
});

test("US2 — a fully strict zone's SSL/TLS mode renders safe, a flexible one renders critical", async ({ page }) => {
  const strictSection = page.locator("section", {
    has: page.locator("h2", { hasText: "safe-strict-zone.test" }),
  });
  await expect(strictSection.locator("tr", { hasText: "SSL/TLS mode" }).getByText("PROTECTED"))
    .toBeVisible();

  const flexibleSection = page.locator("section", {
    has: page.locator("h2", { hasText: "insecure.example.com" }),
  });
  await expect(flexibleSection.locator("tr", { hasText: "SSL/TLS mode" }).getByText("CRITICAL"))
    .toBeVisible();
});

test("US3 — DNSSEC/WAF/rate-limiting gaps render warning, protected zone renders safe", async ({ page }) => {
  const strictSection = page.locator("section", {
    has: page.locator("h2", { hasText: "safe-strict-zone.test" }),
  });
  await expect(strictSection.locator("tr", { hasText: "DNSSEC" }).getByText("PROTECTED"))
    .toBeVisible();
  await expect(strictSection.locator("tr", { hasText: "WAF" }).getByText("PROTECTED"))
    .toBeVisible();
  await expect(strictSection.locator("tr", { hasText: "Rate limiting" }).getByText("PROTECTED"))
    .toBeVisible();

  const gapSection = page.locator("section", {
    has: page.locator("h2", { hasText: "insecure.example.com" }),
  });
  await expect(gapSection.locator("tr", { hasText: "DNSSEC" }).getByText("WARNING")).toBeVisible();
  await expect(gapSection.locator("tr", { hasText: "WAF" }).getByText("WARNING")).toBeVisible();
  await expect(gapSection.locator("tr", { hasText: "Rate limiting" }).getByText("WARNING"))
    .toBeVisible();
});
