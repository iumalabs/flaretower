// spec 001 quickstart.md Scenario 6 / tasks.md T035: no /api/exposure/*
// endpoint may return exposure data without a valid Access JWT. This
// mounts the exact wiring worker/index.ts uses (accessAuth gating
// "/api/*" ahead of exposureRoutes) against a D1 mock seeded with real
// findings/alerts, so a regression that skipped or misordered accessAuth
// would surface as leaked data, not just a wrong status code.
import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { accessAuth, type AccessIdentity } from "../../worker/auth/access-jwt.ts";
import { exposureRoutes } from "../../worker/modules/workers-access-exposure/routes.ts";

const TEAM_DOMAIN = "https://test-team.cloudflareaccess.com";
const POLICY_AUD = "test-aud-12345";

const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
const publicJwk = await exportJWK(publicKey);
publicJwk.kid = "test-kid";
publicJwk.alg = "ES256";
publicJwk.use = "sig";

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

async function expiredToken(): Promise<string> {
  return await new SignJWT({ sub: "u1", email: "u1@example.com" })
    .setProtectedHeader({ alg: "ES256", kid: "test-kid" })
    .setIssuedAt()
    .setIssuer(TEAM_DOMAIN)
    .setAudience(POLICY_AUD)
    .setExpirationTime("-1h")
    .sign(privateKey);
}

function createSeededMockD1(): D1Database {
  const db = {
    prepare(sql: string) {
      const statement = {
        bind() {
          return statement;
        },
        first<T>() {
          if (/FROM exposure_findings ORDER BY evaluated_at DESC LIMIT 1/i.test(sql)) {
            return Promise.resolve(
              { run_id: "run-1", evaluated_at: "2026-08-01T00:00:00.000Z" } as unknown as T,
            );
          }
          throw new Error(`Unhandled mock D1 first() call: ${sql}`);
        },
        all<T>() {
          if (
            /SELECT worker_name, hostname, hostname_kind, status, reason\s+FROM exposure_findings/i
              .test(sql)
          ) {
            return Promise.resolve({
              results: [
                {
                  worker_name: "my-worker",
                  hostname: "my-worker.example.com",
                  hostname_kind: "custom_domain",
                  status: "critical",
                  reason: "no Access policy",
                },
              ],
            } as unknown as { results: T[] });
          }
          if (/FROM exposure_alerts\s+WHERE acknowledged_at IS NULL/i.test(sql)) {
            return Promise.resolve({
              results: [
                {
                  id: "alert-1",
                  hostname: "my-worker.example.com",
                  previous_status: "safe",
                  new_status: "critical",
                  detected_at: "2026-08-01T00:00:00.000Z",
                  acknowledged_at: null,
                },
              ],
            } as unknown as { results: T[] });
          }
          throw new Error(`Unhandled mock D1 all() call: ${sql}`);
        },
        run() {
          throw new Error(`Unexpected mock D1 run() call: ${sql}`);
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return db;
}

function app() {
  const hono = new Hono<
    {
      Bindings: {
        TEAM_DOMAIN: string;
        POLICY_AUD: string;
        DB: D1Database;
        CF_ACCOUNT_ID: string;
        CF_API_TOKEN: string;
      };
      Variables: { identity: AccessIdentity };
    }
  >();
  hono.use("/api/*", accessAuth);
  hono.route("/api/exposure", exposureRoutes);
  const db = createSeededMockD1();
  return (path: string, init?: RequestInit) =>
    hono.request(path, init, {
      TEAM_DOMAIN,
      POLICY_AUD,
      DB: db,
      CF_ACCOUNT_ID: "acct-1",
      CF_API_TOKEN: "tok",
    });
}

const PROTECTED_REQUESTS: Array<{ name: string; path: string; init?: RequestInit }> = [
  { name: "GET /api/exposure/inventory", path: "/api/exposure/inventory" },
  { name: "GET /api/exposure/alerts", path: "/api/exposure/alerts" },
  {
    name: "POST /api/exposure/evaluate",
    path: "/api/exposure/evaluate",
    init: { method: "POST" },
  },
  {
    name: "POST /api/exposure/alerts/:id/acknowledge",
    path: "/api/exposure/alerts/alert-1/acknowledge",
    init: { method: "POST" },
  },
];

for (const req of PROTECTED_REQUESTS) {
  Deno.test(`${req.name} - 403 with no Cf-Access-Jwt-Assertion header, no data leaked`, async () => {
    const res = await app()(req.path, req.init);
    assertEquals(res.status, 403);
    const body = await res.text();
    assertEquals(body, "Forbidden");
  });

  Deno.test(`${req.name} - 403 with a tampered (malformed) token, no data leaked`, async () => {
    const res = await app()(req.path, {
      ...req.init,
      headers: { "Cf-Access-Jwt-Assertion": "not-a-real-jwt" },
    });
    assertEquals(res.status, 403);
    const body = await res.text();
    assertEquals(body, "Forbidden");
  });

  Deno.test(`${req.name} - 403 with an expired token, no data leaked`, async () => {
    const token = await expiredToken();
    const res = await app()(req.path, {
      ...req.init,
      headers: { "Cf-Access-Jwt-Assertion": token },
    });
    assertEquals(res.status, 403);
    const body = await res.text();
    assertEquals(body, "Forbidden");
  });
}
