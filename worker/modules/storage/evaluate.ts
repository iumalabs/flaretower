// Pure evaluation logic. No network or D1 access here (constitution
// Principle III) so the fetch and scheduled entry points share this
// identically.
import type {
  BucketEvaluation,
  BucketInventoryItem,
  D1DatabaseEvaluation,
  D1DatabaseInventoryItem,
  KvNamespaceEvaluation,
  KvNamespaceInventoryItem,
} from "./types.ts";

// US2 replaces this stub with the real r2.dev/custom-domain
// hostname-coverage and policy-openness check (research.md §4).
export function evaluateBucketExposure(bucket: BucketInventoryItem): BucketEvaluation {
  if (bucket.evaluationError) {
    return {
      bucketName: bucket.bucketName,
      status: "not_evaluated",
      reason: bucket.evaluationError,
    };
  }
  return {
    bucketName: bucket.bucketName,
    status: "safe",
    reason: "R2 exposure evaluation not yet implemented",
  };
}

// US3 replaces this stub with the real Worker-bindings usage check.
export function evaluateKvNamespaceUsage(
  namespace: KvNamespaceInventoryItem,
): KvNamespaceEvaluation {
  if (namespace.evaluationError) {
    return {
      namespaceId: namespace.namespaceId,
      title: namespace.title,
      status: "not_evaluated",
      reason: namespace.evaluationError,
    };
  }
  return {
    namespaceId: namespace.namespaceId,
    title: namespace.title,
    status: "safe",
    reason: "usage evaluation not yet implemented",
  };
}

// US3 replaces this stub with the real Worker-bindings usage check.
export function evaluateD1DatabaseUsage(database: D1DatabaseInventoryItem): D1DatabaseEvaluation {
  if (database.evaluationError) {
    return {
      databaseUuid: database.databaseUuid,
      name: database.name,
      status: "not_evaluated",
      reason: database.evaluationError,
    };
  }
  return {
    databaseUuid: database.databaseUuid,
    name: database.name,
    status: "safe",
    reason: "usage evaluation not yet implemented",
  };
}

export function evaluateBuckets(buckets: BucketInventoryItem[]): BucketEvaluation[] {
  return buckets.map(evaluateBucketExposure);
}

export function evaluateKvNamespaces(
  namespaces: KvNamespaceInventoryItem[],
): KvNamespaceEvaluation[] {
  return namespaces.map(evaluateKvNamespaceUsage);
}

export function evaluateD1Databases(databases: D1DatabaseInventoryItem[]): D1DatabaseEvaluation[] {
  return databases.map(evaluateD1DatabaseUsage);
}
