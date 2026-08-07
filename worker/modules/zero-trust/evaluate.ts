// Pure evaluation — no network or D1 access here (constitution Principle
// III), mirrors every prior module's evaluate.ts shape.
import type { AccessApplication, AppEvaluation, ServiceToken, TokenEvaluation } from "./types.ts";

// Basic evaluation for User Story 1: not_evaluated on evaluationError,
// safe otherwise. Policy-openness (User Story 2) and expiry (User Story
// 3) extend this in their own follow-up work.
export function evaluateApplication(app: AccessApplication): AppEvaluation {
  if (app.evaluationError) {
    return {
      appId: app.appId,
      appDomain: app.appDomain,
      status: "not_evaluated",
      reason: app.evaluationError,
    };
  }
  return {
    appId: app.appId,
    appDomain: app.appDomain,
    status: "safe",
    reason: "policy review passed",
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
