// Cloudflare's GraphQL Analytics API (research.md §1) — the only Cloudflare
// API surface that exposes per-script request/error counts and CPU-time
// percentiles; the REST `/workers/scripts` family (used by Module 1) is
// inventory/configuration only, with no traffic data. Exact field names
// pinned against Cloudflare's documented `workersInvocationsAdaptive`
// dataset shape; final verification against a live account happens at
// quickstart.md's end-to-end run, matching every other module's own
// established pattern for pinning API shapes ahead of live verification.
import type { CloudflareCredentials } from "../workers-access-exposure/inventory.ts";

const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

export interface ScriptAnalytics {
  scriptName: string;
  requests: number;
  errors: number;
  cpuTimeP50Ms: number;
}

export interface AnalyticsWindow {
  perScript: ScriptAnalytics[];
  cpuTimeP99Ms: number | null;
}

interface GraphQLResponse {
  data?: {
    viewer?: {
      accounts?: Array<{
        workersInvocationsAdaptive?: Array<{
          dimensions: { scriptName: string };
          sum: { requests: number; errors: number };
          quantiles: { cpuTimeP50: number; cpuTimeP99: number };
        }>;
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

const QUERY = `
  query WorkersAnalytics($accountTag: String!, $start: Time!, $end: Time!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        workersInvocationsAdaptive(
          limit: 1000
          filter: { datetime_geq: $start, datetime_leq: $end }
        ) {
          dimensions { scriptName }
          sum { requests errors }
          quantiles { cpuTimeP50 cpuTimeP99 }
        }
      }
    }
  }
`;

async function queryWindow(
  creds: CloudflareCredentials,
  start: string,
  end: string,
  fetchImpl: typeof fetch,
): Promise<AnalyticsWindow> {
  const res = await fetchImpl(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { accountTag: creds.accountId, start, end },
    }),
  });

  if (!res.ok) {
    throw new Error(`Cloudflare GraphQL Analytics API returned HTTP ${res.status}`);
  }

  const body = await res.json() as GraphQLResponse;
  if (body.errors?.length) {
    throw new Error(`Cloudflare GraphQL Analytics API error: ${body.errors[0].message}`);
  }

  const groups = body.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
  const perScript = groups.map((g) => ({
    scriptName: g.dimensions.scriptName,
    requests: g.sum.requests,
    errors: g.sum.errors,
    cpuTimeP50Ms: g.quantiles.cpuTimeP50,
  }));

  // Account-wide P99 isn't a sum across scripts (percentiles don't
  // aggregate that way) — Cloudflare returns it as its own top-level
  // quantile when no scriptName dimension is requested, but since this
  // query dimensions by scriptName, the account-wide P99 is approximated
  // here as the maximum per-script P99 seen this window (the worst single
  // script's tail latency), which is the closest true-account-wide signal
  // obtainable from a per-script-dimensioned query without a second
  // (non-dimensioned) query. Documented as an approximation, not a
  // Cloudflare-reported account aggregate.
  const cpuTimeP99Ms = groups.length > 0
    ? Math.max(...groups.map((g) => g.quantiles.cpuTimeP99))
    : null;

  return { perScript, cpuTimeP99Ms };
}

export interface WorkersAnalyticsResult {
  current: AnalyticsWindow;
  previous: AnalyticsWindow;
}

// Two windows (research.md §1) so routes.ts can compute the day-over-day
// request-count comparison FR-006 needs.
export async function fetchWorkersAnalytics(
  creds: CloudflareCredentials,
  now: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<WorkersAnalyticsResult> {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const previousEnd = start;
  const previousStart = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  const [current, previous] = await Promise.all([
    queryWindow(creds, start, end, fetchImpl),
    queryWindow(creds, previousStart, previousEnd, fetchImpl),
  ]);

  return { current, previous };
}
