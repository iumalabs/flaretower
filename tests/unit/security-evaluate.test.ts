import { assertEquals } from "@std/assert";
import {
  evaluateDnssec,
  evaluateRateLimiting,
  evaluateSslTlsMode,
  evaluateWaf,
} from "../../worker/modules/security/evaluate.ts";
import type { ZoneInventoryItem } from "../../worker/modules/security/types.ts";

function zone(overrides: Partial<ZoneInventoryItem> = {}): ZoneInventoryItem {
  return {
    zoneId: "zone-1",
    zoneName: "example.com",
    sslTls: { mode: "strict" },
    dnssec: { status: "active" },
    waf: { hasEnabledRule: true },
    rateLimiting: { hasEnabledRule: true },
    ...overrides,
  };
}

Deno.test("evaluateSslTlsMode - critical when mode is off", () => {
  const result = evaluateSslTlsMode(zone({ sslTls: { mode: "off" } }));
  assertEquals(result.status, "critical");
});

Deno.test("evaluateSslTlsMode - critical when mode is flexible", () => {
  const result = evaluateSslTlsMode(zone({ sslTls: { mode: "flexible" } }));
  assertEquals(result.status, "critical");
});

Deno.test("evaluateSslTlsMode - warning when mode is full", () => {
  const result = evaluateSslTlsMode(zone({ sslTls: { mode: "full" } }));
  assertEquals(result.status, "warning");
});

Deno.test("evaluateSslTlsMode - safe when mode is strict", () => {
  const result = evaluateSslTlsMode(zone({ sslTls: { mode: "strict" } }));
  assertEquals(result.status, "safe");
});

Deno.test("evaluateSslTlsMode - safe when mode is origin_pull (Enterprise strict variant)", () => {
  const result = evaluateSslTlsMode(zone({ sslTls: { mode: "origin_pull" } }));
  assertEquals(result.status, "safe");
});

Deno.test("evaluateSslTlsMode - not_evaluated when the SSL/TLS setting itself has an evaluationError", () => {
  const result = evaluateSslTlsMode(
    zone({ sslTls: { mode: null, evaluationError: "could not read SSL/TLS setting" } }),
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateSslTlsMode - not_evaluated when the zone itself is a sentinel entry, takes priority over everything else", () => {
  const result = evaluateSslTlsMode(
    zone({ sslTls: { mode: "off" }, evaluationError: "could not list zones: network error" }),
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateDnssec - safe when active", () => {
  const result = evaluateDnssec(zone({ dnssec: { status: "active" } }));
  assertEquals(result.status, "safe");
});

Deno.test("evaluateDnssec - warning when disabled", () => {
  const result = evaluateDnssec(zone({ dnssec: { status: "disabled" } }));
  assertEquals(result.status, "warning");
});

Deno.test("evaluateDnssec - warning when pending", () => {
  const result = evaluateDnssec(zone({ dnssec: { status: "pending" } }));
  assertEquals(result.status, "warning");
});

Deno.test("evaluateDnssec - warning when pending-disabled", () => {
  const result = evaluateDnssec(zone({ dnssec: { status: "pending-disabled" } }));
  assertEquals(result.status, "warning");
});

Deno.test("evaluateDnssec - not_evaluated when status is error (not guessed safe or warning)", () => {
  const result = evaluateDnssec(zone({ dnssec: { status: "error" } }));
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateDnssec - not_evaluated when the DNSSEC check itself has an evaluationError", () => {
  const result = evaluateDnssec(
    zone({ dnssec: { status: null, evaluationError: "could not read DNSSEC status" } }),
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateWaf - safe when a managed ruleset has at least one enabled rule", () => {
  const result = evaluateWaf(zone({ waf: { hasEnabledRule: true } }));
  assertEquals(result.status, "safe");
});

Deno.test("evaluateWaf - warning when no managed ruleset is deployed (or every rule disabled)", () => {
  const result = evaluateWaf(zone({ waf: { hasEnabledRule: false } }));
  assertEquals(result.status, "warning");
});

Deno.test("evaluateWaf - not_evaluated when the WAF check itself has an evaluationError", () => {
  const result = evaluateWaf(
    zone({ waf: { hasEnabledRule: false, evaluationError: "could not read WAF ruleset" } }),
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateRateLimiting - safe when a ruleset has at least one enabled rule", () => {
  const result = evaluateRateLimiting(zone({ rateLimiting: { hasEnabledRule: true } }));
  assertEquals(result.status, "safe");
});

Deno.test("evaluateRateLimiting - warning when no ruleset is deployed (or every rule disabled)", () => {
  const result = evaluateRateLimiting(zone({ rateLimiting: { hasEnabledRule: false } }));
  assertEquals(result.status, "warning");
});

Deno.test("evaluateRateLimiting - not_evaluated when the rate-limiting check itself has an evaluationError", () => {
  const result = evaluateRateLimiting(
    zone({
      rateLimiting: {
        hasEnabledRule: false,
        evaluationError: "could not read rate-limiting ruleset",
      },
    }),
  );
  assertEquals(result.status, "not_evaluated");
});

Deno.test("evaluateDnssec/evaluateWaf/evaluateRateLimiting - not_evaluated when the zone itself is a sentinel entry", () => {
  const sentinel = zone({ evaluationError: "could not list zones: network error" });
  assertEquals(evaluateDnssec(sentinel).status, "not_evaluated");
  assertEquals(evaluateWaf(sentinel).status, "not_evaluated");
  assertEquals(evaluateRateLimiting(sentinel).status, "not_evaluated");
});
