import { expect, test } from "./fixtures.ts";

interface MockDnsRecord {
  record_name: string;
  type: string;
  content: string;
  proxy_capable: boolean;
  proxied: boolean | null;
  ttl: number | null;
  is_platform_target: boolean;
  status: string;
  reason: string;
}

interface MockZone {
  zone_name: string;
  records: MockDnsRecord[];
}

const MOCK_ZONES: MockZone[] = [
  {
    zone_name: "example.com",
    records: [
      {
        record_name: "old-blog.example.com",
        type: "CNAME",
        content: "old-blog.herokuapp.com",
        proxy_capable: true,
        proxied: false,
        ttl: 300,
        is_platform_target: false,
        status: "critical",
        reason: "dangling CNAME target",
      },
      {
        record_name: "api.example.com",
        type: "A",
        content: "203.0.113.10",
        proxy_capable: true,
        proxied: false,
        ttl: 300,
        is_platform_target: false,
        status: "warning",
        reason: "DNS-only — bypasses Cloudflare protection",
      },
      {
        record_name: "example.com",
        type: "MX",
        content: "10 mail.example.com",
        proxy_capable: false,
        proxied: null,
        ttl: 3600,
        is_platform_target: false,
        status: "safe",
        reason: "not proxy-capable",
      },
      {
        record_name: "unknown.example.com",
        type: "A",
        content: "203.0.113.20",
        proxy_capable: true,
        proxied: false,
        ttl: 300,
        is_platform_target: false,
        status: "not_evaluated",
        reason: "could not evaluate dangling-target status (Security Insights API error)",
      },
      {
        record_name: "_dmarc.example.com",
        type: "TXT",
        content: "v=DMARC1; p=none",
        proxy_capable: false,
        proxied: null,
        ttl: 3600,
        is_platform_target: false,
        status: "warning",
        reason: "DMARC policy provides no enforcement (p=none)",
      },
      {
        record_name: "docs.example.com",
        type: "CNAME",
        content: "example-docs.pages.dev",
        proxy_capable: true,
        proxied: true,
        ttl: 1,
        is_platform_target: true,
        status: "safe",
        reason: "proxied through Cloudflare",
      },
    ],
  },
  {
    zone_name: "second.example",
    records: [
      {
        record_name: "second.example",
        type: "A",
        content: "203.0.113.99",
        proxy_capable: true,
        proxied: true,
        ttl: 1,
        is_platform_target: false,
        status: "safe",
        reason: "proxied through Cloudflare",
      },
    ],
  },
];

const SORTS: Record<string, (r: MockDnsRecord) => string | number> = {
  type: (r) => r.type,
  name: (r) => r.record_name,
  ttl: (r) => r.ttl ?? -1,
};

// Mirrors worker/modules/dns/routes.ts's buildDnsInventoryResponse() closely
// enough to exercise the real zone/page/sort query-param contract from the
// browser, instead of a single static JSON blob — zone switching and
// pagination are now real network round-trips, not client-side slicing.
function mockDnsResponse(zones: MockZone[], url: URL) {
  const zoneSummaries = zones.map((z) => ({
    zone_name: z.zone_name,
    record_count: z.records.length,
  }));
  const totalRecords = zoneSummaries.reduce((sum, z) => sum + z.record_count, 0);
  const totalDangling = zones.reduce(
    (sum, z) => sum + z.records.filter((r) => r.status === "critical").length,
    0,
  );

  const requestedZone = url.searchParams.get("zone");
  const selectedZoneName = requestedZone ?? zoneSummaries[0]?.zone_name ?? null;
  const zoneRecords = zones.find((z) => z.zone_name === selectedZoneName)?.records ?? [];

  const sortKey = url.searchParams.get("sort_key") ?? "name";
  const sortDir = url.searchParams.get("sort_dir") === "desc" ? -1 : 1;
  const sorted = [...zoneRecords].sort((a, b) => {
    const av = SORTS[sortKey](a);
    const bv = SORTS[sortKey](b);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return cmp * sortDir;
  });

  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("page_size") ?? "50");
  const start = (page - 1) * pageSize;
  const pageRecords = sorted.slice(start, start + pageSize);

  const critical = zoneRecords.find((r) => r.status === "critical") ?? null;

  // issue #504 — summed across the whole selected zone (matches worker/
  // modules/dns/routes.ts's real buildDnsInventoryResponse), not just
  // `pageRecords` — the frontend relies on this staying accurate once a
  // zone paginates.
  const statusCounts = { critical: 0, warning: 0, safe: 0, not_evaluated: 0 };
  for (const r of zoneRecords) {
    statusCounts[r.status as keyof typeof statusCounts]++;
  }

  return {
    run_id: "run-1",
    evaluated_at: "2026-08-07T12:00:00Z",
    total_records: totalRecords,
    total_dangling: totalDangling,
    zone_summaries: zoneSummaries,
    selected_zone: selectedZoneName,
    critical_finding: critical
      ? { record_name: critical.record_name, reason: critical.reason }
      : null,
    status_counts: statusCounts,
    records: pageRecords,
    records_pagination: {
      page,
      page_size: pageSize,
      total: zoneRecords.length,
      total_pages: Math.max(1, Math.ceil(zoneRecords.length / pageSize)),
    },
  };
}

function routeDnsInventory(page: import("@playwright/test").Page, zones: MockZone[]) {
  return page.route("**/api/dns/inventory*", (route) => {
    const url = new URL(route.request().url());
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDnsResponse(zones, url)),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/exposure/inventory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run_id: null, evaluated_at: null, workers: [] }),
    }));
  await routeDnsInventory(page, MOCK_ZONES);
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ modules: [], unavailable_sources: [] }),
    }));
  await page.route("**/api/workers/dashboard*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generated_at: "2026-08-07T12:00:00Z",
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
      }),
    }));
  await page.goto("/app");
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

test("US1 — every zone and every record in the (default, first) selected zone appears, none omitted", async ({ page }) => {
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

// issue #433 — the Finding column shows the design's fixed short labels,
// not the full reason sentence.
test("issue #433 — the Finding column shows the design's short labels, not full sentences", async ({ page }) => {
  const danglingRow = row(
    page,
    "example.com",
    "CNAME",
    "old-blog.example.com",
    "old-blog.herokuapp.com",
  );
  await expect(danglingRow.getByText("DANGLING")).toBeVisible();

  const originExposedRow = row(page, "example.com", "A", "api.example.com", "203.0.113.10");
  await expect(originExposedRow.getByText("ORIGIN EXPOSED")).toBeVisible();

  const publicRow = row(page, "example.com", "MX", "example.com", "10 mail.example.com");
  await expect(publicRow.getByText("PUBLIC")).toBeVisible();

  const okRow = row(page, "example.com", "CNAME", "docs.example.com", "example-docs.pages.dev");
  await expect(okRow.getByText("OK")).toBeVisible();

  // No full sentence leaks into the visible column text anywhere on the page.
  await expect(page.getByText("bypasses Cloudflare protection")).toHaveCount(0);
});

test("US2/AC3 — a record whose dangling status couldn't be determined renders as not_evaluated (N/A), never silently safe", async ({ page }) => {
  const naRow = row(page, "example.com", "A", "unknown.example.com", "203.0.113.20");
  // "N/A" now legitimately appears twice in this row — the status badge and
  // (issue #433) the Finding column's own short label for the same status.
  await expect(naRow.getByText("N/A")).toHaveCount(2);
  // The full reason is still available on hover via the title attribute.
  await expect(naRow.getByText("N/A").last()).toHaveAttribute(
    "title",
    "could not evaluate dangling-target status (Security Insights API error)",
  );
});

test("specs/013 US1 — zone tabs show name+count; selecting a different tab swaps the table, no reload", async ({ page }) => {
  await expect(page.getByRole("button", { name: "example.com" }).getByText("6", { exact: true }))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "second.example" }).getByText("1", { exact: true }))
    .toBeVisible();

  // Before switching: example.com's records visible, second.example's not.
  await expect(page.getByText("old-blog.example.com").first()).toBeVisible();
  await expect(page.getByTestId("findings-row-second.example:A:second.example:203.0.113.99"))
    .toHaveCount(0);

  await page.getByRole("button", { name: "second.example" }).click();

  await expect(page.getByTestId("findings-row-second.example:A:second.example:203.0.113.99"))
    .toBeVisible();
  // example.com's records are gone now that a different zone is selected.
  await expect(page.getByText("old-blog.example.com")).toHaveCount(0);
});

test("a status filter set on one zone doesn't silently carry over and hide another zone's records", async ({ page }) => {
  // example.com has exactly one critical record — filter down to it.
  await page.getByRole("button", { name: /CRITICAL 1/ }).click();
  await expect(page.getByText("old-blog.example.com").first()).toBeVisible();
  await expect(page.getByText("api.example.com")).toHaveCount(0);

  // second.example has zero critical records. If the "critical" filter
  // carried over, its own real (safe) record would stay hidden with no
  // visible chip left to un-toggle it (spec.md-adjacent bug, no spec —
  // pure regression coverage).
  await page.getByRole("button", { name: "second.example" }).click();

  await expect(page.getByTestId("findings-row-second.example:A:second.example:203.0.113.99"))
    .toBeVisible();
  await expect(page.getByText("No findings match this filter.")).toHaveCount(0);
});

test("specs/013 US2 — Proxy status and TTL render per record, distinct from the Finding status", async ({ page }) => {
  const proxiedRow = row(
    page,
    "example.com",
    "CNAME",
    "docs.example.com",
    "example-docs.pages.dev",
  );
  await expect(proxiedRow.getByText("PROXIED", { exact: true })).toBeVisible();
  await expect(proxiedRow.getByText("auto")).toBeVisible();

  const dnsOnlyRow = row(page, "example.com", "A", "api.example.com", "203.0.113.10");
  await expect(dnsOnlyRow.getByText("DNS ONLY")).toBeVisible();
  await expect(dnsOnlyRow.getByText("300")).toBeVisible();

  const naRow = row(page, "example.com", "MX", "example.com", "10 mail.example.com");
  await expect(naRow.getByText("N/A").first()).toBeVisible();
  await expect(naRow.getByText("3600")).toBeVisible();
});

test("specs/013 US3 — an ineffective DMARC policy is flagged as a warning on the _dmarc record", async ({ page }) => {
  const dmarcRow = row(page, "example.com", "TXT", "_dmarc.example.com", "v=DMARC1; p=none");
  await expect(dmarcRow.getByText("WARNING")).toBeVisible();
  // issue #433 — the design's own short label for this reason.
  await expect(dmarcRow.getByText("POLICY p=none")).toBeVisible();
  await expect(dmarcRow.getByText("POLICY p=none")).toHaveAttribute(
    "title",
    "DMARC policy provides no enforcement (p=none)",
  );
});

test("specs/013 US3 — a record pointing at a Cloudflare platform domain shows an informational label, not a warning", async ({ page }) => {
  const platformRow = row(
    page,
    "example.com",
    "CNAME",
    "docs.example.com",
    "example-docs.pages.dev",
  );
  await expect(platformRow.getByText("PUBLIC")).toBeVisible();
  // Informational only — this record's actual Finding status stays PROTECTED (safe), not a warning color.
  await expect(platformRow.getByText("PROTECTED")).toBeVisible();
});

// issue #473 — a long Name value (common for DKIM CNAME records) used to
// overflow its column unclipped, visually running into the Content column
// with no gap. The Content column already had whiteSpace:nowrap +
// overflow:hidden + textOverflow:ellipsis; Name was missing all three.
test("issue #473 — a long record name truncates instead of overflowing into the Content column", async ({ page }) => {
  await page.unroute("**/api/dns/inventory*");
  const longName = "5pdippb4nh4v5pnbugjuptke26iywsmr._domainkey.yugai.net";
  await routeDnsInventory(page, [...MOCK_ZONES, {
    zone_name: "yugai.net",
    records: [{
      record_name: longName,
      type: "CNAME",
      content: "dkim.mailprovider.example.com",
      proxy_capable: false,
      proxied: null,
      ttl: 3600,
      is_platform_target: false,
      status: "safe",
      reason: "not proxy-capable",
    }],
  }]);
  await page.goto("/app");
  await page.getByRole("button", { name: "DNS" }).click();
  await page.getByRole("button", { name: "yugai.net" }).click();

  const nameCell = row(page, "yugai.net", "CNAME", longName, "dkim.mailprovider.example.com")
    .locator("[title]").first();
  await expect(nameCell).toHaveAttribute("title", longName);
  const style = await nameCell.evaluate((el) => getComputedStyle(el).textOverflow);
  expect(style).toBe("ellipsis");
  // The clipped element's rendered box is narrower than its full text would
  // need — proof it's actually truncating, not just declaring the CSS.
  const { scrollWidth, clientWidth } = await nameCell.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);
});

test("specs/013 US1 — a zone with zero records shows its own empty state when selected", async ({ page }) => {
  await page.unroute("**/api/dns/inventory*");
  await routeDnsInventory(page, [...MOCK_ZONES, { zone_name: "empty.example", records: [] }]);
  await page.goto("/app");
  await page.getByRole("button", { name: "DNS" }).click();
  await page.getByRole("button", { name: "empty.example" }).click();

  await expect(page.getByText("No DNS records in empty.example")).toBeVisible();
});

test("specs/020 US2 — a zone's records paginate: page footer, next/prev, boundary disabled states", async ({ page }) => {
  const bigZone: MockZone = {
    zone_name: "big.example",
    records: Array.from({ length: 5 }, (_, i) => ({
      record_name: `r${i}.big.example`,
      type: "A",
      content: `10.0.0.${i}`,
      proxy_capable: true,
      proxied: false,
      ttl: 300,
      is_platform_target: false,
      status: "safe",
      reason: "proxied through Cloudflare",
    })),
  };
  await page.unroute("**/api/dns/inventory*");
  await page.route("**/api/dns/inventory*", (route) => {
    const url = new URL(route.request().url());
    const body = mockDnsResponse([bigZone], url);
    // Force a small page size so 5 records need multiple pages, without a
    // real backend page_size query param round-trip in this test.
    const pageSize = 2;
    const page_ = Number(url.searchParams.get("page") ?? "1");
    const start = (page_ - 1) * pageSize;
    body.records = bigZone.records.slice(start, start + pageSize) as typeof body.records;
    body.records_pagination = {
      page: page_,
      page_size: pageSize,
      total: bigZone.records.length,
      total_pages: Math.ceil(bigZone.records.length / pageSize),
    };
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/app");
  await page.getByRole("button", { name: "DNS" }).click();

  await expect(row(page, "big.example", "A", "r0.big.example", "10.0.0.0")).toBeVisible();
  await expect(row(page, "big.example", "A", "r2.big.example", "10.0.0.2")).not.toBeVisible();
  await expect(page.getByTestId("pagination-status")).toHaveText("5 total · page 1 of 3");
  await expect(page.getByTestId("pagination-prev")).toBeDisabled();

  await page.getByTestId("pagination-next").click();
  await expect(row(page, "big.example", "A", "r2.big.example", "10.0.0.2")).toBeVisible();
  await expect(page.getByTestId("pagination-status")).toHaveText("5 total · page 2 of 3");
});

test("issue #504 — a paginated zone still shows accurate status counts, summed across the whole zone", async ({ page }) => {
  const bigZone: MockZone = {
    zone_name: "big.example",
    records: [
      ...Array.from({ length: 3 }, (_, i) => ({
        record_name: `warn${i}.big.example`,
        type: "A",
        content: `10.0.0.${i}`,
        proxy_capable: true,
        proxied: false,
        ttl: 300,
        is_platform_target: false,
        status: "warning" as const,
        reason: "DNS-only — bypasses Cloudflare protection",
      })),
      {
        record_name: "safe.big.example",
        type: "A",
        content: "10.0.0.9",
        proxy_capable: true,
        proxied: true,
        ttl: 300,
        is_platform_target: false,
        status: "safe" as const,
        reason: "proxied through Cloudflare",
      },
    ],
  };
  await page.unroute("**/api/dns/inventory*");
  await page.route("**/api/dns/inventory*", (route) => {
    const url = new URL(route.request().url());
    const body = mockDnsResponse([bigZone], url);
    // Force pagination with a page size smaller than the fixture's own
    // 4 records, without a real backend page_size round-trip in this test.
    const pageSize = 2;
    const page_ = Number(url.searchParams.get("page") ?? "1");
    const start = (page_ - 1) * pageSize;
    body.records = bigZone.records.slice(start, start + pageSize) as typeof body.records;
    body.records_pagination = {
      page: page_,
      page_size: pageSize,
      total: bigZone.records.length,
      total_pages: Math.ceil(bigZone.records.length / pageSize),
    };
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/app");
  await page.getByRole("button", { name: "DNS" }).click();

  // Only 2 of the 4 records are on this page (1 warning + 1 safe), but the
  // badge row must reflect the whole zone (3 warning + 1 safe) — the whole
  // point of sourcing it from the backend's whole-zone status_counts
  // instead of FindingsTable's own (hidden-under-pagination) page-local
  // chips.
  await expect(page.getByTestId("zone-status-count-warning")).toHaveText("WARNING3");
  await expect(page.getByTestId("zone-status-count-safe")).toHaveText("PROTECTED1");
});

test("specs/020 US2 — switching zones resets to page 1", async ({ page }) => {
  await page.getByRole("button", { name: "second.example" }).click();
  await expect(page.getByTestId("findings-row-second.example:A:second.example:203.0.113.99"))
    .toBeVisible();
  // A small, single-page zone shows no pagination footer at all (FR-004).
  await expect(page.getByTestId("pagination-footer")).not.toBeVisible();
});

test("US1 — re-scan refreshes the page's findings without a reload (FR-001..FR-003)", async ({ page }) => {
  await expect(page.getByText("old-blog.example.com").first()).toBeVisible();

  await page.route("**/api/dns/evaluate", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ run_id: "run-2" }),
    });
  });
  const RESCANNED_ZONES: MockZone[] = [
    {
      zone_name: "example.com",
      records: [
        {
          record_name: "new-record.example.com",
          type: "A",
          content: "203.0.113.30",
          proxy_capable: true,
          proxied: true,
          ttl: 1,
          is_platform_target: false,
          status: "safe",
          reason: "proxied through Cloudflare",
        },
      ],
    },
  ];
  await routeDnsInventory(page, RESCANNED_ZONES);

  const button = page.getByRole("button", { name: "Re-scan" });
  await button.click();
  await expect(page.getByRole("button", { name: "Scanning…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-scan" })).toBeEnabled();
  await expect(page.getByText("new-record.example.com")).toBeVisible();
  await expect(page.getByText("old-blog.example.com")).not.toBeVisible();
});

test("re-scan failure leaves existing data untouched and shows an inline error (FR-005)", async ({ page }) => {
  await page.route(
    "**/api/dns/evaluate",
    (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({}) }),
  );

  await page.getByRole("button", { name: "Re-scan" }).click();

  await expect(page.getByText("Re-scan failed:", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-scan" })).toBeEnabled();
  await expect(page.getByText("old-blog.example.com").first()).toBeVisible();
});
