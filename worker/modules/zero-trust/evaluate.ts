// Pure evaluation — no network or D1 access here (constitution Principle
// III), mirrors every prior module's evaluate.ts shape.
import type {
  AccessApplication,
  AccessPolicy,
  AppEvaluation,
  ServiceToken,
  TokenEvaluation,
} from "./types.ts";

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

export function evaluateApplication(app: AccessApplication): AppEvaluation {
  if (app.evaluationError) {
    return {
      appId: app.appId,
      appDomain: app.appDomain,
      status: "not_evaluated",
      reason: app.evaluationError,
    };
  }

  if (isAppOpenOrUnconfigured(app)) {
    const reason = app.policies.length === 0
      ? "no policies attached"
      : "a policy allows Everyone or bypasses identity verification";
    return { appId: app.appId, appDomain: app.appDomain, status: "warning", reason };
  }

  return {
    appId: app.appId,
    appDomain: app.appDomain,
    status: "safe",
    reason: "policies meaningfully restrict access",
  };
}

export function evaluateServiceToken(token: ServiceToken): TokenEvaluation {
  if (token.evaluationError) {
    return {
      tokenId: token.tokenId,
      tokenName: token.tokenName,
      expiresAt: token.expiresAt,
      status: "not_evaluated",
      reason: token.evaluationError,
    };
  }
  return {
    tokenId: token.tokenId,
    tokenName: token.tokenName,
    expiresAt: token.expiresAt,
    status: "safe",
    reason: "expiration healthy",
  };
}

export function evaluateApplications(apps: AccessApplication[]): AppEvaluation[] {
  return apps.map(evaluateApplication);
}

export function evaluateServiceTokens(tokens: ServiceToken[]): TokenEvaluation[] {
  return tokens.map(evaluateServiceToken);
}
