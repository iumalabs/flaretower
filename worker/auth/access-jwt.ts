import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import { fetchIdentityProvider } from "./get-identity.ts";
import { upsertOperator } from "../modules/identity/users.ts";

export interface AccessIdentity {
  sub: string;
  email: string;
  role: "member" | "admin";
}

interface AccessEnv {
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
  DB: D1Database;
}

// One JWKS per team domain, reused across requests within a warm isolate so
// jose's own key-set caching (and not just ours) actually applies — a fresh
// createRemoteJWKSet() per request would hit /cdn-cgi/access/certs every time.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

// Fail closed on every path: missing header, verification failure, a
// payload missing the claims we need, or a failure recognizing the operator
// all return 403 with no detail about which case it was (constitution
// Principle II) — an operator whose identity can't be established or
// resolved to a role isn't authenticated, full stop.
export const accessAuth: MiddlewareHandler<
  { Bindings: AccessEnv; Variables: { identity: AccessIdentity } }
> = async (c, next) => {
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) {
    return c.text("Forbidden", 403);
  }

  try {
    const jwks = getJWKS(c.env.TEAM_DOMAIN);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: c.env.TEAM_DOMAIN,
      audience: c.env.POLICY_AUD,
    });

    const sub = payload.sub;
    const email = payload.email;
    if (typeof sub !== "string" || typeof email !== "string") {
      return c.text("Forbidden", 403);
    }

    // Recognizes the operator (research.md §3) — the very first ever
    // created is auto-elevated (FR-005); IdP enrichment is only fetched on
    // that same first-sight path.
    const operator = await upsertOperator(
      c.env.DB,
      { sub, email },
      () => fetchIdentityProvider(c.env.TEAM_DOMAIN, token),
    );

    c.set("identity", { sub, email, role: operator.role });
  } catch {
    return c.text("Forbidden", 403);
  }

  await next();
};

// Gates an in-app mutating action by the operator's own stored FlareTower
// role (research.md §4) — never by Cloudflare Access group membership.
// Reads the role accessAuth already resolved into the identity context, so
// this never makes its own D1 call.
export function requireRole(
  role: AccessIdentity["role"],
): MiddlewareHandler<{ Variables: { identity: AccessIdentity } }> {
  return async (c, next) => {
    const identity = c.get("identity");
    if (identity.role !== role) {
      return c.text("Forbidden", 403);
    }
    await next();
  };
}
