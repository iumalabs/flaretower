import { assertEquals } from "@std/assert";
import { CLOUDFLARE_PERMISSION_GROUP_NAMES } from "../../app/lib/cloudflare-permission-groups.ts";
import {
  comparePolicies,
  type ParsedTokenPayload,
  parseTokenPayload,
  renderChecklist,
  toReusablePayload,
} from "../../app/lib/token-permissions.ts";

function payload(policies: unknown[]): string {
  return JSON.stringify({ policies });
}

function policy(
  permissionGroups: { id: string; name?: string }[],
  resources: Record<string, string>,
) {
  return { effect: "allow", permission_groups: permissionGroups, resources };
}

Deno.test("parseTokenPayload - rejects non-JSON input", () => {
  const result = parseTokenPayload("not json at all {{{");
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error.includes("valid JSON"), true);
});

Deno.test("parseTokenPayload - rejects JSON missing a policies array", () => {
  const result = parseTokenPayload(JSON.stringify({ name: "some token" }));
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error.includes("policies"), true);
});

Deno.test("parseTokenPayload - rejects an empty policies array", () => {
  const result = parseTokenPayload(payload([]));
  assertEquals(result.ok, false);
});

Deno.test("parseTokenPayload - rejects a policy missing effect", () => {
  const result = parseTokenPayload(
    payload([{ permission_groups: [], resources: {} }]),
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error.includes("effect"), true);
});

Deno.test("parseTokenPayload - rejects a policy whose permission_groups isn't an array", () => {
  const result = parseTokenPayload(
    payload([{ effect: "allow", permission_groups: "nope", resources: {} }]),
  );
  assertEquals(result.ok, false);
});

Deno.test("parseTokenPayload - rejects a permission_groups entry missing a string id", () => {
  const result = parseTokenPayload(
    payload([{ effect: "allow", permission_groups: [{ name: "no id" }], resources: {} }]),
  );
  assertEquals(result.ok, false);
});

Deno.test("parseTokenPayload - parses a valid single-policy payload, preserving an inline name", () => {
  const result = parseTokenPayload(
    payload([
      policy([{ id: "abc123", name: "Workers Scripts Read" }], {
        "com.cloudflare.api.account.acct1": "*",
      }),
    ]),
  );
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.policies, [
      {
        effect: "allow",
        permissionGroups: [{ id: "abc123", name: "Workers Scripts Read" }],
        resources: { "com.cloudflare.api.account.acct1": "*" },
      },
    ]);
  }
});

Deno.test("parseTokenPayload - leaves name undefined when the input omits it (real-world common case)", () => {
  const result = parseTokenPayload(payload([policy([{ id: "abc123" }], {})]));
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.policies[0].permissionGroups[0].name, undefined);
  }
});

Deno.test("renderChecklist - resolves a display name from the input's own inline name first", () => {
  const items = renderChecklist([
    {
      effect: "allow",
      permissionGroups: [{ id: "abc123", name: "Custom Inline Name" }],
      resources: {},
    },
  ]);
  assertEquals(items, [{
    id: "abc123",
    name: "Custom Inline Name",
    recognized: true,
    effect: "allow",
  }]);
});

Deno.test("renderChecklist - resolves via the curated lookup table when the input has no inline name", () => {
  // CLOUDFLARE_PERMISSION_GROUP_NAMES is currently empty (see its own
  // file comment — no verified real IDs available yet); this test proves
  // the lookup path itself works correctly once entries do exist, without
  // depending on any specific real ID being present.
  const testId = "test-only-id-not-a-real-cloudflare-permission-group";
  CLOUDFLARE_PERMISSION_GROUP_NAMES[testId] = "Test Permission Group";
  try {
    const items = renderChecklist([
      { effect: "allow", permissionGroups: [{ id: testId }], resources: {} },
    ]);
    assertEquals(items, [{
      id: testId,
      name: "Test Permission Group",
      recognized: true,
      effect: "allow",
    }]);
  } finally {
    delete CLOUDFLARE_PERMISSION_GROUP_NAMES[testId];
  }
});

Deno.test("renderChecklist - falls back to the raw id, marked unrecognized, for an unknown group", () => {
  const items = renderChecklist([
    { effect: "allow", permissionGroups: [{ id: "totally-unknown-id" }], resources: {} },
  ]);
  assertEquals(items, [{
    id: "totally-unknown-id",
    name: "totally-unknown-id",
    recognized: false,
    effect: "allow",
  }]);
});

Deno.test("renderChecklist - flattens permission groups across multiple policies", () => {
  const items = renderChecklist([
    { effect: "allow", permissionGroups: [{ id: "a" }], resources: {} },
    { effect: "allow", permissionGroups: [{ id: "b" }], resources: {} },
  ]);
  assertEquals(items.map((i) => i.id), ["a", "b"]);
});

Deno.test("toReusablePayload - drops name/meta and per-token metadata, keeps id+resources", () => {
  const policies: ParsedTokenPayload = [
    {
      effect: "allow",
      permissionGroups: [{ id: "abc123", name: "Some Name" }],
      resources: { "com.cloudflare.api.account.acct1": "*" },
    },
  ];
  assertEquals(toReusablePayload(policies), {
    policies: [
      {
        effect: "allow",
        permission_groups: [{ id: "abc123" }],
        resources: { "com.cloudflare.api.account.acct1": "*" },
      },
    ],
  });
});

Deno.test("comparePolicies - identical payloads match on both dimensions", () => {
  const a: ParsedTokenPayload = [
    { effect: "allow", permissionGroups: [{ id: "a" }], resources: { "acct.1": "*" } },
  ];
  const b: ParsedTokenPayload = [
    { effect: "allow", permissionGroups: [{ id: "a" }], resources: { "acct.1": "*" } },
  ];
  const result = comparePolicies(a, b);
  assertEquals(result.permissionGroups.matches, true);
  assertEquals(result.resources.matches, true);
});

Deno.test("comparePolicies - surfaces a permission-group-only difference", () => {
  const a: ParsedTokenPayload = [
    { effect: "allow", permissionGroups: [{ id: "a" }, { id: "b" }], resources: { "acct.1": "*" } },
  ];
  const b: ParsedTokenPayload = [
    { effect: "allow", permissionGroups: [{ id: "a" }], resources: { "acct.1": "*" } },
  ];
  const result = comparePolicies(a, b);
  assertEquals(result.permissionGroups, {
    onlyInA: [{ id: "b", effect: "allow" }],
    onlyInB: [],
    matches: false,
  });
  assertEquals(result.resources.matches, true);
});

Deno.test("comparePolicies - surfaces a resources-only difference even when permission groups match (research.md §3)", () => {
  const a: ParsedTokenPayload = [
    {
      effect: "allow",
      permissionGroups: [{ id: "a" }],
      resources: { "com.cloudflare.api.account.acct1": "*" },
    },
  ];
  const b: ParsedTokenPayload = [
    {
      effect: "allow",
      permissionGroups: [{ id: "a" }],
      resources: { "com.cloudflare.api.account.acct2": "*" },
    },
  ];
  const result = comparePolicies(a, b);
  assertEquals(result.permissionGroups.matches, true);
  assertEquals(result.resources.matches, false);
  assertEquals(result.resources.onlyInA, ["com.cloudflare.api.account.acct1"]);
  assertEquals(result.resources.onlyInB, ["com.cloudflare.api.account.acct2"]);
});

Deno.test("comparePolicies - both dimensions differ", () => {
  const a: ParsedTokenPayload = [
    { effect: "allow", permissionGroups: [{ id: "a" }], resources: { "acct.1": "*" } },
  ];
  const b: ParsedTokenPayload = [
    { effect: "allow", permissionGroups: [{ id: "c" }], resources: { "acct.2": "*" } },
  ];
  const result = comparePolicies(a, b);
  assertEquals(result.permissionGroups.matches, false);
  assertEquals(result.resources.matches, false);
});

// --- Phase 6 convergence regressions (T013, T014) ---

Deno.test("renderChecklist - marks a deny-effect policy's permission group as denied, not granted (T013 regression)", () => {
  const items = renderChecklist([
    {
      effect: "deny",
      permissionGroups: [{ id: "abc123", name: "Workers Scripts Write" }],
      resources: {},
    },
  ]);
  // A deny-effect policy must never render identically to a granted
  // (allow-effect) one — the checklist item needs to carry the policy's
  // effect so the UI can show this permission as denied, not granted.
  assertEquals(items, [{
    id: "abc123",
    name: "Workers Scripts Write",
    recognized: true,
    effect: "deny",
  }]);
});

Deno.test("comparePolicies - a permission group present under opposite effects on each side is a mismatch (T014 regression)", () => {
  const a: ParsedTokenPayload = [
    { effect: "allow", permissionGroups: [{ id: "a" }], resources: {} },
  ];
  const b: ParsedTokenPayload = [
    { effect: "deny", permissionGroups: [{ id: "a" }], resources: {} },
  ];
  const result = comparePolicies(a, b);
  // Same group id on both sides, but one token grants it and the other
  // denies it — these must NOT be reported as matching.
  assertEquals(result.permissionGroups.matches, false);
  assertEquals(result.permissionGroups.onlyInA, [{ id: "a", effect: "allow" }]);
  assertEquals(result.permissionGroups.onlyInB, [{ id: "a", effect: "deny" }]);
});
