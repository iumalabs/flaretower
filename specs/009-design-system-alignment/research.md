# Phase 0 Research: Design System & App Shell Alignment

## 1. Font delivery: self-hosted vs. Google Fonts CDN

**Decision**: Self-host IBM Plex Sans and IBM Plex Mono as static `.woff2`
files under `app/assets/fonts/`, referenced via `@font-face` in
`app/styles/tokens.css` (or a new `fonts.css` imported once), instead of
the `<link href="https://fonts.googleapis.com/...">` the design source
file itself uses for its own internal preview rendering.

**Rationale**: `docs/design.zip`'s own HTML preview pulls fonts from
Google's CDN, but that file is a design *reference* artifact, not
something the constitution asks the app to copy verbatim in its network
behavior. FlareTower is explicitly a self-hosted tool that already avoids
external runtime dependencies for its core function (single Worker, no
third-party auth, no external API besides Cloudflare's own). An operator
loading FlareTower's dashboard causes a request to `fonts.googleapis.com`/
`fonts.gstatic.com` on every visit if the CDN approach were copied
verbatim — a privacy/operational-security-relevant network side effect
(revealing that this account has a FlareTower instance and roughly when
someone is looking at it) for a security-review tool, and a hard external
dependency that breaks font rendering entirely in network-restricted
environments. Self-hosting removes both problems at the cost of vendoring
~4 small static font files (400/500/600/700 weights are not all required
— see below).

**Alternatives considered**:
- Google Fonts CDN link (matches the design source file's own markup
  byte-for-byte) — rejected for the reasons above.
- System font stack only, no IBM Plex at all — rejected: this is exactly
  the drift this feature exists to fix (finding #1 in the original
  cross-check); the typeface choice is a deliberate, documented part of
  the design system (design source: "IBM Plex Sans for UI, IBM Plex Mono
  for anything a machine produced").

**Weight scope**: the design's typography scale (`typeScale` in the
design source) only ever uses weight 400 and 600 for both families (no
500 or 700 usage appears in any of the 8 defined type tokens or any
reference screen). Only IBM Plex Sans 400/600 and IBM Plex Mono 400/500/600
need to be vendored — Mono's `--text-label` token specifically calls out
weight 500, Sans never does. Confirmed by re-reading every `typeScale`
entry and every inline `font-weight` in the design source.

## 2. Favicon implementation

**Decision**: Ship a single self-contained SVG favicon
(`app/assets/favicon.svg`, referenced via
`<link rel="icon" type="image/svg+xml" href="/favicon.svg">`) implementing
the design's specified simplified single-arc mark, rather than generating
a multi-resolution `.ico`/PNG set.

**Rationale**: All evergreen browsers (Chrome, Firefox, Safari 16+, Edge)
render SVG favicons and scale them correctly at every browser-requested
size, which is exactly what the design source's own favicon section
demonstrates conceptually (one mark, rendered at 16/24/32/48/64px) — an
SVG favicon achieves that natively without hand-producing 5 raster files.
A `.ico` fallback is not required for this project's realistic target
audience (self-hosted operators, not IE11 users).

**Alternatives considered**: Multiple PNG sizes + `.ico` — rejected as
unnecessary generation/maintenance overhead for no real compatibility
gain given the target audience.

## 3. Overview page data source

**Decision**: The Overview page (User Story 3) calls three endpoints
Module 7 (Audit & Drift) already exposes and does not introduce any new
backend endpoint or aggregation logic:
- `GET /api/audit/summary` → `PostureSummaryEntry[]` (`{module, kind,
  hasData, counts: {safe, warning, critical, not_evaluated}}`) plus
  `unavailableSources` — already computed by
  `worker/modules/audit/summary.ts`'s `computePostureSummary()`, which
  already implements exactly FR-017/FR-018's requirements (counts
  computed the same way each module's own inventory page's counts are
  computed; a source whose latest run couldn't be read reports
  `hasData: false` via `unavailableSources`, never fabricated zeros).
- `GET /api/audit/alerts` → the existing unified cross-module alert
  inbox (`worker/modules/audit/inbox.ts`) for the Overview page's
  "prioritized findings list" (US3/AC3).
- `GET /api/audit/changes` → the existing "what changed" digest
  (`worker/modules/audit/changes.ts`) for the Overview page's "recent
  scan activity" log (US3/AC4).

**Rationale**: Confirmed by reading `worker/modules/audit/sources.ts`'s
`AUDIT_SOURCES` registry — it already lists all 14 finding/alert-table
pairs across the 6 non-audit modules (`module` field values: `exposure`,
`dns`, `zero-trust`, `pages`, `storage`, `security`), which is exactly
the per-module rollup granularity FR-004's nav badges and US1/AC4 need.
Building a second aggregation path in this feature would directly
violate constitution Principle III ("the audit logic... MUST live in a
single shared module invoked identically... duplicating audit logic...
is a constitution violation") and FR-017's own explicit "no separate or
divergent counting logic" requirement — reusing Module 7's existing,
already-tested, already-live endpoints is not just simpler but the only
constitutionally compliant option once Module 7 already exists.

**Alternatives considered**: A new dedicated `/api/overview/summary`
backend endpoint that queries each module's tables directly — rejected:
it would either duplicate `computePostureSummary`'s logic (a Principle
III violation) or just call it internally and reshape the response for
no functional benefit, adding a maintenance seam for zero gain.

**Nav badge rollup**: per-module (not per-source) critical counts for
the sidebar (FR-004) are derived client-side (or in one small pure
helper function, unit-testable) by summing `counts.critical` across every
`PostureSummaryEntry` sharing the same `module` field from the existing
`GET /api/audit/summary` response — no new data, just a `reduce`.

## 4. Shared table component: one component, per-module column/row config

**Decision**: Build one `FindingsTable` component whose columns, row
data, and expanded-row detail renderer are all passed in as props by
each calling page, rather than either (a) building 7 separate
per-module table components, or (b) forcing every module into one
identical column schema.

**Rationale**: The design source's own reference table (Exposure matrix)
has 6 columns specific to Worker exposure data (Worker/Custom
domain/workers.dev/Preview URL/Access coverage/Status) — DNS records,
R2/KV/D1 bindings, Zero Trust applications, etc. do not share that shape.
The *pattern* the design system establishes (sortable columns, filter
chips by status, expandable rows, redundant critical-row marking, footer
counts) is what must be shared; the specific columns are inherently
per-module, matching spec.md's own Assumption on this point. A single
generic component parameterized by column/row config avoids both
duplicating the table chrome 7 times and forcing an artificial one-size
column schema that would misrepresent modules whose data doesn't fit it.

**Alternatives considered**: 7 independent table components — rejected,
duplicates the sortable/filterable/expandable chrome logic 7 times with
no benefit, and risks the 7 pages drifting apart from each other and
from the design source over time exactly as they already have.

## 5. Border-radius removal

**Decision**: Remove every `borderRadius` inline-style occurrence found
across `app/pages/*.tsx` and `app/components/ExposureStatusBadge.tsx`
(13 confirmed occurrences) as part of migrating each page onto the new
shared components, rather than a separate blanket find-and-replace pass.

**Rationale**: Every one of the 13 occurrences is inside a component this
feature already touches (the badge, and each page's per-entity card
markup being replaced by `FindingsTable`) — fixing it in place as part of
that component's rewrite is strictly less work and less risky than a
separate mechanical pass that would touch the same lines twice.

## 6. Routing

**Decision**: Keep `App.tsx`'s existing `useState`-based page-switching
model; add one more entry (`overview`) to the `PAGES` array and make it
the new default/first page, rather than introducing a router library.

**Rationale**: `App.tsx`'s own existing comment already states the
project's intent here explicitly: "Minimal state-based nav — no router
dependency yet. Revisit once enough modules land that a real router
earns its keep." Nothing about this feature changes that calculus (still
8 top-level destinations, no deep-linking requirement in spec.md); adding
a router dependency here would be unrequested scope and run against
constitution Principle IV/V's minimal-dependency spirit for a feature
that doesn't need one.
