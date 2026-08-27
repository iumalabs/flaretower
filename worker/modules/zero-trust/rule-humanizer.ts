// Pure functions only — no network or D1 access (constitution Principle
// III). Turns Cloudflare's raw Access rule selector objects into
// plain-language lines (specs/014-access-dashboard research.md §4).
import type { AccessPolicy, PolicyRuleLine, RawAccessRule, RuleVerb } from "./types.ts";

function ruleType(rule: RawAccessRule): string | undefined {
  return Object.keys(rule)[0];
}

function ruleValue(rule: RawAccessRule, type: string): Record<string, unknown> {
  const v = rule[type];
  return (v && typeof v === "object") ? v as Record<string, unknown> : {};
}

// `identityProviderNames`/`groupNames`/`listNames` are id -> name maps
// (research.md §2, §3; issue #530 for listNames) — a lookup miss (a deleted
// provider/group, or a list name genuinely unavailable) renders as "unknown
// provider"/an id-only label rather than being silently dropped (spec.md
// Edge Cases).
export function humanizeRule(
  rule: RawAccessRule,
  verb: RuleVerb,
  identityProviderNames: ReadonlyMap<string, string>,
  groupNames: ReadonlyMap<string, string>,
  listNames: ReadonlyMap<string, string> = new Map(),
): PolicyRuleLine {
  const type = ruleType(rule);
  if (!type) {
    return { verb, label: "an unrecognized rule" };
  }
  const value = ruleValue(rule, type);

  switch (type) {
    case "everyone":
      return { verb, label: "everyone" };
    case "email_domain":
      return { verb, label: `emails ending in @${String(value.domain ?? "?")}` };
    case "email":
      return { verb, label: `email ${String(value.email ?? "?")}` };
    case "service_token":
      return { verb, label: `service token · ${String(value.token_id ?? "?")}` };
    case "login_method": {
      const id = String(value.id ?? "");
      const name = identityProviderNames.get(id) ?? "unknown provider";
      return { verb, label: `identity provider · ${name}` };
    }
    case "ip":
      return { verb, label: `IP address ${String(value.ip ?? "?")}` };
    case "ip_list": {
      const id = String(value.id ?? "?");
      return { verb, label: `IP list · ${listNames.get(id) ?? id}` };
    }
    case "geo":
      return { verb, label: `country ${String(value.country_code ?? "?")}` };
    case "email_list": {
      const id = String(value.id ?? "?");
      return { verb, label: `email list · ${listNames.get(id) ?? id}` };
    }
    case "any_valid_service_token":
      return { verb, label: "any valid service token" };
    case "group": {
      const id = String(value.id ?? "");
      const name = groupNames.get(id) ?? `unknown group (${id})`;
      return { verb, label: `group · ${name}` };
    }
    default:
      // Never guess a specific meaning for a rule type this function
      // doesn't recognize — an honest, generic label instead (FR-004).
      return { verb, label: `an unrecognized rule (${type})` };
  }
}

// `bypass` skips identity entirely — plain-language read is "grants access
// with no identity check," i.e. ALLOW, rather than inventing a 4th verb
// (research.md §4).
function decisionVerb(decision: string): RuleVerb {
  return decision === "deny" ? "DENY" : "ALLOW";
}

// One policy -> its rule lines: `include` rules carry the policy's own
// decision verb; `require` rules are always REQUIRE (an AND-condition on
// top of whichever `include` rule matched, regardless of decision).
export function humanizePolicy(
  policy: AccessPolicy,
  identityProviderNames: ReadonlyMap<string, string>,
  groupNames: ReadonlyMap<string, string>,
  listNames: ReadonlyMap<string, string> = new Map(),
): PolicyRuleLine[] {
  const verb = decisionVerb(policy.decision);
  return [
    ...policy.include.map((r) =>
      humanizeRule(r, verb, identityProviderNames, groupNames, listNames)
    ),
    ...policy.require.map((r) =>
      humanizeRule(r, "REQUIRE", identityProviderNames, groupNames, listNames)
    ),
  ];
}

export function humanizePolicies(
  policies: readonly AccessPolicy[],
  identityProviderNames: ReadonlyMap<string, string>,
  groupNames: ReadonlyMap<string, string>,
  listNames: ReadonlyMap<string, string> = new Map(),
): PolicyRuleLine[][] {
  return policies.map((p) => humanizePolicy(p, identityProviderNames, groupNames, listNames));
}

// The table's Identity column (research.md §2) — the distinct set of
// identity-provider names referenced across every policy's include/require
// rules, joined; "service token" when every rule is service_token-only
// with no identity-provider rule anywhere; "— none —" otherwise (no
// identity-based restriction at all, e.g. a fully open or unconfigured app).
export function summarizeIdentity(
  policies: readonly AccessPolicy[],
  identityProviderNames: ReadonlyMap<string, string>,
): string {
  const providerNames = new Set<string>();
  let hasServiceToken = false;

  for (const policy of policies) {
    for (const rule of [...policy.include, ...policy.require]) {
      const type = ruleType(rule);
      if (type === "login_method") {
        const id = String(ruleValue(rule, type).id ?? "");
        providerNames.add(identityProviderNames.get(id) ?? "unknown provider");
      } else if (type === "service_token") {
        hasServiceToken = true;
      }
    }
  }

  if (providerNames.size > 0) return Array.from(providerNames).sort().join(" + ");
  if (hasServiceToken) return "service token";
  return "— none —";
}

// The raw set of Access Group ids an application's policies reference —
// used to compute each group's referenced-by-app-count by exact id match
// (research.md §3), not by parsing humanized text.
export function extractReferencedGroupIds(policies: readonly AccessPolicy[]): string[] {
  const ids = new Set<string>();
  for (const policy of policies) {
    for (const rule of [...policy.include, ...policy.require]) {
      if (ruleType(rule) === "group") {
        const id = ruleValue(rule, "group").id;
        if (typeof id === "string") ids.add(id);
      }
    }
  }
  return Array.from(ids);
}

// Access Groups (research.md §3) have their own `include` rule array (who
// is a member) — reuses the same humanizer, joined into a short summary,
// never a fabricated member count.
export function summarizeGroupRules(
  include: readonly RawAccessRule[],
  identityProviderNames: ReadonlyMap<string, string>,
  groupNames: ReadonlyMap<string, string>,
  listNames: ReadonlyMap<string, string> = new Map(),
): string {
  if (include.length === 0) return "no rules";
  return include
    .map((r) => humanizeRule(r, "ALLOW", identityProviderNames, groupNames, listNames).label)
    .join(", ");
}
