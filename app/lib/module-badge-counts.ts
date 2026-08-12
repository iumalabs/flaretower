// Pure client-side rollup (data-model.md's ModuleBadgeCount) — sums
// counts.critical across every source sharing a `module` value (e.g.
// zero-trust has both "application" and "service_token" sources, per
// worker/modules/audit/sources.ts), then drops any module whose summed
// count is 0 so the Sidebar never renders a "0" badge (FR-004 / spec.md
// Edge Cases: "must not render at all, not render as '0'").
//
// Deliberately NOT typed against worker/modules/audit/summary.ts's
// PostureSummaryEntry — that's the backend's internal camelCase shape
// (`hasData`), not what actually crosses the wire. GET /api/audit/summary
// (worker/modules/audit/routes.ts) serializes it to snake_case
// (`has_data`), and this function only ever needs `module`/`counts`
// anyway, so a minimal structural type matching the real JSON response
// avoids a frontend/backend type mismatch entirely.
export interface AuditSummaryModuleEntry {
  module: string;
  counts: { critical: number };
}

export interface ModuleBadgeCount {
  module: string;
  criticalCount: number;
}

export function computeModuleBadgeCounts(
  entries: AuditSummaryModuleEntry[],
): ModuleBadgeCount[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.module, (totals.get(entry.module) ?? 0) + entry.counts.critical);
  }

  const result: ModuleBadgeCount[] = [];
  for (const [module, criticalCount] of totals) {
    if (criticalCount > 0) {
      result.push({ module, criticalCount });
    }
  }
  return result;
}
