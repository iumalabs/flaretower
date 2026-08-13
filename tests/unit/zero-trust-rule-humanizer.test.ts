import { assertEquals } from "@std/assert";
import {
  humanizePolicy,
  humanizeRule,
  summarizeGroupRules,
  summarizeIdentity,
} from "../../worker/modules/zero-trust/rule-humanizer.ts";
import type { AccessPolicy } from "../../worker/modules/zero-trust/types.ts";

const idp = new Map([["idp-1", "Okta"]]);
const groups = new Map([["grp-1", "platform"]]);

function policy(overrides: Partial<AccessPolicy>): AccessPolicy {
  return {
    decision: "allow",
    includesEveryone: false,
    hasScopedInclude: true,
    include: [],
    require: [],
    ...overrides,
  };
}

Deno.test("humanizeRule - everyone", () => {
  assertEquals(humanizeRule({ everyone: {} }, "ALLOW", idp, groups), {
    verb: "ALLOW",
    label: "everyone",
  });
});

Deno.test("humanizeRule - email_domain", () => {
  assertEquals(
    humanizeRule({ email_domain: { domain: "acme.dev" } }, "ALLOW", idp, groups),
    { verb: "ALLOW", label: "emails ending in @acme.dev" },
  );
});

Deno.test("humanizeRule - email", () => {
  assertEquals(
    humanizeRule({ email: { email: "x@acme.dev" } }, "ALLOW", idp, groups),
    { verb: "ALLOW", label: "email x@acme.dev" },
  );
});

Deno.test("humanizeRule - service_token", () => {
  assertEquals(
    humanizeRule({ service_token: { token_id: "gateway-ci" } }, "ALLOW", idp, groups),
    { verb: "ALLOW", label: "service token · gateway-ci" },
  );
});

Deno.test("humanizeRule - login_method with a known provider", () => {
  assertEquals(
    humanizeRule({ login_method: { id: "idp-1" } }, "REQUIRE", idp, groups),
    { verb: "REQUIRE", label: "identity provider · Okta" },
  );
});

Deno.test("humanizeRule - login_method with an unknown/deleted provider", () => {
  assertEquals(
    humanizeRule({ login_method: { id: "idp-deleted" } }, "REQUIRE", idp, groups),
    { verb: "REQUIRE", label: "identity provider · unknown provider" },
  );
});

Deno.test("humanizeRule - ip and ip_list", () => {
  assertEquals(
    humanizeRule({ ip: { ip: "203.0.113.1" } }, "ALLOW", idp, groups),
    { verb: "ALLOW", label: "IP address 203.0.113.1" },
  );
  assertEquals(
    humanizeRule({ ip_list: { id: "ci-ranges" } }, "ALLOW", idp, groups),
    { verb: "ALLOW", label: "IP list · ci-ranges" },
  );
});

Deno.test("humanizeRule - group with a known name", () => {
  assertEquals(
    humanizeRule({ group: { id: "grp-1" } }, "ALLOW", idp, groups),
    { verb: "ALLOW", label: "group · platform" },
  );
});

Deno.test("humanizeRule - an unrecognized rule type falls back to a generic, honest label", () => {
  const result = humanizeRule({ some_future_rule_type: { x: 1 } }, "ALLOW", idp, groups);
  assertEquals(result.verb, "ALLOW");
  assertEquals(result.label, "an unrecognized rule (some_future_rule_type)");
});

Deno.test("humanizeRule - a rule object with no keys at all falls back safely", () => {
  const result = humanizeRule({}, "DENY", idp, groups);
  assertEquals(result, { verb: "DENY", label: "an unrecognized rule" });
});

Deno.test("humanizePolicy - allow decision -> ALLOW verb on include rules", () => {
  const lines = humanizePolicy(
    policy({ decision: "allow", include: [{ email_domain: { domain: "acme.dev" } }] }),
    idp,
    groups,
  );
  assertEquals(lines, [{ verb: "ALLOW", label: "emails ending in @acme.dev" }]);
});

Deno.test("humanizePolicy - deny decision -> DENY verb", () => {
  const lines = humanizePolicy(
    policy({ decision: "deny", include: [{ everyone: {} }] }),
    idp,
    groups,
  );
  assertEquals(lines, [{ verb: "DENY", label: "everyone" }]);
});

Deno.test("humanizePolicy - bypass decision reads as ALLOW, not a 4th verb", () => {
  const lines = humanizePolicy(
    policy({ decision: "bypass", include: [{ everyone: {} }] }),
    idp,
    groups,
  );
  assertEquals(lines[0].verb, "ALLOW");
});

Deno.test("humanizePolicy - require rules are always REQUIRE, regardless of decision", () => {
  const lines = humanizePolicy(
    policy({
      decision: "allow",
      include: [{ email_domain: { domain: "acme.dev" } }],
      require: [{ login_method: { id: "idp-1" } }],
    }),
    idp,
    groups,
  );
  assertEquals(lines, [
    { verb: "ALLOW", label: "emails ending in @acme.dev" },
    { verb: "REQUIRE", label: "identity provider · Okta" },
  ]);
});

Deno.test("summarizeIdentity - a login_method rule resolves to the provider's real name", () => {
  const summary = summarizeIdentity(
    [policy({ require: [{ login_method: { id: "idp-1" } }] })],
    idp,
  );
  assertEquals(summary, "Okta");
});

Deno.test("summarizeIdentity - multiple distinct providers join, sorted", () => {
  const idp2 = new Map([["idp-1", "Okta"], ["idp-2", "Azure AD"]]);
  const summary = summarizeIdentity(
    [
      policy({ require: [{ login_method: { id: "idp-1" } }] }),
      policy({ require: [{ login_method: { id: "idp-2" } }] }),
    ],
    idp2,
  );
  assertEquals(summary, "Azure AD + Okta");
});

Deno.test("summarizeIdentity - service-token-only policies with no identity rule -> 'service token'", () => {
  const summary = summarizeIdentity(
    [policy({ include: [{ service_token: { token_id: "ci" } }] })],
    idp,
  );
  assertEquals(summary, "service token");
});

Deno.test("summarizeIdentity - no identity or service-token rule anywhere -> '— none —'", () => {
  const summary = summarizeIdentity([policy({ include: [{ everyone: {} }] })], idp);
  assertEquals(summary, "— none —");
});

Deno.test("summarizeIdentity - zero policies -> '— none —'", () => {
  assertEquals(summarizeIdentity([], idp), "— none —");
});

Deno.test("summarizeGroupRules - never fabricates a member count, just humanizes the group's own rules", () => {
  const summary = summarizeGroupRules([{ login_method: { id: "idp-1" } }], idp, groups);
  assertEquals(summary, "identity provider · Okta");
});

Deno.test("summarizeGroupRules - zero rules -> explicit 'no rules', not blank", () => {
  assertEquals(summarizeGroupRules([], idp, groups), "no rules");
});
