import { expect, test } from "@playwright/test";

const MOCK_DNS_INVENTORY = {
  run_id: "run-1",
  evaluated_at: "2026-08-07T12:00:00Z",
  zones: [
    {
      zone_name: "example.com",
      records: [
        {
          record_name: "old-blog.example.com",
          type: "CNAME",
          content: "old-blog.herokuapp.com",
          proxy_capable: true,
          proxied: false,
          status: "critical",
          reason: "dangling CNAME target",
        },
        {
          record_name: "api.example.com",
          type: "A",
          content: "203.0.113.10",
          proxy_capable: true,
          proxied: false,
          status: "warning",
          reason: "DNS-only — bypasses Cloudflare protection",
        },
        {
          record_name: "example.com",
          type: "MX",
          content: "10 mail.example.com",
          proxy_capable: false,
          proxied: null,
          status: "safe",
          reason: "not proxy-capable",
        },
        {
          record_name: "unknown.example.com",
          type: "A",
          content: "203.0.113.20",
          proxy_capable: true,
          proxied: false,
          status: "not_evaluated",
          reason: "could not evaluate dangling-target status (Security Insights API error)",
        },
      ],
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
      body: JSON.stringify(MOCK_DNS_INVENTORY),
    }));
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ modules: [], unavailable_sources: [] }),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "DNS" }).click();
});

function row(
  page: import("@playwright/test").Page,
  zone: string,
  type: string,
  name: string,
  content: string,
) {
  return page.getByTestId(`findings-row-${zone}:${type}:${name}:${content}`);
}

test("US1 — every zone and every record appears, none omitted", async ({ page }) => {
  await expect(page.getByText("example.com", { exact: true }).first()).toBeVisible();
  // old-blog.example.com is critical and legitimately appears twice — once
  // in its row, once in the module-scope alert banner above the table
  // (FR-013).
  await expect(page.getByText("old-blog.example.com").first()).toBeVisible();
  await expect(page.getByText("api.example.com")).toBeVisible();
  await expect(row(page, "example.com", "MX", "example.com", "10 mail.example.com")).toBeVisible();
});

test("US2 — the dangling CNAME renders as critical, distinct from the other records", async ({ page }) => {
  const r = row(page, "example.com", "CNAME", "old-blog.example.com", "old-blog.herokuapp.com");
  await expect(r.getByText("CRITICAL")).toBeVisible();
});

test("US3 — a DNS-only origin-facing record renders as warning; a non-proxy-capable record renders as safe", async ({ page }) => {
  const warningRow = row(page, "example.com", "A", "api.example.com", "203.0.113.10");
  await expect(warningRow.getByText("WARNING")).toBeVisible();

  const mxRow = row(page, "example.com", "MX", "example.com", "10 mail.example.com");
  await expect(mxRow.getByText("PROTECTED")).toBeVisible();
});

test("US2/AC3 — a record whose dangling status couldn't be determined renders as not_evaluated (N/A), never silently safe", async ({ page }) => {
  const naRow = row(page, "example.com", "A", "unknown.example.com", "203.0.113.20");
  await expect(naRow.getByText("N/A")).toBeVisible();
  await expect(
    naRow.getByText("could not evaluate dangling-target status (Security Insights API error)"),
  ).toBeVisible();
});
