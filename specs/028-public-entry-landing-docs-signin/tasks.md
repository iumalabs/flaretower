---

description: "Task list for Public Landing, Documentation & Sign-In Entry"

---

# Tasks: Public Landing, Documentation & Sign-In Entry

**Input**: Design documents from `/specs/028-public-entry-landing-docs-signin/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/session-probe.md,
quickstart.md

**Tests**: Playwright e2e coverage is mandatory per constitution Principle VI (every
user-facing flow) and this feature's own quickstart.md scenarios — both new pages and the
sign-in hand-off are user-facing flows. The session-probe endpoint and the boot-time
routing decision (research.md §1) each get a dedicated unit test given their correctness
matters for a security-adjacent decision (which experience an unauthenticated visitor
sees).

**Organization**: Tasks are grouped by user story. Foundational work (the session probe and
the boot-time landing-vs-dashboard decision) is shared by US1 and US2 and must land first.
US3 (documentation) depends only on the same routing extension, not on the probe.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Existing single-Worker + React SPA structure (see plan.md Project Structure) — `worker/
modules/identity/`, `app/pages/`, `app/lib/`, `app/App.tsx`, `tests/e2e/`, `tests/unit/` at
repository root.

---

## Phase 1: Setup

No project initialization needed — existing Deno/React project, no new dependency or
config file.

---

## Phase 2: Foundational

**Goal**: Give the SPA a way to know, on boot, whether to render the public landing
experience or the existing authenticated dashboard at `/` — this blocks both US1 and US2,
and the routing extension it lands alongside also carries US3's new `/docs` route.

- [x] T001 Add `GET /api/identity/session` to `worker/modules/identity/routes.ts` per
  contracts/session-probe.md — no role requirement (unlike the existing `/users` routes),
  returns `{ email, role }` for the identity `accessAuth` already resolved onto the request
  context; adds no new validation logic.
- [x] T002 [P] Unit test for the session-probe route in
  `tests/unit/identity-session-route.test.ts` — asserts the route returns 200 with the
  resolved identity when `accessAuth` succeeds, and that it adds no bypass of `accessAuth`'s
  existing fail-closed behavior.
- [x] T003 [P] Add `app/lib/session.ts` — a thin client for `GET /api/identity/session`
  that resolves to either the identity object (200) or `null` (any non-200 outcome:
  network error, non-JSON response, or a fetch that lands on Access's own login page) —
  per research.md §1, callers never need to distinguish *why* it failed, only that it did.
- [x] T004 [P] Unit test for `app/lib/session.ts` in `tests/unit/session.test.ts` —
  covers the 200 case and at least two distinct non-200 outcomes (403 JSON-less response,
  malformed/non-JSON body) both resolving to `null`.
- [x] T005 Extend `app/lib/page-routes.ts` with two new public path keys — `landing` (path
  `/`, but only relevant when no session is present — see T006) and `docs` (path `/docs`) —
  following the file's existing `pathForPage`/`pageForPath` pattern (see its own comment
  on `worker-detail` for the precedent of a key needing special-case handling).
- [x] T006 Update `app/App.tsx`'s boot sequence: call `app/lib/session.ts` once on mount
  before deciding what to render at `/`. A resolved identity renders the existing
  authenticated app (unchanged, current behavior). `null` renders the new `LandingPage`
  (T007) instead of the authenticated Overview — this is the one behavioral change this
  task makes to existing boot logic. `/docs` renders `DocumentationPage` (T012)
  unconditionally, regardless of session state (spec.md Edge Cases).
- [x] T007 [P] Unit test for the boot-time decision in `tests/unit/page-routes.test.ts`
  (extending the existing suite) — covers: no session + `/` → landing; session + `/` →
  dashboard; `/docs` renders regardless of session state.

**Checkpoint**: Session probe exists and is tested; App.tsx can distinguish landing vs.
dashboard at `/`; both new pages have a route to render into, even though neither page's
content exists yet.

---

## Phase 3: User Story 1 - A visitor learns what FlareTower is before deploying it (Priority: P1) 🎯 MVP

**Goal**: An unauthenticated visitor opening `/` sees the public landing page described in
spec.md — headline, labeled sample exposure teaser, feature summary, self-hosting section —
with zero account data and zero authentication requirement anywhere on it.

**Independent Test**: Per spec.md — load `/` with no session, confirm the landing page
renders with no account-specific data and no request on load requires authentication.

- [x] T008 [US1] Create `app/pages/LandingPage.tsx` — header (logo, hostname, in-page
  anchor links, "Documentation" link to T012's route, "Sign in" button per US2), hero
  (badge, headline, subhead, primary CTA, micro-copy), reusing existing design tokens
  (`--bg-base`, `--brand-primary`, status colors — plan.md Constitution Check notes these
  must be reused, not reinvented) per spec.md User Story 1's exact copy.
- [x] T009 [P] [US1] Add the sample exposure-matrix teaser panel to `LandingPage.tsx` (or
  a co-located `app/components/ExposureTeaserPanel.tsx` if the row markup is substantial
  enough to warrant its own file) — the 4 fixed sample rows from spec.md, styled like the
  real Exposure table, header clearly labeled "SAMPLE" / "READ-ONLY PREVIEW · NOT YOUR
  ACCOUNT". No API call backs this panel — the rows are hardcoded.
- [x] T010 [P] [US1] Add the 3-up feature card grid and the self-hosting section to
  `LandingPage.tsx`, using the corrected self-hosting copy from research.md §4 (real
  `wrangler`-based deploy steps sourced from `README.md` — not the design mock's fictional
  CLI) and the footer bar.
- [x] T011 [US1] Playwright e2e spec `tests/e2e/landing-page.spec.ts` covering
  quickstart.md Scenario 1 (unauthenticated visitor sees the landing page, sample data is
  clearly labeled, no request requires auth) and Scenario 2 (authenticated visitor sees the
  dashboard instead, never the landing page).

**Checkpoint**: US1 is independently complete and testable — an unauthenticated visitor now
has a real public landing page at `/`.

---

## Phase 4: User Story 2 - A returning operator signs in and reaches their dashboard (Priority: P1)

**Goal**: Every "Sign in" entry point (landing page header/hero/teaser-panel, and the
documentation page once US3 lands) carries the visitor's browser to Cloudflare Access's own
challenge — plain navigation, no OIDC UI of any kind rendered by this app.

**Independent Test**: Per spec.md — from the landing page with no session, trigger "Sign
in" and confirm the browser navigates toward the Access-protected root (not a screen this
app resolves on its own).

- [x] T012 [US2] Add the "Sign in" action to `LandingPage.tsx`'s three entry points (header
  button, hero CTA, teaser-panel "SIGN IN TO SEE YOURS") — each navigates
  (`window.location.assign` or equivalent, not a client-side route change) to the app's own
  root, the path Cloudflare Access is configured to protect (research.md §1/§2). No
  intermediate screen is required by spec.md; if a brief "Redirecting to sign in…" state is
  added per research.md §3, it MUST show no issuer/scopes/callback/protocol-step detail.
- [x] T013 [US2] Playwright e2e spec `tests/e2e/sign-in-handoff.spec.ts` covering
  quickstart.md Scenario 3 — asserts each of the three "Sign in" entry points triggers a
  real navigation toward the protected root, and (per spec.md Acceptance Scenario 3) that
  any transitional state rendered along the way contains no fabricated protocol detail.

**Checkpoint**: US1 + US2 together deliver the full "learn about it, then sign in" MVP loop
end to end.

---

## Phase 5: User Story 3 - An operator or evaluator reads the documentation (Priority: P2)

**Goal**: `/docs` renders the 9-section documentation page from spec.md, reachable with no
session, with every section's content verified accurate against this repo's real deploy
process, token permissions, sign-in model, current nav items, status vocabulary, and actual
limits — not the design mock's generic/fictional copy (research.md §4).

**Independent Test**: Per spec.md — open `/docs` directly, confirm every TOC entry scrolls
to its section, and confirm deploy/permissions/sign-in content matches this project's real
current behavior.

- [x] T014 [US3] Create `app/pages/DocumentationPage.tsx` — sticky header (logo→home,
  version, "← BACK" link, "Sign in" button reusing T012's navigation), sticky TOC sidebar,
  and the 9 numbered sections' structural layout (lead paragraph + optional bullets/
  key-value list/code block/callout note per section, per spec.md User Story 3).
- [x] T015 [P] [US3] Write the "What FlareTower is" and "How a scan works" sections'
  content (spec.md sections 01 and 05 — accurate largely as transcribed, verify the
  "last scan result" storage claim against the real D1-backed implementation per
  research.md §4 before finalizing wording).
- [x] T016 [P] [US3] Write the "Deploy it" section's content, replacing the design mock's
  fictional CLI with the real `wrangler`-based steps sourced from `README.md` (spec.md
  section 02, research.md §4) — reuse the same corrected copy as T010's landing-page
  self-hosting section rather than authoring it twice.
- [x] T017 [P] [US3] Write the "Sign-in: Cloudflare Access only" section's content (spec.md
  section 03) — corrected per spec.md's User Story 2 model: no issuer/callback/scopes
  key-value list; describes Access injecting `Cf-Access-Jwt-Assertion`, validated per
  constitution Principle II.
- [x] T018 [P] [US3] Write the "Token scopes the scanner needs" section's content (spec.md
  section 04) — reconciled against this project's actual current required permissions per
  research.md §4 (including the Account Settings Read / Access: Groups Read / Access:
  Identity Providers Read gaps discovered after original launch), not the design mock's
  original incomplete list.
- [x] T019 [P] [US3] Write the "What each screen shows" section's content (spec.md section
  06) — sourced directly from `app/nav-items.ts`'s current `NAV_ITEMS` labels and tooltip
  descriptions (research.md §4), covering all 10 current nav entries including Token Tools.
- [x] T020 [P] [US3] Write the "Status vocabulary" section's content (spec.md section 07) —
  wording reconciled against the actual badge labels used in the implemented UI.
- [x] T021 [US3] Verify whether Security Posture (`worker/modules/security/`) has a
  user-editable baseline file matching the design mock's description; write "The baseline
  file" section's content (spec.md section 08) to describe whatever mechanism actually
  exists, rewriting it from scratch if no such file exists (research.md §4).
- [x] T022 [P] [US3] Write the "Limits and retention" section's content (spec.md section
  09) — real retention window and re-scan cadence per specs 007/019/024, dropping the
  design mock's placeholder numbers and the fictional CLI flag reference.
- [x] T023 [US3] Playwright e2e spec `tests/e2e/documentation-page.spec.ts` covering
  quickstart.md Scenarios 4 and 5 — TOC navigation, public reachability with no session,
  and the landing↔docs round trip via header/footer links.

**Checkpoint**: All three user stories independently complete; full feature ready for
final polish.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T024 Update `README.md` with the required Cloudflare Access Application path-scoping
  step (research.md §2) — documented the same way Principle VII's existing Preview-URLs
  step already is: prominent, required, manual, not automatable via Wrangler config.
- [x] T025 Run `deno fmt`, `deno lint`, `deno test`, and the full Playwright suite
  end-to-end (per this project's "always run the complete suite before every push"
  convention) before opening the PR.
- [ ] T026 Manually verify quickstart.md's five scenarios against a deployed preview or
  prod instance (not just local dev — issue #488's local `/api/*` routing gap may mask a
  real failure in the session-probe-dependent scenarios).

---

## Dependencies & Execution Order

- **Phase 2 (Foundational) blocks Phase 3, 4, and 5** — the session probe and the
  landing-vs-dashboard boot decision must exist before any page can be reached correctly.
- **Phase 3 (US1) and Phase 4 (US2) are tightly coupled** (the landing page's primary
  content *is* the entry point to sign-in) but remain separately testable per their
  Independent Test criteria — implement US1 first (it's the MVP), then US2's navigation
  wiring is a small addition to the same file.
- **Phase 5 (US3) depends only on Phase 2's routing extension**, not on US1 or US2's
  content — it can be built in parallel with Phase 3/4 once Phase 2 is checkpointed, though
  its "Sign in" button (T014) reuses T012's navigation helper once available.
- **Phase 6 (Polish) is last.**

## Parallel Execution Examples

Within Phase 2, T002/T003/T004/T007 can run in parallel once T001/T005/T006 land (each
touches a distinct test or lib file). Within Phase 5, T015–T020 and T022 (seven distinct
documentation-content tasks) are fully parallelizable — each is a self-contained content
section with no shared file conflicts; only T014 (the page shell), T021 (needs its own
verification step first), and T023 (needs all content in place) are sequential relative to
the rest.

## Implementation Strategy

**MVP first**: Phase 2 (Foundational) → Phase 3 (US1, landing page) is the smallest
shippable increment that gives the project a real public front door. Phase 4 (US2, sign-in
wiring) is a small addition on top and arguably should ship in the same PR as US1 since a
landing page whose only CTA does nothing is not a usable MVP on its own. Phase 5 (US3,
documentation) is independently valuable and can follow as a second PR.
