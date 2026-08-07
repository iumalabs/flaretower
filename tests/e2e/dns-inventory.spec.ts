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
  await page.goto("/");
  await page.getByRole("button", { name: "DNS" }).click();
});

test("US1 — every zone and every record appears, none omitted", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "example.com" })).toBeVisible();
  await expect(page.getByText("old-blog.example.com")).toBeVisible();
  await expect(page.getByText("api.example.com")).toBeVisible();
  await expect(page.locator("tr", { hasText: "mail.example.com" })).toBeVisible();
});

test("US2 — the dangling CNAME renders as critical, distinct from the other records", async ({ page }) => {
  const row = page.locator("tr", { hasText: "old-blog.example.com" });
  await expect(row.getByText("CRITICAL")).toBeVisible();
});

test("US3 — a DNS-only origin-facing record renders as warning; a non-proxy-capable record renders as safe", async ({ page }) => {
  const warningRow = page.locator("tr", { hasText: "api.example.com" });
  await expect(warningRow.getByText("WARNING")).toBeVisible();

  const mxRow = page.locator("tr", { hasText: "10 mail.example.com" });
  await expect(mxRow.getByText("PROTECTED")).toBeVisible();
});
