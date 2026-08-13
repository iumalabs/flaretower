// worker/auth/access-jwt.ts is the single most security-critical file in
// this project (constitution Principle II: "the last line of defense
// protecting an account-wide credential") but had no direct test coverage
// of accessAuth itself — every existing test either stubs it out entirely
// (identity-routes.test.ts) or exercises requireRole() only. This file
// closes that gap with real signed JWTs against a mocked JWKS endpoint —
// no changes to access-jwt.ts itself, purely additive test coverage.
import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { accessAuth, type AccessIdentity } from "../../worker/auth/access-jwt.ts";

const TEAM_DOMAIN = "https://test-team.cloudflareaccess.com";
const POLICY_AUD = "test-aud-12345";

const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
const publicJwk = await exportJWK(publicKey);
publicJwk.kid = "test-kid";
publicJwk.alg = "ES256";
publicJwk.use = "sig";

// The real endpoint accessAuth's getJWKS() fetches from
// (`${TEAM_DOMAIN}/cdn-cgi/access/certs`) — served here instead of a real
// network call. fetchIdentityProvider() (get-identity.ts) hits a
// different path and is never mocked below: it swallows every failure
// into "unknown" by design (research.md §2 — "any failure here must never
// affect an authentication decision"), so leaving it unhandled by this
// stub exercises that exact graceful-degradation path for free.
globalThis.fetch = ((input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url === `${TEAM_DOMAIN}/cdn-cgi/access/certs`) {
    return Promise.resolve(
      new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  return Promise.reject(new Error(`Unhandled mock fetch call: ${url}`));
}) as typeof fetch;

async function signToken(
  claims: Record<string, unknown>,
  overrides: { issuer?: string; audience?: string; expired?: boolean } = {},
): Promise<string> {
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: "test-kid" })
    .setIssuedAt()
    .setIssuer(overrides.issuer ?? TEAM_DOMAIN)
    .setAudience(overrides.audience ?? POLICY_AUD)
    .setExpirationTime(overrides.expired ? "-1h" : "1h")
    .sign(privateKey);
}

interface UserRow {
  sub: string;
  email: string;
  idp: string;
  role: "member" | "admin";
  created_at: string;
  last_seen_at: string;
}

// Mirrors this codebase's established regex-routed mock D1 precedent
// (e.g. security-routes.test.ts) — narrow enough to only support what
// upsertOperator() (worker/modules/identity/users.ts) actually sends.
function createMockD1(
  seed: UserRow[],
  opts: { failSelect?: boolean } = {},
): { db: D1Database; inserted: UserRow[]; updated: Array<{ sub: string; email: string }> } {
  const inserted: UserRow[] = [];
  const updated: Array<{ sub: string; email: string }> = [];

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          bound = args;
          return statement;
        },
        first<T>() {
          if (opts.failSelect) {
            return Promise.reject(new Error("D1 error"));
          }
          if (
            /SELECT sub, email, idp, role, created_at, last_seen_at FROM users WHERE sub = \?/i
              .test(sql)
          ) {
            const sub = bound[0] as string;
            const row = seed.find((r) => r.sub === sub);
            return Promise.resolve((row ?? null) as T | null);
          }
          if (/SELECT COUNT\(\*\) AS count FROM users/i.test(sql)) {
            return Promise.resolve({ count: seed.length } as unknown as T);
          }
          throw new Error(`Unhandled mock D1 first() call: ${sql}`);
        },
        run() {
          if (/^INSERT INTO users/i.test(sql)) {
            const [sub, email, idp, role, created_at, last_seen_at] = bound as string[];
            inserted.push({
              sub,
              email,
              idp,
              role: role as "member" | "admin",
              created_at,
              last_seen_at,
            });
          }
          if (/^UPDATE users SET email/i.test(sql)) {
            const [email, , sub] = bound as string[];
            updated.push({ sub, email });
          }
          return Promise.resolve({} as D1Result);
        },
      };
      return statement;
    },
  } as unknown as D1Database;

  return { db, inserted, updated };
}

function app(db: D1Database) {
  const hono = new Hono<
    {
      Bindings: { TEAM_DOMAIN: string; POLICY_AUD: string; DB: D1Database };
      Variables: { identity: AccessIdentity };
    }
  >();
  hono.use("*", accessAuth);
  hono.get("/protected", (c) => c.json(c.get("identity")));
  return (headers?: Record<string, string>) =>
    hono.request("/protected", { headers }, { TEAM_DOMAIN, POLICY_AUD, DB: db });
}

Deno.test("accessAuth - 403 when the Cf-Access-Jwt-Assertion header is missing", async () => {
  const { db } = createMockD1([]);
  const res = await app(db)();
  assertEquals(res.status, 403);
});

Deno.test("accessAuth - 403 on a malformed token (not even a JWT)", async () => {
  const { db } = createMockD1([]);
  const res = await app(db)({ "Cf-Access-Jwt-Assertion": "not-a-real-jwt" });
  assertEquals(res.status, 403);
});

Deno.test("accessAuth - 403 when the signature doesn't verify (wrong key)", async () => {
  const { privateKey: otherKey } = await generateKeyPair("ES256", { extractable: true });
  const token = await new SignJWT({ sub: "u1", email: "u1@example.com" })
    .setProtectedHeader({ alg: "ES256", kid: "test-kid" })
    .setIssuedAt()
    .setIssuer(TEAM_DOMAIN)
    .setAudience(POLICY_AUD)
    .setExpirationTime("1h")
    .sign(otherKey);

  const { db } = createMockD1([]);
  const res = await app(db)({ "Cf-Access-Jwt-Assertion": token });
  assertEquals(res.status, 403);
});

Deno.test("accessAuth - 403 when the issuer doesn't match TEAM_DOMAIN", async () => {
  const token = await signToken(
    { sub: "u1", email: "u1@example.com" },
    { issuer: "https://attacker.cloudflareaccess.com" },
  );
  const { db } = createMockD1([]);
  const res = await app(db)({ "Cf-Access-Jwt-Assertion": token });
  assertEquals(res.status, 403);
});

Deno.test("accessAuth - 403 when the audience doesn't match POLICY_AUD", async () => {
  const token = await signToken(
    { sub: "u1", email: "u1@example.com" },
    { audience: "some-other-app-aud" },
  );
  const { db } = createMockD1([]);
  const res = await app(db)({ "Cf-Access-Jwt-Assertion": token });
  assertEquals(res.status, 403);
});

Deno.test("accessAuth - 403 when the token is expired", async () => {
  const token = await signToken({ sub: "u1", email: "u1@example.com" }, { expired: true });
  const { db } = createMockD1([]);
  const res = await app(db)({ "Cf-Access-Jwt-Assertion": token });
  assertEquals(res.status, 403);
});

Deno.test("accessAuth - 403 when the payload is missing the email claim", async () => {
  const token = await signToken({ sub: "u1" });
  const { db } = createMockD1([]);
  const res = await app(db)({ "Cf-Access-Jwt-Assertion": token });
  assertEquals(res.status, 403);
});

Deno.test("accessAuth - 403 when the payload is missing the sub claim", async () => {
  const token = await signToken({ email: "u1@example.com" });
  const { db } = createMockD1([]);
  const res = await app(db)({ "Cf-Access-Jwt-Assertion": token });
  assertEquals(res.status, 403);
});

Deno.test("accessAuth - a valid token for a brand-new operator is auto-elevated to admin (FR-005) and passes through", async () => {
  const token = await signToken({ sub: "new-user", email: "new-user@example.com" });
  const { db, inserted } = createMockD1([]); // zero existing users
  const res = await app(db)({ "Cf-Access-Jwt-Assertion": token });

  assertEquals(res.status, 200);
  const identity = await res.json() as AccessIdentity;
  assertEquals(identity.sub, "new-user");
  assertEquals(identity.email, "new-user@example.com");
  assertEquals(identity.role, "admin");
  assertEquals(inserted.length, 1);
  assertEquals(inserted[0].role, "admin");
});

Deno.test("accessAuth - a valid token for a known operator reuses their stored role and updates last_seen_at", async () => {
  const token = await signToken({ sub: "existing-user", email: "existing-user@example.com" });
  const { db, updated, inserted } = createMockD1([
    {
      sub: "existing-user",
      email: "old-email@example.com",
      idp: "google-apps",
      role: "member",
      created_at: "2026-08-01T00:00:00.000Z",
      last_seen_at: "2026-08-01T00:00:00.000Z",
    },
  ]);
  const res = await app(db)({ "Cf-Access-Jwt-Assertion": token });

  assertEquals(res.status, 200);
  const identity = await res.json() as AccessIdentity;
  assertEquals(identity.role, "member"); // this project's own stored role, not re-derived
  assertEquals(inserted.length, 0);
  assertEquals(updated.length, 1);
  assertEquals(updated[0].email, "existing-user@example.com");
});

Deno.test("accessAuth - fails closed (403, not 500) when the D1 lookup itself errors", async () => {
  const token = await signToken({ sub: "u1", email: "u1@example.com" });
  const { db } = createMockD1([], { failSelect: true });
  const res = await app(db)({ "Cf-Access-Jwt-Assertion": token });
  assertEquals(res.status, 403);
});
