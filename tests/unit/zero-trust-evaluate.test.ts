import { assertEquals } from "@std/assert";
import {
  evaluateApplication,
  evaluateServiceToken,
} from "../../worker/modules/zero-trust/evaluate.ts";
import type { AccessApplication, AccessPolicy } from "../../worker/modules/zero-trust/types.ts";

function app(policies: AccessPolicy[]): AccessApplication {
  return {
    appId: "app-1",
    appName: "test-app",
    appDomain: "example.com",
    policies,
    coveredHostnames: ["example.com"],
    sessionDuration: "24h",
  };
}

function scopedPolicy(): AccessPolicy {
  return {
    decision: "allow",
    includesEveryone: false,
    hasScopedInclude: true,
    include: [{ email_domain: { domain: "example.com" } }],
    require: [],
  };
}

function everyonePolicy(): AccessPolicy {
  return {
    decision: "allow",
    includesEveryone: true,
    hasScopedInclude: false,
    include: [{ everyone: {} }],
    require: [],
  };
}

Deno.test("evaluateApplication - not_evaluated when the application has an evaluationError", () => {
  const result = evaluateApplication({ ...app([]), evaluationError: "could not list apps" });
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateApplication - warning when a policy allows Everyone", () => {
  const result = evaluateApplication(app([everyonePolicy()]));
  assertEquals(result.status, "warning");
});

Deno.test("evaluateApplication - warning when a policy is Bypass, regardless of includes", () => {
  const result = evaluateApplication(
    app([{
      decision: "bypass",
      includesEveryone: false,
      hasScopedInclude: true,
      include: [],
      require: [],
    }]),
  );
  assertEquals(result.status, "warning");
});

Deno.test("evaluateApplication - warning when there are zero policies attached", () => {
  const result = evaluateApplication(app([]));
  assertEquals(result.status, "warning");
  assertEquals(result.reason, "no policies attached");
});

Deno.test("evaluateApplication - safe when the only policy is scoped (not Everyone)", () => {
  const result = evaluateApplication(app([scopedPolicy()]));
  assertEquals(result.status, "safe");
});

Deno.test("evaluateApplication - a Deny policy targeting Everyone is NOT open (decision matters, not just the selector)", () => {
  const result = evaluateApplication(
    app([{
      decision: "deny",
      includesEveryone: true,
      hasScopedInclude: false,
      include: [{ everyone: {} }],
      require: [],
    }]),
  );
  assertEquals(result.status, "safe");
});

Deno.test("evaluateApplication - one open policy among several scoped ones still flags the app", () => {
  const result = evaluateApplication(app([scopedPolicy(), everyonePolicy(), scopedPolicy()]));
  assertEquals(result.status, "warning");
});

// specs/014-access-dashboard — the new descriptive fields, unrelated to
// status/reason logic above (FR-002: that logic is unchanged).
Deno.test("evaluateApplication - policyCount/coveredHostnameCount/sessionDuration pass through", () => {
  const result = evaluateApplication(app([scopedPolicy(), scopedPolicy()]));
  assertEquals(result.policyCount, 2);
  assertEquals(result.coveredHostnameCount, 1);
  assertEquals(result.sessionDuration, "24h");
});

Deno.test("evaluateApplication - identitySummary/policyRules/referencedGroupIds use the humanizer", () => {
  const idp = new Map([["idp-1", "Okta"]]);
  const groups = new Map([["grp-1", "platform"]]);
  const result = evaluateApplication(
    app([{
      decision: "allow",
      includesEveryone: false,
      hasScopedInclude: true,
      include: [{ group: { id: "grp-1" } }],
      require: [{ login_method: { id: "idp-1" } }],
    }]),
    idp,
    groups,
  );
  assertEquals(result.identitySummary, "Okta");
  assertEquals(result.policyRules, [[
    { verb: "ALLOW", label: "group · platform" },
    { verb: "REQUIRE", label: "identity provider · Okta" },
  ]]);
  assertEquals(result.referencedGroupIds, ["grp-1"]);
});

Deno.test("evaluateApplication - the evaluationError sentinel path still carries the new descriptive fields (defaults, not crashes)", () => {
  const result = evaluateApplication({ ...app([]), evaluationError: "could not list apps" });
  assertEquals(result.policyCount, 0);
  assertEquals(result.coveredHostnameCount, 1);
  assertEquals(result.identitySummary, "— none —");
  assertEquals(result.policyRules, []);
  assertEquals(result.referencedGroupIds, []);
});

Deno.test("evaluateServiceToken - not_evaluated when the token has an evaluationError", () => {
  const result = evaluateServiceToken({
    tokenId: "tok-1",
    tokenName: "test",
    expiresAt: null,
    evaluationError: "could not list tokens",
  });
  assertEquals(result.status, "not_evaluated");
});

const NOW = new Date("2026-08-07T12:00:00Z");

Deno.test("evaluateServiceToken - critical when expires_at is in the past", () => {
  const result = evaluateServiceToken(
    { tokenId: "tok-1", tokenName: "old", expiresAt: "2020-01-01T00:00:00Z" },
    NOW,
  );
  assertEquals(result.status, "critical");
});

Deno.test("evaluateServiceToken - critical when expires_at is exactly now (boundary)", () => {
  const result = evaluateServiceToken(
    { tokenId: "tok-1", tokenName: "boundary", expiresAt: NOW.toISOString() },
    NOW,
  );
  assertEquals(result.status, "critical");
});

Deno.test("evaluateServiceToken - warning when expires_at is within 14 days", () => {
  const in10Days = new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const result = evaluateServiceToken(
    { tokenId: "tok-1", tokenName: "soon", expiresAt: in10Days },
    NOW,
  );
  assertEquals(result.status, "warning");
});

Deno.test("evaluateServiceToken - safe when expires_at is more than 14 days away", () => {
  const in30Days = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const result = evaluateServiceToken(
    { tokenId: "tok-1", tokenName: "healthy", expiresAt: in30Days },
    NOW,
  );
  assertEquals(result.status, "safe");
});

Deno.test("evaluateServiceToken - warning when there is no expiration date at all", () => {
  const result = evaluateServiceToken(
    { tokenId: "tok-1", tokenName: "never", expiresAt: null },
    NOW,
  );
  assertEquals(result.status, "warning");
  assertEquals(result.reason, "no expiration date set");
});

Deno.test("evaluateServiceToken - not_evaluated (not a crash, not silently safe) on an unparseable expiration date", () => {
  const result = evaluateServiceToken(
    { tokenId: "tok-1", tokenName: "malformed", expiresAt: "not-a-date" },
    NOW,
  );
  assertEquals(result.status, "not_evaluated");
});
