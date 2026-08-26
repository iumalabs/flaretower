# Feature Specification: Public Landing, Documentation & Sign-In Entry

**Feature Branch**: `028-public-entry-landing-docs-signin`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "Public entry experience: landing page, documentation page, and a
Cloudflare Access sign-in flow, sourced from the Claude Design project 'FlareTower' (file
'FlareTower App.dc.html')."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A visitor learns what FlareTower is before deploying it (Priority: P1)

A prospective operator who has never deployed FlareTower opens the project's public
landing page (its `/`) — before they have any Cloudflare Access session at all — and can
read what the product does, see a sample (clearly-labeled, not-their-account) view of the
flagship Exposure screen, and understand the self-hosting model, without needing to sign
in first.

**Why this priority**: This is the only screen a visitor with zero prior context ever sees.
Without it, the only way to evaluate FlareTower is to read source code or already be an
authenticated operator on someone else's instance — there is no public front door today.

**Independent Test**: Load the site's root URL with no Access session established. Confirm
the landing page renders (headline, sample exposure teaser, feature summary, self-hosting
section) with no account-specific data anywhere on the page, and confirm no request the
page makes on load requires authentication.

**Acceptance Scenarios**:

1. **Given** a visitor with no Access session, **When** they open the instance's root URL,
   **Then** they see the public landing page (not a login wall, not a blank screen, not the
   authenticated Overview dashboard).
2. **Given** the landing page is open, **When** the visitor reads the sample exposure
   panel, **Then** every row is visibly labeled as sample/preview data, not the operator's
   real account.
3. **Given** the landing page is open, **When** the visitor clicks "Documentation",
   **Then** they land on the documentation page (User Story 3) without being asked to sign
   in first.

---

### User Story 2 - A returning operator signs in and reaches their dashboard (Priority: P1)

An operator who already has a Cloudflare Access identity clicks "Sign in" (from the
landing page, the documentation page, or by visiting a dashboard URL directly) and is
carried through to their authenticated FlareTower dashboard, authenticating with whatever
identity provider their organization's Access policy is already configured with — never
with anything FlareTower itself asks for or stores.

**Why this priority**: Without a working path from "public page" to "authenticated
dashboard," the landing and documentation pages are a dead end. This is also the feature's
highest-risk piece: it sits directly on top of the project's non-negotiable authentication
model (Cloudflare Access is the *only* gate — see constitution Principles I & II), so its
acceptance criteria exist specifically to prevent this feature from growing any
authentication logic of its own. Signing in is also the single action that converts a
visitor into an operator; every other public-page element exists to lead here.

**Independent Test**: From the public landing page (no session), trigger "Sign in" and
confirm the browser is carried to a URL that Cloudflare Access itself intercepts and
challenges — i.e., the action is a plain navigation, not a screen FlareTower renders and
resolves on its own. Separately, with a valid Access session already established, confirm
"Sign in" lands the operator on the authenticated dashboard directly, with Cloudflare
Access passing them straight through with no further challenge. (Opening the root URL
itself, with or without a session, still shows the public landing page — see the
Assumptions section and [issue #526](https://github.com/iumalabs/flaretower/issues/526)
for why this feature does not attempt to detect an authenticated visitor at `/` and divert
them away from it.)

**Acceptance Scenarios**:

1. **Given** a visitor with no Access session on the landing page, **When** they click
   "Sign in with Cloudflare Access" (from the header, the hero, the sample-panel teaser, or
   the documentation page), **Then** the browser navigates toward the real, Access-protected
   application — control passes to Cloudflare Access, not to any sign-in screen FlareTower
   renders and completes by itself.
2. **Given** an operator with an active, valid Access session, **When** they click "Sign
   in" from the landing or documentation page, **Then** they land on their authenticated
   dashboard (Overview) directly, with no additional challenge or intermediate screen.
2a. **Given** that same operator, **When** they instead open the instance's root URL
   directly (bookmark or typed address), **Then** they still see the public landing page,
   not an automatic redirect into the dashboard — an authenticated visitor can view the
   public landing page the same as anyone else (see Assumptions).
3. **Given** a visitor mid-sign-in is shown any transitional "redirecting…" state by
   FlareTower's own UI, **When** that state is inspected, **Then** it displays no protocol
   detail FlareTower does not actually possess or control — no identity-provider issuer,
   OAuth scopes, callback path, or step-by-step handshake status invented for the display.
   (These exist entirely inside Cloudflare Access, outside this application.)
4. **Given** an operator whose Access session has expired or was revoked, **When** they
   try to reach a dashboard URL, **Then** they end up back at the point where Cloudflare
   Access re-challenges them — FlareTower does not attempt to detect, explain, or work
   around an expired session itself.

---

### User Story 3 - An operator or evaluator reads the documentation (Priority: P2)

Someone deciding whether to deploy FlareTower, or an existing operator who forgot a detail
(which token permissions the scanner needs, what a status badge means, how sign-in works),
opens the documentation page, finds the relevant section from a table of contents, and
reads accurate, current information about *this* project — not generic or aspirational
copy that doesn't match how it actually behaves.

**Why this priority**: Documentation multiplies the value of User Story 1 (it's where a
convinced-but-not-yet-sure visitor goes deeper) but isn't required for the core "learn
about it, then sign in" path to function, so it can ship after the landing/sign-in pair.

**Independent Test**: Open the documentation page directly (no session). Confirm every
section's on-page table of contents entry scrolls to the matching section, and spot-check
that the deploy instructions, the sign-in explanation, and the required-token-permissions
list match this project's actual current setup process and requirements rather than a
generic placeholder.

**Acceptance Scenarios**:

1. **Given** the documentation page is open, **When** the visitor clicks any table-of-
   contents entry, **Then** the page scrolls to that section.
2. **Given** the documentation page's deploy-instructions section, **When** compared
   against this project's real self-hosting setup steps, **Then** the two match — no
   fictional installer, command, or flag that doesn't exist in this project.
3. **Given** the documentation page's sign-in-explanation section, **When** compared
   against User Story 2's actual behavior, **Then** it describes FlareTower validating an
   identity Cloudflare Access already established — never a FlareTower-owned sign-in
   protocol, issuer, or callback.
4. **Given** the documentation page's required-token-permissions section, **When**
   compared against the permissions this project's scanner actually requires today,
   **Then** the list is complete and current (including any permission gaps discovered
   after this project's original launch).
5. **Given** the documentation page, **When** the visitor clicks "Sign in", **Then** the
   same behavior as User Story 2 Acceptance Scenario 1 occurs.

---

### Edge Cases

- A visitor already mid-way through an Access challenge (e.g., they clicked "Sign in",
  Access redirected them to their identity provider, and they cancel or fail that
  provider's own login) — what does FlareTower show them when they land back on its
  hostname without a valid session? (Expectation: they see the public landing page again,
  same as any never-signed-in visitor — FlareTower has no error state of its own to show,
  since it never knew the attempt was happening.)
- An operator signs out. Since FlareTower issues no session of its own to clear, what does
  "sign out" mean and where does it lead? This spec treats "sign out" as **out of scope**
  (see Assumptions) rather than guessing at a behavior — the existing authenticated app
  shell is owned by prior specs, and any sign-out affordance added there is a decision for
  whoever picks that up, not assumed here.
- A visitor opens the documentation page's URL directly (not via the landing page) with an
  *active* Access session already established — do they see the public documentation page,
  or get redirected into the dashboard? (Expectation: they see the documentation page
  regardless of session state — it's public reference material, not part of the
  authenticated app, and forcing a signed-in visitor away from a page they intentionally
  opened would be surprising.)
- The same question, but for the landing page itself: an operator with an active session
  opens `/` directly — redirected into the dashboard, or shown the landing page?
  (Expectation, as of [issue #526](https://github.com/iumalabs/flaretower/issues/526):
  shown the landing page, same as the documentation-page case just above — the feature's
  original design redirected them instead, which turned out to make it impossible for an
  authenticated operator to ever view the public landing page at all. FR-002 was revised to
  match.)
- The landing page's sample exposure panel must never be reachable in a state that shows
  real account data — what prevents that? (Expectation: the four sample rows are fixed,
  hardcoded content, not the result of any API call — there is no code path by which real
  account data could appear there, authenticated or not.)
- What happens if someone links directly to a dashboard URL (e.g. `/workers`) without a
  session? (Expectation: Cloudflare Access challenges them before FlareTower's own code
  ever runs, exactly as it does today for every existing dashboard route — this feature
  does not change that.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST show a public landing page to any visitor who does not have
  an active, valid Cloudflare Access session, containing: a headline and explanation of
  what FlareTower does, a labeled sample/preview of the Exposure screen using fixed
  placeholder data (never real account data), a summary of the product's key properties,
  and an explanation of the self-hosting model.
- **FR-002**: The system MUST show the public landing page at the instance's root URL
  (`/`) to every visitor, regardless of Cloudflare Access session state — it MUST NOT
  attempt to detect an already-authenticated visitor and automatically redirect them into
  the dashboard. **Revised** from this feature's original design (which did exactly that
  auto-redirect) after [issue #526](https://github.com/iumalabs/flaretower/issues/526)
  found it made it impossible for an authenticated operator to ever view the public landing
  page. Reaching the dashboard is unaffected: the "Sign in" action (FR-005) takes any
  visitor, authenticated or not, straight to the dashboard's own URL (`/app`).
- **FR-003**: The system MUST provide a publicly reachable documentation page, containing
  at minimum: what the product is and isn't, how to deploy/self-host it, how sign-in works,
  which Cloudflare API token permissions it requires and why, how a scan works, what each
  dashboard screen shows, the status vocabulary used throughout the product, and the
  product's known limits and data-retention behavior.
- **FR-004**: The documentation page's content MUST accurately describe this project's
  actual current setup process, required token permissions, sign-in behavior, dashboard
  screens, and limits — content describing a different, fictional, or aspirational version
  of the product (a different installer, different commands, a different auth model, or
  screens/permissions that don't match what the product currently has) MUST NOT ship.
- **FR-005**: The system MUST provide a "Sign in" action, reachable from the landing page
  and the documentation page, that results in the visitor's browser being carried to
  Cloudflare Access's own authentication challenge for this instance.
- **FR-006**: The system MUST NOT implement, embed, or simulate to completion any part of
  an identity-provider authentication protocol (no OAuth/OIDC client flow, no token
  exchange, no locally-issued session, no locally-stored credential) as part of this
  feature. Where a brief transitional loading state is shown between "Sign in" being
  clicked and the browser leaving for Cloudflare Access, that state MUST NOT display any
  identity-provider-specific detail (issuer, scopes, callback path, or handshake step
  status) that this application does not actually possess, since Cloudflare Access — not
  this application — performs that handshake entirely outside this application's code.
- **FR-007**: The public landing and documentation pages MUST NOT require, request, or
  accept any credential, account identifier, or Cloudflare API token from the visitor.
- **FR-008**: The public landing and documentation pages MUST NOT expose any operator's
  real Cloudflare account data, under any circumstance, including to a visitor who has an
  active session — these pages render fixed, non-account-specific content only.
- **FR-009**: The system MUST allow a visitor to navigate from the landing page to the
  documentation page and back without needing to sign in at any point in that journey.

### Key Entities

*(No new data entities. This feature adds no stored state of its own: the landing and
documentation pages render fixed content, and sign-in is a hand-off to Cloudflare Access
with no locally-persisted session or identity record.)*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor with no prior context can find, on the landing page
  alone, an accurate one-paragraph description of what the product does and how it is
  deployed, without needing to sign in or read source code.
- **SC-002**: 100% of the landing page's sample data (the exposure-matrix teaser) is
  visibly labeled as sample/preview content, distinguishable from real account data at a
  glance.
- **SC-003**: An operator with an existing, valid Access session reaches their dashboard
  via the "Sign in" action in one click, with no additional challenge or intermediate
  screen — while still being able to view the public landing page itself at `/` without
  being automatically diverted into the dashboard.
- **SC-004**: Every documentation section is reachable from its table-of-contents entry in
  a single click/tap, and every documentation claim about setup steps, required token
  permissions, and sign-in behavior matches this project's actual current behavior (zero
  fictional commands, flags, or protocol details).
- **SC-005**: Zero requests made by the public landing or documentation pages require an
  authenticated session or expose account-specific data.

## Assumptions

- The instance's root URL (`/`) always shows the public landing page, regardless of session
  state (FR-002) — it is not the place unauthenticated and authenticated visitors diverge.
  They diverge instead at the "Sign in" action (FR-005), which takes either kind of visitor
  to the dashboard's own URL (`/app`): Cloudflare Access challenges an unauthenticated
  visitor there and passes an already-authenticated one straight through. (Issue #516 moved
  the dashboard to its own `/app` prefix shortly after this spec's original version shipped;
  issue #526 then found that the original root-URL-diverges design actively broke the
  landing page for authenticated operators, which is why FR-002 no longer describes that
  design.)
- Every existing authenticated dashboard route continues to sit entirely behind Cloudflare
  Access exactly as it does today; this feature only adds new *public* routes (landing,
  documentation) and a sign-in entry point — it does not loosen protection on any existing
  route.
- "Sign out" behavior for the already-authenticated app shell (its existing user menu) is
  **out of scope** for this spec. FlareTower mints no session of its own to clear, so any
  future "sign out" affordance there can only ever be a link to Cloudflare Access's own
  logout, and that's a decision for whoever owns that existing UI, not assumed here.
- The documentation page's content (deploy steps, required token permissions, sign-in
  explanation, screen descriptions, status vocabulary, limits) must be written from this
  project's actual current README, constitution, and implemented screens at
  implementation time — not transcribed verbatim from the source design mockup, which was
  written against a generic/fictional version of the product before this project's own
  deploy process, screen names, and token-permission history existed.
- No new persistent data storage is introduced by this feature (see Key Entities).
