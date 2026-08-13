// AUDIT_SOURCES is the single registry inbox.ts/changes.ts/summary.ts all
// iterate over exclusively — a source whose finding/alert tables exist and
// are actively written to, but isn't registered here, is silently invisible
// to every cross-module Audit & Drift view even though its own module's
// dashboard shows it correctly (found and fixed: the 3 checks added by
// 0013_security_findings_add_bot_https_min_tls.sql were missing from this
// registry for a full spec cycle). The length assertion below exists
// specifically to catch a repeat of that: a new migration adding
// finding/alert tables without a matching registry entry.
import { assertEquals, assertExists } from "@std/assert";
import {
  AUDIT_SOURCES,
  findAuditSource,
  labelSqlExpr,
} from "../../worker/modules/audit/sources.ts";

Deno.test("AUDIT_SOURCES - has exactly 17 entries, each a unique module/kind pair", () => {
  assertEquals(AUDIT_SOURCES.length, 17);

  const keys = AUDIT_SOURCES.map((s) => `${s.module}/${s.kind}`);
  assertEquals(new Set(keys).size, keys.length);
});

Deno.test("AUDIT_SOURCES - includes the 3 security checks added by migration 0013", () => {
  for (const kind of ["bot_fight_mode", "always_https", "min_tls"]) {
    const source = AUDIT_SOURCES.find((s) => s.module === "security" && s.kind === kind);
    assertExists(source, `expected a registered security/${kind} source`);
    assertEquals(source?.findingsTable, `${kind}_findings`);
    assertEquals(source?.alertsTable, `${kind}_alerts`);
  }
});

Deno.test("findAuditSource - returns the matching source for a known module/kind pair", () => {
  const source = findAuditSource("security", "waf");
  assertEquals(source?.findingsTable, "waf_findings");
});

Deno.test("findAuditSource - returns undefined for an unregistered pair", () => {
  assertEquals(findAuditSource("security", "not-a-real-kind"), undefined);
});

Deno.test("labelSqlExpr - a single column is returned as-is", () => {
  assertEquals(labelSqlExpr(["zone_name"]), "zone_name");
});

Deno.test("labelSqlExpr - multiple columns join with a middle-dot separator", () => {
  assertEquals(
    labelSqlExpr(["zone_name", "record_name"]),
    "zone_name || ' · ' || record_name",
  );
});
