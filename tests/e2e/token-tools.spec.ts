import { expect, test } from "@playwright/test";

const MOCK_SUMMARY = { modules: [], unavailable_sources: [] };

const VALID_PAYLOAD = JSON.stringify({
  policies: [
    {
      effect: "allow",
      permission_groups: [
        { id: "abc123", name: "Workers Scripts Read" },
        { id: "unknown-group-id" },
      ],
      resources: { "com.cloudflare.api.account.acct1": "*" },
    },
  ],
});

const VALID_PAYLOAD_DIFFERENT_RESOURCES = JSON.stringify({
  policies: [
    {
      effect: "allow",
      permission_groups: [{ id: "abc123", name: "Workers Scripts Read" }, {
        id: "unknown-group-id",
      }],
      resources: { "com.cloudflare.api.account.acct2": "*" },
    },
  ],
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/audit/summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SUMMARY),
    }));
  await page.goto("/");
  await page.getByRole("button", { name: "Token Tools" }).click();
});

test("US1 — pasting a valid payload renders a checklist naming recognized and unrecognized groups", async ({ page }) => {
  await page.getByLabel("Source token permission payload").fill(VALID_PAYLOAD);

  // Scoped to <li> elements specifically — the raw pasted JSON (visible
  // verbatim inside the source textarea) also contains this exact
  // substring, so an unscoped page.getByText() strict-mode-violates by
  // matching both.
  await expect(page.locator("li", { hasText: "Workers Scripts Read" })).toBeVisible();
  await expect(
    page.locator("li", { hasText: "unknown-group-id (unrecognized permission group)" }),
  ).toBeVisible();
});

test("US1 — pasting a valid payload produces a reusable payload without name/meta fields", async ({ page }) => {
  await page.getByLabel("Source token permission payload").fill(VALID_PAYLOAD);

  const output = page.getByLabel("Payload to paste into Cloudflare's token-creation flow");
  await expect(output).toBeVisible();
  const value = await output.inputValue();
  const parsed = JSON.parse(value);
  assertReusablePayloadShape(parsed);
});

function assertReusablePayloadShape(parsed: unknown) {
  const policies =
    (parsed as { policies: { permission_groups: { id: string; name?: string }[] }[] })
      .policies;
  for (const policy of policies) {
    for (const group of policy.permission_groups) {
      if ("name" in group) throw new Error("reusable payload must not carry inline name");
    }
  }
}

test("US1/AC3 — invalid input shows a specific error, not a blank result", async ({ page }) => {
  await page.getByLabel("Source token permission payload").fill("not valid json {{{");

  await expect(page.getByText(/valid JSON/)).toBeVisible();
});

test("US1 — this page never sends a network request while in use", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (!url.includes("/api/audit/summary")) requests.push(url);
  });

  await page.getByLabel("Source token permission payload").fill(VALID_PAYLOAD);
  await page.getByRole("button", { name: "Compare two tokens" }).click();
  await page.getByLabel("Token A permission payload").fill(VALID_PAYLOAD);
  await page.getByLabel("Token B permission payload").fill(VALID_PAYLOAD);
  await page.waitForTimeout(200);

  expect(requests).toEqual([]);
});

test("US2 — two identical payloads report a match", async ({ page }) => {
  await page.getByRole("button", { name: "Compare two tokens" }).click();
  await page.getByLabel("Token A permission payload").fill(VALID_PAYLOAD);
  await page.getByLabel("Token B permission payload").fill(VALID_PAYLOAD);

  await expect(page.getByText("These tokens match")).toBeVisible();
});

test("US2 — payloads with matching permission groups but different resources surface a resources-only mismatch", async ({ page }) => {
  await page.getByRole("button", { name: "Compare two tokens" }).click();
  await page.getByLabel("Token A permission payload").fill(VALID_PAYLOAD);
  await page.getByLabel("Token B permission payload").fill(VALID_PAYLOAD_DIFFERENT_RESOURCES);

  await expect(page.getByText("These tokens differ")).toBeVisible();
  await expect(page.getByText("Resources differ:")).toBeVisible();
  await expect(page.getByText(/Permission groups differ/)).toHaveCount(0);
});
