// Pure functions only — no network or D1 access (constitution Principle
// III), mirroring workers-access-exposure/evaluate.ts's own separation.
import type { ExposureStatus, WorkersDashboardEnvironment } from "./types.ts";

export type HostnameKindForClassification = "custom_domain" | "workers_dev" | "preview_url";

// research.md §2: Cloudflare's Workers Scripts API has no first-class
// "environment" field, so this reuses the hostname-kind data
// workers-access-exposure/inventory.ts already fetches. A Worker counts as
// "production" the moment ANY of its hostnames actually serves outside a
// preview context (a custom domain, or an enabled workers.dev subdomain) —
// only a Worker whose sole active hostname(s) are Preview URLs, or that has
// no public hostname at all, counts as neither... but "no public hostname
// at all" still means the script is deployed, so it defaults to
// "production" rather than an undefined third state (spec.md's Edge Cases
// only enumerates production/preview, not "neither").
export function classifyEnvironment(
  hostnameKinds: readonly HostnameKindForClassification[],
): WorkersDashboardEnvironment {
  if (hostnameKinds.length === 0) return "production";
  const allPreview = hostnameKinds.every((k) => k === "preview_url");
  return allPreview ? "preview" : "production";
}

// research.md's data-model.md: "critical outranks warning, which outranks
// protected/not evaluated" — between the two lowest tiers, `not_evaluated`
// is treated as worse than `safe` (not equal-lowest), consistent with this
// project's own repeated FR-011-style rule elsewhere ("never silently
// present an unevaluated item as safe"): a Worker that has one confirmed
// -safe hostname and one hostname that couldn't be evaluated has NOT been
// fully confirmed safe, so it must not roll up to "safe".
const SEVERITY: Record<ExposureStatus, number> = {
  critical: 3,
  warning: 2,
  not_evaluated: 1,
  safe: 0,
};

// A Worker with zero hostnames (workers-access-exposure's own
// "no public hostnames" marker) has no statuses to roll up at all — the
// caller passes an empty array in that case, and this returns "safe",
// matching that marker's own status value.
export function rollUpExposureStatus(hostnameStatuses: readonly ExposureStatus[]): ExposureStatus {
  if (hostnameStatuses.length === 0) return "safe";
  return hostnameStatuses.reduce((worst, status) => (
    SEVERITY[status] > SEVERITY[worst] ? status : worst
  ));
}
