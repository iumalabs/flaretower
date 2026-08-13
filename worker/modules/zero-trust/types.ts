export type AppStatus = "safe" | "warning" | "not_evaluated";
export type TokenStatus = "safe" | "warning" | "critical" | "not_evaluated";

// One raw Cloudflare Access rule selector object, e.g. { email_domain: {
// domain: "acme.dev" } } or { everyone: {} } — kept loosely typed since the
// rule-humanizer (specs/014-access-dashboard research.md §4) is the one
// place that needs to interpret specific shapes, with an honest fallback
// for anything it doesn't recognize (FR-004).
export type RawAccessRule = Record<string, unknown>;

export interface AccessPolicy {
  decision: string;
  includesEveryone: boolean;
  hasScopedInclude: boolean;
  // Raw rule arrays, additive alongside the two booleans above — the
  // booleans remain what evaluate.ts's existing safe/warning logic reads
  // (FR-002: unchanged), these are only for the rule-humanizer.
  include: RawAccessRule[];
  require: RawAccessRule[];
}

export interface AccessApplication {
  appId: string;
  appName: string;
  appDomain: string;
  policies: AccessPolicy[];
  // Every hostname this app covers (specs/014 research.md §1) — includes
  // appDomain as its first element. A legacy single-domain app has exactly
  // one entry here, equal to appDomain.
  coveredHostnames: string[];
  sessionDuration: string | null;
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

export type RuleVerb = "ALLOW" | "REQUIRE" | "DENY";

export interface PolicyRuleLine {
  verb: RuleVerb;
  label: string;
}

export interface AppEvaluation {
  appId: string;
  appName: string;
  appDomain: string;
  status: AppStatus;
  reason: string;
  policyCount: number;
  // Count only, not the full list — appDomain is already the primary
  // hostname, and the UI only needs "+N more" (data-model.md), which a
  // persisted count answers without needing to reconstruct the full list
  // from D1 on every read.
  coveredHostnameCount: number;
  identitySummary: string;
  sessionDuration: string | null;
  // One array per policy, in evaluation order (data-model.md).
  policyRules: PolicyRuleLine[][];
  // Raw Access Group ids referenced anywhere in this app's policies
  // (research.md §3) — used to compute each group's app-reference count.
  referencedGroupIds: string[];
}

export interface TokenEvaluation {
  tokenId: string;
  tokenName: string;
  expiresAt: string | null;
  status: TokenStatus;
  reason: string;
}

export interface IdentityProvider {
  id: string;
  name: string;
}

export interface AccessGroup {
  groupId: string;
  name: string;
  include: RawAccessRule[];
}
