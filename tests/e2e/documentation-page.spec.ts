import { expect, test } from "@playwright/test";

// spec 028 Phase 5 (tasks.md T023, issue #508) — quickstart.md Scenarios 4
// and 5: /docs is public and accurate, and round-tripping between it and
// the landing page never prompts for a session. Not using the shared
// ./fixtures.ts session mock (which defaults to authenticated) — /docs
// must be reachable and identical regardless of session state (spec.md
// Edge Cases), so tests here exercise the unauthenticated case explicitly.

// Same stand-in as deep-link-routes.spec.ts uses: the local vite dev server
// has no SPA fallback for a bare GET to a non-root path (production's
// Cloudflare Workers Assets does), so a direct `page.goto("/docs")` 404s
// locally. Fulfilling that one navigation request with the already-working
// shell HTML isolates what's actually under test — that /docs itself
// renders correctly once loaded, not that production's asset-serving layer
// works (out of scope for this suite).
async function mockDeepLinkShell(page: import("@playwright/test").Page, path: string) {
  const shell = await (await page.request.get("/")).text();
  await page.route(
    `**${path}`,
    (route) => route.fulfill({ status: 200, contentType: "text/html", body: shell }),
  );
}

test.beforeEach(async ({ page }) => {
  await page.route(
    "**/api/identity/session",
    (route) => route.fulfill({ status: 403, contentType: "text/plain", body: "Forbidden" }),
  );
});

test("/docs renders directly with no sign-in prompt, even reached without going through the landing page", async ({ page }) => {
  await mockDeepLinkShell(page, "/docs");
  await page.goto("/docs");

  await expect(page.getByRole("heading", { name: "Documentation", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "SIGN IN" })).toBeVisible();
  // "no sign-in prompt" — the header's own Sign In button doesn't count as
  // a prompt (spec.md AC1); there must be no modal/overlay blocking the
  // page content itself.
  await expect(page.getByRole("heading", { name: "What FlareTower is" })).toBeVisible();
});

test("every table-of-contents entry scrolls the page to its matching section", async ({ page }) => {
  await mockDeepLinkShell(page, "/docs");
  await page.goto("/docs");

  const sections = [
    "What FlareTower is",
    "Deploy it",
    "Sign-in: Cloudflare Access only",
    "Token scopes the scanner needs",
    "How a scan works",
    "What each screen shows",
    "Status vocabulary",
    "How Security Posture checks work",
    "Limits and retention",
  ];

  for (const title of sections) {
    await page.getByRole("link", { name: new RegExp(title, "i") }).click();
    // Not exact: the heading's accessible name is "01What FlareTower is"
    // etc. (the section number span has no separating space from the
    // title in the DOM) — substring matching is what every other
    // assertion in this file already relies on for the same reason.
    await expect(page.getByRole("heading", { name: new RegExp(title, "i") })).toBeInViewport();
  }
});

test("issue #508/quickstart Scenario 4 — the Deploy it section matches this repo's real commands, no fictional CLI", async ({ page }) => {
  await mockDeepLinkShell(page, "/docs");
  await page.goto("/docs");

  const deploySection = page.locator("#deploy-it");
  await expect(deploySection.getByText("deno task deploy", { exact: false })).toBeVisible();
  await expect(deploySection.getByText("wrangler secret put CF_API_TOKEN", { exact: false }))
    .toBeVisible();
  // The design mock's own fictional CLI this section replaced.
  await expect(page.getByText("npx flaretower")).toHaveCount(0);
  await expect(page.getByText("FT_STATE")).toHaveCount(0);
});

test("issue #508/quickstart Scenario 4 — What each screen shows lists every current nav item, worded identically", async ({ page }) => {
  await mockDeepLinkShell(page, "/docs");
  await page.goto("/docs");

  const screensSection = page.locator("#screens");
  for (
    const label of [
      "Overview",
      "Workers",
      "Exposure",
      "DNS",
      "Zero Trust",
      "Pages",
      "R2 / KV / D1",
      "Security Posture",
      "Audit & Drift",
      "Token Tools",
    ]
  ) {
    await expect(screensSection.getByText(label, { exact: true })).toBeVisible();
  }
});

test("issue #508/quickstart Scenario 4 — the Sign-in section describes Access's own JWT header, no invented OIDC protocol detail", async ({ page }) => {
  await mockDeepLinkShell(page, "/docs");
  await page.goto("/docs");

  const signInSection = page.locator("#sign-in");
  await expect(signInSection.getByText("Cf-Access-Jwt-Assertion", { exact: false })).toBeVisible();
  await expect(signInSection.getByText("Access itself challenges", { exact: false }))
    .toBeVisible();
  // "issuer"/"scope"/"callback" legitimately appear in this section's own
  // prose denying that FlareTower has any of its own to describe ("There is
  // no issuer, scope, or callback path to describe here") — what FR-006
  // actually prohibits is presenting fake protocol *values*, the design
  // mock's original fake modal's exact shape (a labeled ISSUER/SCOPES/
  // CALLBACK key-value list). Nothing on this page renders that shape.
  await expect(page.getByText(/oauth|oidc/i)).toHaveCount(0);
});

test("quickstart Scenario 5 — landing → docs → back, no sign-in prompt at any point", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /every door into your cloudflare account/i }))
    .toBeVisible();

  await page.getByRole("button", { name: "DOCUMENTATION" }).first().click();
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole("heading", { name: "Documentation", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "← BACK" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /every door into your cloudflare account/i }))
    .toBeVisible();
});

test("Sign in from the documentation page behaves the same as from the landing page", async ({ page }) => {
  const shell = await (await page.request.get("/")).text();
  // issue #516 — SIGN_IN_PATH is "/app" now, Overview's own real URL.
  await page.route(
    "**/app",
    (route) => route.fulfill({ status: 200, contentType: "text/html", body: shell }),
  );

  await mockDeepLinkShell(page, "/docs");
  await page.goto("/docs");
  await page.getByRole("button", { name: "SIGN IN" }).click();

  await expect(page).toHaveURL(/\/app$/);
});
