export type BucketStatus = "safe" | "warning" | "critical" | "not_evaluated";
export type UsageStatus = "safe" | "warning" | "not_evaluated";

// Local re-implementation of Module 1/4's Access application shape
// (research.md §4 — duplication beats premature cross-module coupling).
export interface AccessPolicy {
  decision: string;
  includesEveryone: boolean;
  hasScopedInclude: boolean;
}

export interface AccessApplication {
  appId: string;
  appDomain: string;
  policies: AccessPolicy[];
}

export interface CustomBucketDomain {
  domain: string;
  enabled: boolean;
}

export interface BucketInventoryItem {
  bucketName: string;
  // R2-managed r2.dev public URL. Populated by US2's inventory
  // extension; defaults false/[] in US1 (not yet fetched).
  r2DevEnabled: boolean;
  customDomains: CustomBucketDomain[];
  evaluationError?: string;
}

export interface KvNamespaceInventoryItem {
  namespaceId: string;
  title: string;
  evaluationError?: string;
}

export interface D1DatabaseInventoryItem {
  databaseUuid: string;
  name: string;
  evaluationError?: string;
}

export interface BucketEvaluation {
  bucketName: string;
  status: BucketStatus;
  reason: string;
}

export interface KvNamespaceEvaluation {
  namespaceId: string;
  title: string;
  status: UsageStatus;
  reason: string;
}

export interface D1DatabaseEvaluation {
  databaseUuid: string;
  name: string;
  status: UsageStatus;
  reason: string;
}
