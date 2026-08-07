export type AppStatus = "safe" | "warning" | "not_evaluated";
export type TokenStatus = "safe" | "warning" | "critical" | "not_evaluated";

export interface AccessPolicy {
  decision: string;
  includesEveryone: boolean;
  hasScopedInclude: boolean;
}

export interface AccessApplication {
  appId: string;
  appDomain: string;
  policies: AccessPolicy[];
  // Set when this specific application couldn't be evaluated, or as a
  // sentinel entry when the applications list itself failed entirely
  // (worker/modules/zero-trust/inventory.ts's buildZeroTrustInventory).
  evaluationError?: string;
}

export interface ServiceToken {
  tokenId: string;
  tokenName: string;
  expiresAt: string | null;
  evaluationError?: string;
}

export interface AppEvaluation {
  appId: string;
  appDomain: string;
  status: AppStatus;
  reason: string;
}

export interface TokenEvaluation {
  tokenId: string;
  tokenName: string;
  expiresAt: string | null;
  status: TokenStatus;
  reason: string;
}
