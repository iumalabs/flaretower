# Phase 1 Data Model: Worker Detail Page

No new tables. One new column on an existing table (research.md §2). Everything else composes
existing entities from three modules' already-persisted findings, joined at read time.

## Schema change

`worker/db/migrations/0014_exposure_findings_add_covering_app_ids.sql`:

```sql
-- specs/023-worker-detail-page (research.md §2): evaluateHostname() already computes which
-- Access application(s) cover a hostname (findCoveringApps()) but previously only surfaced the
-- IDs concatenated into the human-readable `reason` string. Structured here instead, so the
-- Worker detail page can join against zt_app_findings without depending on reason's exact
-- wording. Nullable JSON array — same pattern as migration 0010's referenced_group_ids on
-- zt_app_findings; existing rows predating this migration have no value.
ALTER TABLE exposure_findings ADD COLUMN covering_app_ids TEXT;
```

`HostnameEvaluation` (`worker/modules/workers-access-exposure/types.ts`) gains:

```ts
export interface HostnameEvaluation {
  hostname: string;
  kind: HostnameKind;
  status: ExposureStatus;
  reason: string;
  coveringAppIds: string[]; // NEW — [] when status is "critical" (no covering app at all)
}
```

`evaluateHostname()` (`evaluate.ts`) sets it from the same `covering` array it already computes in
every branch (`[]` for the "not evaluated" and "no covering app" cases, `covering.map(a => a.id)`
for the "warning"/"safe" cases) — no new matching logic, just also returning what it already knows.

## Entities (composed, not stored)

### Worker detail

Assembled per request by `GET /api/workers/:worker_name/detail` (new route, `worker/modules/
workers-dashboard/routes.ts` or a new `detail.ts` in that module):

| Field           | Source                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| `worker_name`   | route param, echoed back                                                                                        |
| `environment`   | `classify.ts`'s `classifyEnvironment()` on this Worker's hostname kinds (same call `buildWorkersDashboard()` makes) |
| `routes`        | `exposure_findings` latest run, `WHERE worker_name = ?` (research.md §1) — see Route entry below                |
| `recent_changes`| `fetchAccountAuditLog()` (7-day window) filtered to this Worker's own hostnames (research.md §3)                |
| `cloudflare_url`| assembled from `CF_ACCOUNT_ID` + `worker_name` (research.md §4) — no fetch                                      |
| `unavailable`   | per-source failures — `exposure` (routes query itself, unlikely but symmetric with every other module), `policy` (the `zt_app_findings` join), `recent_changes` (the Cloudflare Audit Logs API call) |

Not-found (FR-008): if `worker_name` has zero rows (not even the no-hostnames marker) in the
latest exposure run, the route returns `404` with `{ error: "worker not found in latest evaluation run" }`.

### Route entry

One element of `routes[]`:

```ts
{
  hostname: string,
  kind: "custom_domain" | "workers_dev" | "preview_url",
  status: "safe" | "warning" | "critical" | "not_evaluated",
  reason: string,             // unchanged — Exposure inventory's existing one-line reason
  policy: {                   // null when covering_app_ids is empty/null (FR-004's "nothing
                               //   covers this route" case), NOT the same as an unavailable source
    app_id: string,
    app_name: string | null,
    app_domain: string,
    policy_rules: PolicyRuleLine[][],  // zero-trust's already-humanized shape, verbatim
  } | null,
}
```

`policy` is resolved by collecting every route's `covering_app_ids`, deduping, and querying the
latest `zt_app_findings` run `WHERE app_id IN (...)` once (not once per route) — a route whose
`covering_app_ids` names an app_id absent from the latest Zero Trust run (evaluation runs for the
two modules aren't atomic with each other) falls back to `policy: null` with the route's own
`reason` text still shown, rather than erroring the whole page.

The `NO_HOSTNAMES_MARKER_HOSTNAME` marker row (research.md §1) is filtered out of `routes[]`
exactly as `GET /inventory` already does — an empty `routes: []` with the marker present means
FR-007's "exposure doesn't apply" case; distinguished from FR-008's not-found case by whether the
Worker had *any* row (marker or real) in the latest run at all.

### Scoped change entry

One element of `recent_changes[]` — identical shape to `WorkersDashboardPage.tsx`'s existing
`RecentChange` interface (`occurred_at`, `actor`, `actor_source`, `action`, `target`,
`result_summary`), unchanged. `[]` with `unavailable` absent means genuinely no changes (FR-006);
`unavailable` containing a `recent_changes` entry means the Cloudflare Audit Logs API call itself
failed — the frontend must render these two states distinctly (FR-012, FR-006), matching the
existing `recent-changes-unavailable` pattern `WorkersDashboardPage.tsx` already implements.

## Response shape

```ts
// GET /api/workers/:worker_name/detail
{
  worker_name: string,
  environment: "production" | "preview",
  routes: RouteEntry[],
  recent_changes: ScopedChangeEntry[],
  cloudflare_url: string,
  unavailable: Array<{ source: "policy" | "recent_changes", error: string }>,
}
// 404 { error: string } when the Worker isn't in the latest exposure evaluation run
```

## Frontend navigation state (research.md §5)

`App.tsx` gains a `selectedWorker: string | null` state slice alongside the existing `page`
state, and lifts `WorkersDashboardPage`'s `page`/`sortKey`/`sortDir` up the same way (props instead
of local `useState`) so navigating to a Worker's detail and back preserves them (FR-011). Clicking
a Workers-table row sets `selectedWorker` and switches `page` to a new `"worker-detail"` entry (or
equivalent) whose `render()` reads `selectedWorker`; a "back" affordance on the detail page clears
`selectedWorker` and restores `page` to `"workers"`.
