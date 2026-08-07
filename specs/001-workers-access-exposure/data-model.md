# Data Model: Workers & Access Exposure

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-07

This module extends the constitution-mandated baseline D1 schema (`users`,
`audit_log`) with tables of its own. It introduces no changes to the
baseline tables.

## Baseline (constitution-mandated, not owned by this module)

Referenced here for context only — created by the cross-cutting auth/audit
foundation, not by this feature:

- **`users`**: `sub` (PK, from Access JWT), `email`, `idp`, `created_at`,
  `last_seen_at`, app-level role.
- **`audit_log`**: records every *mutating action against the managed
  Cloudflare account* — who, what, when, before/after. **Not applicable to
  this module**: per spec FR-012, this module performs no Cloudflare account
  mutations, so it never writes to `audit_log`. Writes to this module's own
  findings table (below) are FlareTower's internal state, not an audited
  action against the customer's Cloudflare account.

## New tables (owned by this module)

### `exposure_findings`

One row per (hostname, evaluation run) — the module's core entity, backing
both the interactive inventory (User Stories 1–3) and the scheduled
new-vs-repeat alerting (User Story 4).

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID, generated per row |
| `worker_name` | `TEXT NOT NULL` | The Worker script name this hostname belongs to |
| `hostname` | `TEXT NOT NULL` | The specific hostname evaluated (custom domain, `workers.dev`, or Preview URL) |
| `hostname_kind` | `TEXT NOT NULL` | One of `custom_domain`, `workers_dev`, `preview_url` |
| `status` | `TEXT NOT NULL` | One of `safe`, `warning`, `critical`, `not_evaluated` — matches spec's Exposure Finding entity and the design system's status semantics |
| `reason` | `TEXT NOT NULL` | Short machine-and-human-readable explanation (e.g. "no Access application covers this hostname", "Access application has no policies", "insufficient token scope to evaluate Access coverage") |
| `evaluated_at` | `TEXT NOT NULL` | ISO 8601 timestamp of the run that produced this row |
| `run_id` | `TEXT NOT NULL` | Groups all rows from the same evaluation run (interactive or scheduled) |
| `run_trigger` | `TEXT NOT NULL` | `interactive` or `scheduled` — which entry point produced this run (both use the same shared evaluation module; this is provenance, not a behavior branch) |

**Indexes**: `(hostname, evaluated_at DESC)` — fetching the latest known
state per hostname (needed for the new-vs-repeat diff and for the
interactive view showing current state) is the primary read pattern.

**Retention**: this table is a rolling history, not permanently retained —
older rows beyond what's needed for the current state + previous-run diff
may be pruned by a later module (Audit & Drift, constitution §2 item 7,
which owns "what changed since yesterday" browsing). This module needs only
"current" and "immediately previous" per hostname to satisfy FR-008/FR-009.

### `exposure_alerts`

One row per alert-worthy transition (FR-008), so alerting is idempotent and
auditable independent of the raw findings history.

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `hostname` | `TEXT NOT NULL` | The hostname that transitioned |
| `previous_status` | `TEXT` | `NULL` if this is the first-ever evaluation of this hostname (still alert-worthy per spec Edge Cases: "no grace period on first run") |
| `new_status` | `TEXT NOT NULL` | The newly observed `warning` or `critical` status that triggered this alert |
| `run_id` | `TEXT NOT NULL` | FK-by-convention to `exposure_findings.run_id` |
| `detected_at` | `TEXT NOT NULL` | ISO 8601 |
| `acknowledged_at` | `TEXT` | `NULL` until an operator views/dismisses it in the interactive UI; delivery channel (email etc.) is out of scope per spec Assumptions |

**Rationale for a separate table from `exposure_findings`**: findings are a
per-run snapshot (many rows per run); alerts are the derived, much smaller
set of state *transitions* that FR-008/FR-009 and SC-005 care about. Keeping
them separate means the "don't repeat-alert on unchanged state" logic is a
simple existence check against this table, not a recomputation over full
findings history on every run.

## Entity relationships

```
Worker (from Cloudflare API, not persisted)
  └─ has 1..N Hostnames (custom domain / workers.dev / preview URL)
       └─ evaluated into exactly 1 exposure_findings row per run
            └─ a status change vs. the previous run's row for the same
               hostname produces 0..1 exposure_alerts rows
```

`Worker` and `Hostname` are not persisted as their own tables — they are
read live from the Cloudflare API on every run (per research.md §3) and only
their *evaluated result* is stored. This keeps FlareTower's D1 state from
silently drifting out of sync with the actual Cloudflare account between
runs — the account itself is always the source of truth for what Workers
and hostnames exist; D1 only remembers what was *found* about them.
