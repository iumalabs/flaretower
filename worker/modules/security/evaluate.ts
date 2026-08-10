// Pure evaluation logic. No network or D1 access here (constitution
// Principle III) so the fetch and scheduled entry points share this
// identically.
import type {
  DnssecEvaluation,
  RateLimitingEvaluation,
  SslTlsEvaluation,
  WafEvaluation,
  ZoneInventoryItem,
} from "./types.ts";

// research.md §2 — direct enum-to-status mapping, no Access-coverage
// logic needed (SSL/TLS mode is a single zone-wide setting, not a
// per-hostname question).
export function evaluateSslTlsMode(zone: ZoneInventoryItem): SslTlsEvaluation {
  if (zone.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.evaluationError,
    };
  }
  if (zone.sslTls.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.sslTls.evaluationError,
    };
  }

  const mode = zone.sslTls.mode;

  if (mode === "off") {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "critical",
      reason: "SSL/TLS mode is Off — visitor traffic is not encrypted at all",
    };
  }

  if (mode === "flexible") {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "critical",
      reason:
        "SSL/TLS mode is Flexible — the connection between Cloudflare and the origin is unencrypted",
    };
  }

  if (mode === "full") {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "warning",
      reason:
        "SSL/TLS mode is Full — both hops are encrypted, but Cloudflare does not validate the origin's certificate",
    };
  }

  // "strict" and the Enterprise-only "origin_pull" variant are both
  // fully encrypted with origin certificate validation.
  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    status: "safe",
    reason: `SSL/TLS mode is ${
      mode === "origin_pull" ? "Strict (SSL-Only Origin Pull)" : "Full (strict)"
    }`,
  };
}

// research.md §3. "pending"/"pending-disabled" are both "not yet
// providing protection, whichever direction the zone is transitioning"
// per spec User Story 3, Acceptance Scenario 2 — both warning, same as
// "disabled". "error" means the API itself couldn't determine the real
// state, so this can't claim either safe or warning (spec Edge Cases).
export function evaluateDnssec(zone: ZoneInventoryItem): DnssecEvaluation {
  if (zone.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.evaluationError,
    };
  }
  if (zone.dnssec.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.dnssec.evaluationError,
    };
  }

  const status = zone.dnssec.status;

  if (status === "active") {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "safe",
      reason: "DNSSEC is active",
    };
  }

  if (status === "error") {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: "DNSSEC status could not be determined (Cloudflare reported an error state)",
    };
  }

  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    status: "warning",
    reason: `DNSSEC is not yet providing protection (status: ${status})`,
  };
}

// research.md §4. The reduction from "ruleset entrypoint + rules[]" to a
// single hasEnabledRule boolean already happened in inventory.ts's
// hasEnabledManagedRule() (shared by both this check and the
// rate-limiting check below, since they read the same shape from two
// different ruleset phases) — this function only maps that boolean to a
// status.
export function evaluateWaf(zone: ZoneInventoryItem): WafEvaluation {
  if (zone.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.evaluationError,
    };
  }
  if (zone.waf.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.waf.evaluationError,
    };
  }
  if (zone.waf.hasEnabledRule) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "safe",
      reason: "a WAF managed ruleset is deployed with at least one enabled rule",
    };
  }
  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    status: "warning",
    reason: "no WAF managed ruleset deployed, or every rule in it is disabled",
  };
}

// research.md §5 — structurally identical to evaluateWaf(), just reading
// the rate-limiting phase's reduced boolean instead.
export function evaluateRateLimiting(zone: ZoneInventoryItem): RateLimitingEvaluation {
  if (zone.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.evaluationError,
    };
  }
  if (zone.rateLimiting.evaluationError) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "not_evaluated",
      reason: zone.rateLimiting.evaluationError,
    };
  }
  if (zone.rateLimiting.hasEnabledRule) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      status: "safe",
      reason: "a rate-limiting ruleset is deployed with at least one enabled rule",
    };
  }
  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    status: "warning",
    reason: "no rate-limiting ruleset deployed, or every rule in it is disabled",
  };
}

export function evaluateSslTlsModes(zones: ZoneInventoryItem[]): SslTlsEvaluation[] {
  return zones.map(evaluateSslTlsMode);
}

export function evaluateDnssecs(zones: ZoneInventoryItem[]): DnssecEvaluation[] {
  return zones.map(evaluateDnssec);
}

export function evaluateWafs(zones: ZoneInventoryItem[]): WafEvaluation[] {
  return zones.map(evaluateWaf);
}

export function evaluateRateLimitings(zones: ZoneInventoryItem[]): RateLimitingEvaluation[] {
  return zones.map(evaluateRateLimiting);
}
