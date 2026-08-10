import { assertEquals } from "@std/assert";
import { evaluateSslTlsMode } from "../../worker/modules/security/evaluate.ts";
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
