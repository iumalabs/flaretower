// Pure evaluation — no network or D1 access here (constitution Principle
// III), mirrors every prior module's evaluate.ts shape.
import type {
  AccessApplication,
  AccessPolicy,
  AppEvaluation,
  ServiceToken,
  TokenEvaluation,
} from "./types.ts";
import {
  extractReferencedGroupIds,
  humanizePolicies,
  summarizeIdentity,
} from "./rule-humanizer.ts";

// Local re-implementation of the same decision logic Module 1's
// evaluate.ts already established (research.md §2) — an "allow"-type
// policy targeting Everyone, or a "bypass" policy (skips identity
// entirely), or zero policies at all, is effectively open. A "deny"
// targeting Everyone is the opposite of open and must not be flagged —
// decision matters, not just the selector.
function isPolicyEffectivelyOpen(policy: AccessPolicy): boolean {
  if (policy.decision === "bypass") return true;
  return policy.decision === "allow" && policy.includesEveryone;
}

function isAppOpenOrUnconfigured(app: AccessApplication): boolean {
  if (app.policies.length === 0) return true;
  return app.policies.some(isPolicyEffectivelyOpen);
}

// identityProviderNames/groupNames/listNames: id -> name maps (specs/014-
// access-dashboard research.md §2/§3; issue #530 for listNames), threaded
// through by routes.ts's runZeroTrustEvaluation — used only for the new
// descriptive fields below, never for the safe/warning/not_evaluated status
// logic above (spec.md FR-002: unchanged).
export function evaluateApplication(
  app: AccessApplication,
  identityProviderNames: ReadonlyMap<string, string> = new Map(),
  groupNames: ReadonlyMap<string, string> = new Map(),
  listNames: ReadonlyMap<string, string> = new Map(),
): AppEvaluation {
  const descriptive = {
    appName: app.appName,
    policyCount: app.policies.length,
    coveredHostnameCount: app.coveredHostnames.length,
    identitySummary: summarizeIdentity(app.policies, identityProviderNames),
    sessionDuration: app.sessionDuration,
    policyRules: humanizePolicies(app.policies, identityProviderNames, groupNames, listNames),
    referencedGroupIds: extractReferencedGroupIds(app.policies),
  };

  if (app.evaluationError) {
    return {
      appId: app.appId,
      appDomain: app.appDomain,
      status: "not_evaluated",
      reason: app.evaluationError,
      ...descriptive,
    };
  }

  if (isAppOpenOrUnconfigured(app)) {
    const reason = app.policies.length === 0
      ? "no policies attached"
      : "a policy allows Everyone or bypasses identity verification";
    return {
      appId: app.appId,
      appDomain: app.appDomain,
      status: "warning",
      reason,
      ...descriptive,
    };
  }

  return {
    appId: app.appId,
    appDomain: app.appDomain,
    status: "safe",
    reason: "policies meaningfully restrict access",
    ...descriptive,
  };
}

// Spec FR-007's "expiring soon" threshold — a fixed product decision, not
// user-configurable in this iteration (spec Assumptions).
const EXPIRING_SOON_MS = 14 * 24 * 60 * 60 * 1000;

// `now` is injectable for deterministic testing (defaults to the real
// clock at call time) — the same pattern any time-dependent pure function
// needs to stay testable without mocking global Date.
export function evaluateServiceToken(token: ServiceToken, now: Date = new Date()): TokenEvaluation {
  const base = { tokenId: token.tokenId, tokenName: token.tokenName, expiresAt: token.expiresAt };

  if (token.evaluationError) {
    return { ...base, status: "not_evaluated", reason: token.evaluationError };
  }

  if (token.expiresAt === null) {
    // Cloudflare's documented service-token creation flow always requires
    // a duration (research.md §3) — this branch may be unreachable in
    // practice, but a token record without expires_at must not be
    // silently treated as safe if the API ever returns one.
    return { ...base, status: "warning", reason: "no expiration date set" };
  }

  const expiresAtMs = Date.parse(token.expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return {
      ...base,
      status: "not_evaluated",
      reason: `unparseable expiration date: ${token.expiresAt}`,
    };
  }

  const msUntilExpiry = expiresAtMs - now.getTime();
  if (msUntilExpiry <= 0) {
    return { ...base, status: "critical", reason: "expired" };
  }
  if (msUntilExpiry <= EXPIRING_SOON_MS) {
    return { ...base, status: "warning", reason: "expires within 14 days" };
  }
  return { ...base, status: "safe", reason: "expiration healthy" };
}

export function evaluateApplications(
  apps: AccessApplication[],
  identityProviderNames: ReadonlyMap<string, string> = new Map(),
  groupNames: ReadonlyMap<string, string> = new Map(),
  listNames: ReadonlyMap<string, string> = new Map(),
): AppEvaluation[] {
  return apps.map((app) => evaluateApplication(app, identityProviderNames, groupNames, listNames));
}

export function evaluateServiceTokens(
  tokens: ServiceToken[],
  now: Date = new Date(),
): TokenEvaluation[] {
  return tokens.map((t) => evaluateServiceToken(t, now));
}
