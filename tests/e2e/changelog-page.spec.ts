import { expect, test } from "@playwright/test";

// issue #528 — a public changelog page at /changelog, rendering the repo's
// real CHANGELOG.md (mocked here with fixed sample content for determinism —
// vite.config.ts's changelogPlugin is what serves the real file in dev/
// prod) rather than a hand-authored duplicate. Not using the shared
// ./fixtures.ts session mock (which defaults to authenticated) — /changelog
// must be reachable and identical regardless of session state, same as
// /docs (documentation-page.spec.ts's own convention).

const SAMPLE_CHANGELOG = `# Changelog

## [1.2.0](https://github.com/iumalabs/flaretower/compare/v1.1.0...v1.2.0) (2026-08-20)


### Features

* **audit:** account-wide activity feed ([#280](https://github.com/iumalabs/flaretower/issues/280)) ([abc1234](https://github.com/iumalabs/flaretower/commit/abc1234def567890abc1234def567890abc1234))


## [1.1.0](https://github.com/iumalabs/flaretower/compare/v1.0.0...v1.1.0) (2026-08-13)


### Bug Fixes

* fix a thing ([#123](https://github.com/iumalabs/flaretower/issues/123)) ([def5678](https://github.com/iumalabs/flaretower/commit/def5678abc1234567890def5678abc123456789))
`;

// Same stand-in as deep-link-routes.spec.ts/documentation-page.spec.ts use:
// the local vite dev server has no SPA fallback for a bare GET to a
// non-root path, so a direct `page.goto("/changelog")` 404s locally.
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
  await page.route(
    "**/CHANGELOG.md",
    (route) => route.fulfill({ status: 200, contentType: "text/markdown", body: SAMPLE_CHANGELOG }),
  );
});

test("/changelog renders the real CHANGELOG.md content, no sign-in prompt", async ({ page }) => {
  await mockDeepLinkShell(page, "/changelog");
  await page.goto("/changelog");

  await expect(page.getByRole("heading", { name: "Changelog", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "SIGN IN" })).toBeVisible();
  await expect(page.getByText("v1.2.0")).toBeVisible();
  await expect(page.getByText("v1.1.0")).toBeVisible();
  await expect(page.getByText("account-wide activity feed", { exact: false })).toBeVisible();
});

test("each release links its version to the real GitHub compare URL", async ({ page }) => {
  await mockDeepLinkShell(page, "/changelog");
  await page.goto("/changelog");

  await expect(page.getByRole("link", { name: "v1.2.0" })).toHaveAttribute(
    "href",
    "https://github.com/iumalabs/flaretower/compare/v1.1.0...v1.2.0",
  );
});

test("issue/commit references render as real, clickable links, not raw markdown", async ({ page }) => {
  await mockDeepLinkShell(page, "/changelog");
  await page.goto("/changelog");

  await expect(page.getByRole("link", { name: "#280" })).toHaveAttribute(
    "href",
    "https://github.com/iumalabs/flaretower/issues/280",
  );
  await expect(page.getByText("[#280]", { exact: false })).toHaveCount(0);
});

test("a **scope:** prefix renders as bold text, not raw asterisks", async ({ page }) => {
  await mockDeepLinkShell(page, "/changelog");
  await page.goto("/changelog");

  await expect(page.getByText("**audit:**", { exact: false })).toHaveCount(0);
  await expect(page.locator("strong", { hasText: "audit:" })).toBeVisible();
});

test("a fetch failure shows an explicit error, not a blank page", async ({ page }) => {
  await page.unroute("**/CHANGELOG.md");
  await page.route(
    "**/CHANGELOG.md",
    (route) => route.fulfill({ status: 500, contentType: "text/plain", body: "error" }),
  );
  await mockDeepLinkShell(page, "/changelog");
  await page.goto("/changelog");

  await expect(page.getByText("GET /CHANGELOG.md failed: 500", { exact: false })).toBeVisible();
});

test("landing → changelog → back, no sign-in prompt at any point", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /every door into your cloudflare account/i }))
    .toBeVisible();

  await page.getByRole("button", { name: "CHANGELOG" }).first().click();
  await expect(page).toHaveURL(/\/changelog$/);
  await expect(page.getByRole("heading", { name: "Changelog", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "← BACK" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /every door into your cloudflare account/i }))
    .toBeVisible();
});

test("Changelog is reachable from the documentation page, and back again", async ({ page }) => {
  await mockDeepLinkShell(page, "/docs");
  await page.goto("/docs");

  await page.getByRole("button", { name: "CHANGELOG" }).click();
  await expect(page).toHaveURL(/\/changelog$/);

  await page.getByRole("button", { name: "DOCUMENTATION" }).click();
  await expect(page).toHaveURL(/\/docs$/);
});

test("Sign in from the changelog page behaves the same as from the landing page", async ({ page }) => {
  const shell = await (await page.request.get("/")).text();
  await page.route(
    "**/app",
    (route) => route.fulfill({ status: 200, contentType: "text/html", body: shell }),
  );

  await mockDeepLinkShell(page, "/changelog");
  await page.goto("/changelog");
  await page.getByRole("button", { name: "SIGN IN" }).click();

  await expect(page).toHaveURL(/\/app$/);
});
