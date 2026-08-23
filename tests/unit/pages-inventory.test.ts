import { assertEquals } from "@std/assert";
import {
  buildPagesInventory,
  listAccessApplications,
  listPagesProjects,
  listProjectDomains,
  listProjectProductionDeployment,
} from "../../worker/modules/pages/inventory.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(handlers: Array<[string, () => Response]>): typeof fetch {
  return ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(url).pathname;
    for (const [suffix, handler] of handlers) {
      if (pathname.endsWith(suffix)) return Promise.resolve(handler());
    }
    return Promise.reject(new Error(`Unhandled mock fetch call: ${url}`));
  }) as typeof fetch;
}

const creds = { accountId: "acct-1", apiToken: "fake-token" };

Deno.test("listPagesProjects - maps projects, including subdomain", async () => {
  const fetchImpl = mockFetch([
    ["/pages/projects", () =>
      jsonResponse({
        success: true,
        result: [
          { name: "marketing-site", subdomain: "marketing-site.pages.dev" },
          { name: "docs", subdomain: "docs.pages.dev" },
        ],
        errors: [],
      })],
  ]);

  const projects = await listPagesProjects(creds, fetchImpl);

  assertEquals(projects.length, 2);
  assertEquals(projects[0].subdomain, "marketing-site.pages.dev");
});

Deno.test("listProjectDomains - maps domain name and status", async () => {
  const fetchImpl = mockFetch([
    ["/domains", () =>
      jsonResponse({
        success: true,
        result: [
          { name: "example.com", status: "active" },
          { name: "staging.example.com", status: "pending" },
        ],
        errors: [],
      })],
  ]);

  const domains = await listProjectDomains(creds, "marketing-site", fetchImpl);

  assertEquals(domains.length, 2);
  assertEquals(domains[0], { domainName: "example.com", status: "active" });
  assertEquals(domains[1], { domainName: "staging.example.com", status: "pending" });
});

Deno.test("listAccessApplications - maps apps and policies, including a zero-policy app", async () => {
  const fetchImpl = mockFetch([
    ["/access/apps", () =>
      jsonResponse({
        success: true,
        result: [
          {
            id: "app-1",
            domain: "marketing-site.pages.dev",
            policies: [{
              decision: "allow",
              include: [{ everyone: {} }],
            }],
          },
          { id: "app-2", domain: "no-policy.example.com", policies: [] },
        ],
        errors: [],
      })],
  ]);

  const apps = await listAccessApplications(creds, fetchImpl);

  assertEquals(apps.length, 2);
  assertEquals(apps[0].policies[0].includesEveryone, true);
  assertEquals(apps[1].policies, []);
});

// issue #464 — Cloudflare omits `domain` for some Access application types
// (e.g. bookmark apps); this must not throw and must never surface as a
// literal `undefined`.
Deno.test("listAccessApplications - an app with no domain field falls back to a sentinel string, never undefined", async () => {
  const fetchImpl = mockFetch([
    ["/access/apps", () =>
      jsonResponse({
        success: true,
        result: [{ id: "app-1", policies: [] }],
        errors: [],
      })],
  ]);

  const apps = await listAccessApplications(creds, fetchImpl);

  assertEquals(apps.length, 1);
  assertEquals(apps[0].appDomain, "(no domain)");
});

// issue #466 — falls back to the appDomain (or its own "(no domain)"
// sentinel) when Cloudflare's API doesn't return a name — never a raw
// UUID shown to the operator as if it were a name.
Deno.test("listAccessApplications - captures the app's real name; falls back to appDomain when absent", async () => {
  const fetchImpl = mockFetch([
    ["/access/apps", () =>
      jsonResponse({
        success: true,
        result: [
          { id: "app-1", name: "gateway-admin", domain: "api.example.com", policies: [] },
          { id: "app-2", domain: "no-name.example.com", policies: [] },
        ],
        errors: [],
      })],
  ]);

  const apps = await listAccessApplications(creds, fetchImpl);

  assertEquals(apps[0].appName, "gateway-admin");
  assertEquals(apps[1].appName, "no-name.example.com");
});

Deno.test("listProjectProductionDeployment - returns the newest (index 0) production deployment", async () => {
  const fetchImpl = mockFetch([
    ["/deployments", () =>
      jsonResponse({
        success: true,
        result: [{
          id: "dep-2",
          latest_stage: { status: "success" },
          created_on: "2026-08-13T00:00:00Z",
        }],
        errors: [],
      })],
  ]);

  const deployment = await listProjectProductionDeployment(creds, "marketing-site", fetchImpl);

  assertEquals(deployment, {
    deploymentId: "dep-2",
    status: "success",
    createdOn: "2026-08-13T00:00:00Z",
  });
});

Deno.test("listProjectProductionDeployment - null when no production deployment exists yet", async () => {
  const fetchImpl = mockFetch([
    ["/deployments", () => jsonResponse({ success: true, result: [], errors: [] })],
  ]);

  const deployment = await listProjectProductionDeployment(creds, "marketing-site", fetchImpl);

  assertEquals(deployment, null);
});

const EMPTY_ACCESS_APPS: [string, () => Response] = [
  "/access/apps",
  () => jsonResponse({ success: true, result: [], errors: [] }),
];

const NO_DEPLOYMENTS: [string, () => Response] = [
  "/deployments",
  () => jsonResponse({ success: true, result: [], errors: [] }),
];

Deno.test("buildPagesInventory - every project and every one of its custom domains is enumerated, none omitted", async () => {
  const fetchImpl = mockFetch([
    ["/pages/projects", () =>
      jsonResponse({
        success: true,
        result: [
          { name: "marketing-site", subdomain: "marketing-site.pages.dev" },
          { name: "empty-project", subdomain: "empty-project.pages.dev" },
        ],
        errors: [],
      })],
    ["/marketing-site/domains", () =>
      jsonResponse({
        success: true,
        result: [{ name: "example.com", status: "active" }],
        errors: [],
      })],
    ["/empty-project/domains", () => jsonResponse({ success: true, result: [], errors: [] })],
    EMPTY_ACCESS_APPS,
    NO_DEPLOYMENTS,
  ]);

  const inventory = await buildPagesInventory(creds, fetchImpl);

  assertEquals(inventory.projects.length, 2);
  assertEquals(inventory.projects[0].customDomains.length, 1);
  assertEquals(inventory.projects[1].customDomains, []);
  assertEquals(inventory.accessApplications, []);
});

// specs/015-pages-dashboard research.md §1
Deno.test("buildPagesInventory - captures production_branch from the existing projects fetch", async () => {
  const fetchImpl = mockFetch([
    ["/pages/projects", () =>
      jsonResponse({
        success: true,
        result: [
          {
            name: "marketing-site",
            subdomain: "marketing-site.pages.dev",
            production_branch: "release",
          },
          { name: "no-branch-project", subdomain: "no-branch-project.pages.dev" },
        ],
        errors: [],
      })],
    ["/marketing-site/domains", () => jsonResponse({ success: true, result: [], errors: [] })],
    ["/no-branch-project/domains", () => jsonResponse({ success: true, result: [], errors: [] })],
    EMPTY_ACCESS_APPS,
    NO_DEPLOYMENTS,
  ]);

  const inventory = await buildPagesInventory(creds, fetchImpl);

  assertEquals(inventory.projects[0].productionBranch, "release");
  assertEquals(inventory.projects[1].productionBranch, undefined);
});

Deno.test("buildPagesInventory - a total failure to list projects surfaces a sentinel entry, not an empty (confirmed-zero) list", async () => {
  const fetchImpl = mockFetch([
    ["/pages/projects", () => jsonResponse({ success: false, result: null, errors: [] }, 403)],
    EMPTY_ACCESS_APPS,
  ]);

  const inventory = await buildPagesInventory(creds, fetchImpl);

  assertEquals(inventory.projects.length, 1);
  assertEquals(typeof inventory.projects[0].evaluationError, "string");
});

Deno.test("buildPagesInventory - a per-project domains-list failure is scoped to that project, other projects unaffected", async () => {
  const fetchImpl = mockFetch([
    ["/pages/projects", () =>
      jsonResponse({
        success: true,
        result: [
          { name: "broken-project", subdomain: "broken-project.pages.dev" },
          { name: "healthy-project", subdomain: "healthy-project.pages.dev" },
        ],
        errors: [],
      })],
    [
      "/broken-project/domains",
      () => jsonResponse({ success: false, result: null, errors: [] }, 500),
    ],
    [
      "/healthy-project/domains",
      () =>
        jsonResponse({
          success: true,
          result: [{ name: "example.com", status: "active" }],
          errors: [],
        }),
    ],
    EMPTY_ACCESS_APPS,
    NO_DEPLOYMENTS,
  ]);

  const inventory = await buildPagesInventory(creds, fetchImpl);

  assertEquals(inventory.projects.length, 2);
  assertEquals(typeof inventory.projects[0].customDomains[0].evaluationError, "string");
  assertEquals(inventory.projects[1].customDomains[0].evaluationError, undefined);
});

Deno.test("buildPagesInventory - a per-project deployments-list failure is scoped to that project's latestProductionDeployment", async () => {
  const fetchImpl = mockFetch([
    ["/pages/projects", () =>
      jsonResponse({
        success: true,
        result: [{ name: "broken-project", subdomain: "broken-project.pages.dev" }],
        errors: [],
      })],
    ["/domains", () => jsonResponse({ success: true, result: [], errors: [] })],
    ["/deployments", () => jsonResponse({ success: false, result: null, errors: [] }, 500)],
    EMPTY_ACCESS_APPS,
  ]);

  const inventory = await buildPagesInventory(creds, fetchImpl);

  assertEquals(
    typeof inventory.projects[0].latestProductionDeployment?.evaluationError,
    "string",
  );
});

Deno.test("buildPagesInventory - projects and Access applications fail independently", async () => {
  const fetchImpl = mockFetch([
    ["/pages/projects", () =>
      jsonResponse({
        success: true,
        result: [{ name: "marketing-site", subdomain: "marketing-site.pages.dev" }],
        errors: [],
      })],
    ["/marketing-site/domains", () => jsonResponse({ success: true, result: [], errors: [] })],
    ["/access/apps", () => jsonResponse({ success: false, result: null, errors: [] }, 500)],
    NO_DEPLOYMENTS,
  ]);

  const inventory = await buildPagesInventory(creds, fetchImpl);

  assertEquals(inventory.projects.length, 1);
  assertEquals(inventory.projects[0].evaluationError, undefined);
  assertEquals(inventory.accessApplications, null);
});
