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

// US3 replaces this stub with the real DNSSEC decision logic
// (research.md §3).
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
  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    status: "safe",
    reason: "DNSSEC evaluation not yet implemented",
  };
}

// US3 replaces this stub with the real WAF decision logic
// (research.md §4).
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
  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    status: "safe",
    reason: "WAF evaluation not yet implemented",
  };
}

// US3 replaces this stub with the real rate-limiting decision logic
// (research.md §5).
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
  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    status: "safe",
    reason: "rate-limiting evaluation not yet implemented",
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
