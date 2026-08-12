import { expect, test } from "@playwright/test";

const MOCK_SUMMARY = {
  modules: [
    {
      module: "exposure",
      kind: "hostname",
      has_data: true,
      counts: { safe: 2, warning: 0, critical: 1, not_evaluated: 0 },
    },
    {
      module: "dns",
      kind: "record",
      has_data: true,
      counts: { safe: 5, warning: 0, critical: 0, not_evaluated: 0 },
    },
  ],
  unavailable_sources: [],
};

const EMPTY_INVENTORY = { run_id: null, evaluated_at: null, workers: [] };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SUMMARY),
    }));
  // Every page's own inventory fetch just needs to resolve so the shell
  // around it renders — the module pages' own content isn't this spec's
  // concern (see the per-module e2e specs for that).
  await page.route(
    "**/api/exposure/inventory",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(EMPTY_INVENTORY),
      }),
  );
  // "overview" is the default page (tasks.md T033) — it fetches these too.
  await page.route("**/api/audit/alerts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ alerts: [], unavailable_sources: [] }),
    }));
  await page.route("**/api/audit/changes", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ since: "", until: "", changes: [], unavailable_sources: [] }),
    }));
  await page.goto("/");
});

test("US1/AC1 — favicon link is present", async ({ page }) => {
  const favicon = page.locator('link[rel="icon"]');
  await expect(favicon).toHaveAttribute("href", "/favicon.svg");
});

test("US1/AC2 — sidebar renders the logo and all 8 destinations", async ({ page }) => {
  await expect(page.getByText("FlareTower")).toBeVisible();
  for (
    const label of [
      "Overview",
      "Workers & Access",
      "DNS",
      "Zero Trust",
      "Pages",
      "R2 / KV / D1",
      "Security Posture",
      "Audit & Drift",
    ]
  ) {
    await expect(page.getByRole("button", { name: label })).toBeVisible();
  }
});

test("US1/AC3 — the active-state indicator moves to whichever page is current", async ({ page }) => {
  const overviewButton = page.getByRole("button", { name: "Overview" });
  const exposureButton = page.getByRole("button", { name: "Workers & Access" });

  // "overview" is the app's default/initial page (tasks.md T033, User
  // Story 3).
  await expect(overviewButton).toHaveAttribute("aria-current", "page");
  await expect(exposureButton).not.toHaveAttribute("aria-current", "page");

  await exposureButton.click();

  await expect(exposureButton).toHaveAttribute("aria-current", "page");
  await expect(overviewButton).not.toHaveAttribute("aria-current", "page");
});

test("US1/AC4 — a module's nav badge shows only when its critical count is > 0", async ({ page }) => {
  const exposureButton = page.getByRole("button", { name: "Workers & Access" });
  const dnsButton = page.getByRole("button", { name: "DNS" });

  // exposure has 1 critical finding in MOCK_SUMMARY -> badge "1" visible.
  await expect(exposureButton.getByText("1", { exact: true })).toBeVisible();
  // dns has 0 critical findings -> no badge text at all inside its button.
  await expect(dnsButton.locator("span").filter({ hasText: /^\d+$/ })).toHaveCount(0);
});

test("US1/AC5 — rendered text uses IBM Plex Sans/Mono, not a fallback font", async ({ page }) => {
  // Computed font-family on body (--font-sans) resolves to the real
  // family, not silently falling through to its system-ui fallback.
  const sansFamily = await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily);
  expect(sansFamily).toContain("IBM Plex Sans");

  // Computed font-family on the sidebar footer (--font-mono).
  const monoFamily = await page.getByText("self-hosted").evaluate((el) =>
    getComputedStyle(el).fontFamily
  );
  expect(monoFamily).toContain("IBM Plex Mono");

  // The strongest signal the actual .woff2 files loaded (not just that the
  // CSS declares the right family name — @font-face registers a FontFace
  // in document.fonts as soon as it's parsed, even if the underlying file
  // request later 404s/403s, so checking family names alone is a false-
  // positive risk; each FontFace's own `.status` is what actually proves
  // the bytes were fetched).
  await page.evaluate(() => document.fonts.ready);
  const statuses = await page.evaluate(() =>
    Array.from(document.fonts)
      .filter((f) => f.family.includes("IBM Plex"))
      .map((f) => ({ family: f.family, status: f.status }))
  );
  // At least one Sans and one Mono weight actually rendered on this page
  // (the weights the page doesn't use may legitimately stay "unloaded" —
  // browsers fetch font files lazily, only for weights actually needed to
  // paint) must have genuinely fetched, not just registered the name.
  expect(statuses.some((f) => f.family.includes("IBM Plex Sans") && f.status === "loaded"))
    .toBe(true);
  expect(statuses.some((f) => f.family.includes("IBM Plex Mono") && f.status === "loaded"))
    .toBe(true);
});
