import { assertEquals } from "@std/assert";
import {
  type AuditSummaryModuleEntry,
  computeModuleBadgeCounts,
} from "../../app/lib/module-badge-counts.ts";

function entry(module: string, critical: number): AuditSummaryModuleEntry {
  return { module, counts: { critical } };
}

Deno.test("computeModuleBadgeCounts - sums critical counts across every source sharing a module", () => {
  // zero-trust has two sources (application, service_token) in the real
  // AUDIT_SOURCES registry (worker/modules/audit/sources.ts) — the rollup
  // must sum across both, not just take the first.
  const result = computeModuleBadgeCounts([
    entry("zero-trust", 2),
    entry("zero-trust", 3),
  ]);
  assertEquals(result, [{ module: "zero-trust", criticalCount: 5 }]);
});

Deno.test("computeModuleBadgeCounts - omits a module whose summed critical count is 0 (FR-004)", () => {
  const result = computeModuleBadgeCounts([
    entry("exposure", 0),
    entry("dns", 0),
  ]);
  assertEquals(result, []);
});

Deno.test("computeModuleBadgeCounts - includes only modules with a positive summed count, others omitted", () => {
  const result = computeModuleBadgeCounts([
    entry("exposure", 1),
    entry("dns", 0),
    entry("storage", 4),
  ]);
  assertEquals(result, [
    { module: "exposure", criticalCount: 1 },
    { module: "storage", criticalCount: 4 },
  ]);
});

Deno.test("computeModuleBadgeCounts - empty input returns empty output", () => {
  assertEquals(computeModuleBadgeCounts([]), []);
});
