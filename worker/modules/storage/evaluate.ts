// Pure evaluation logic. No network or D1 access here (constitution
// Principle III) so the fetch and scheduled entry points share this
// identically.
import type {
  AccessApplication,
  AccessPolicy,
  BucketEvaluation,
  BucketInventoryItem,
  D1DatabaseEvaluation,
  D1DatabaseInventoryItem,
  KvNamespaceEvaluation,
  KvNamespaceInventoryItem,
} from "./types.ts";

// Local re-implementation of Module 1/4's hostname-coverage and
// policy-openness decision logic (research.md §4 — duplication beats
// premature cross-module coupling), applied to each bucket's enabled
// custom domain(s).

// Access app "domain" may include a path (e.g. "example.com/admin*") —
// only the host part determines coverage here.
function hostnameCoveredByAppDomain(hostname: string, appDomain: string): boolean {
  const host = hostname.toLowerCase();
  const domainHost = appDomain.toLowerCase().split("/")[0];

  if (domainHost.startsWith("*.")) {
    const suffix = domainHost.slice(1); // ".example.com"
    return host.endsWith(suffix) && host !== suffix.slice(1);
  }
  return host === domainHost;
}

function findCoveringApps(hostname: string, apps: AccessApplication[]): AccessApplication[] {
  return apps.filter((app) => hostnameCoveredByAppDomain(hostname, app.appDomain));
}

// A policy that grants access ("allow" or "bypass") to Everyone is
// effectively open regardless of any other, more restrictive policy on
// the same application. A "deny" policy that happens to target Everyone
// is the opposite of open, so `includesEveryone` alone is not sufficient.
function isPolicyEffectivelyOpen(policy: AccessPolicy): boolean {
  if (policy.decision === "bypass") return true;
  return policy.decision === "allow" && policy.includesEveryone;
}

// An application with zero policies attached denies everyone by default
// in Cloudflare Access — not open in the security sense — but is still
// flagged warning, same distinction Modules 1 and 4 already established.
function isAppOpenOrUnconfigured(app: AccessApplication): boolean {
  if (app.policies.length === 0) return true;
  return app.policies.some(isPolicyEffectivelyOpen);
}

export function evaluateBucketExposure(
  bucket: BucketInventoryItem,
  apps: AccessApplication[] | null,
): BucketEvaluation {
  if (bucket.evaluationError) {
    return {
      bucketName: bucket.bucketName,
      status: "not_evaluated",
      reason: bucket.evaluationError,
    };
  }

  // r2.dev has no Access-coverage nuance — Access apps protect
  // zones/hostnames on the account, and r2.dev is not one of them, so
  // enabling it is always a public-exposure decision (spec User Story 2,
  // Acceptance Scenario 1).
  if (bucket.r2DevEnabled) {
    return {
      bucketName: bucket.bucketName,
      status: "critical",
      reason: "r2.dev managed public URL is enabled",
    };
  }

  const enabledCustomDomains = bucket.customDomains.filter((d) => d.enabled);
  if (enabledCustomDomains.length === 0) {
    return {
      bucketName: bucket.bucketName,
      status: "safe",
      reason: "no r2.dev domain and no enabled custom domains",
    };
  }

  if (apps === null) {
    return {
      bucketName: bucket.bucketName,
      status: "not_evaluated",
      reason: "could not evaluate Access coverage (Access applications API error)",
    };
  }

  const uncoveredDomains = enabledCustomDomains.filter(
    (d) => findCoveringApps(d.domain, apps).length === 0,
  );
  if (uncoveredDomains.length > 0) {
    return {
      bucketName: bucket.bucketName,
      status: "critical",
      reason: `enabled custom domain(s) not covered by any Access application: ${
        uncoveredDomains.map((d) => d.domain).join(", ")
      }`,
    };
  }

  const openDomains = enabledCustomDomains.filter((d) =>
    findCoveringApps(d.domain, apps).some(isAppOpenOrUnconfigured)
  );
  if (openDomains.length > 0) {
    return {
      bucketName: bucket.bucketName,
      status: "warning",
      reason:
        `enabled custom domain(s) covered by an Access application that does not meaningfully restrict access: ${
          openDomains.map((d) => d.domain).join(", ")
        }`,
    };
  }

  return {
    bucketName: bucket.bucketName,
    status: "safe",
    reason: "every enabled custom domain is covered by a meaningfully scoped Access policy",
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

export function evaluateBuckets(
  buckets: BucketInventoryItem[],
  apps: AccessApplication[] | null,
): BucketEvaluation[] {
  return buckets.map((bucket) => evaluateBucketExposure(bucket, apps));
}

export function evaluateKvNamespaces(
  namespaces: KvNamespaceInventoryItem[],
): KvNamespaceEvaluation[] {
  return namespaces.map(evaluateKvNamespaceUsage);
}

export function evaluateD1Databases(databases: D1DatabaseInventoryItem[]): D1DatabaseEvaluation[] {
  return databases.map(evaluateD1DatabaseUsage);
}
