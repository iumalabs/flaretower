import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";

export interface AccessIdentity {
  sub: string;
  email: string;
}

interface AccessEnv {
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
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

// Fail closed on every path: missing header, verification failure, or a
// payload missing the claims we need all return 403 with no detail about
// which case it was (constitution Principle II).
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

    c.set("identity", { sub, email });
  } catch {
    return c.text("Forbidden", 403);
  }

  await next();
};
