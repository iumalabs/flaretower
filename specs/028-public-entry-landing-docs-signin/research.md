# Research: Public Landing, Documentation & Sign-In Entry

## 1. How does an unauthenticated visitor and an authenticated operator both land on `/`
   and see different content, given the Worker has no auth visibility outside `/api/*`?

**Decision**: Serve the same SPA bundle unconditionally at `/` (and `/docs`) — the Worker's
`fetch` handler already does this for every static path via `env.ASSETS.fetch()`, unchanged.
On boot, the client calls a new, tiny, read-only endpoint — `GET /api/identity/session` —
through the existing `accessAuth` middleware. A `200` response (a valid identity was
resolved) renders the authenticated dashboard exactly as today. Any non-200 outcome (403
from `accessAuth`'s existing fail-closed path, a network error, or an unexpected response
shape) renders the public landing page. No new authentication logic is written — this
probe surfaces the result of the *existing* Principle-II-compliant check, nothing more.

**Rationale**: Reuses the one already-constitution-compliant source of truth for "is this
request authenticated" instead of inventing a second one. Keeps the entire decision
client-side and stateless — no new cookie, no new session record, no server-side branching
on `/` itself.

**Alternatives considered**:
- *Worker inspects `Cf-Access-Jwt-Assertion` directly when serving `/` and returns
  different HTML.* Rejected: would duplicate `accessAuth`'s JWT-verification logic outside
  its one existing home, doubling the surface that has to stay correct for Principle II,
  for no real benefit over a client-side probe call.
- *Two separate hostnames/paths, one behind Access, one not, with a hard server redirect.*
  Rejected: more moving parts (two Access Application scopes to keep in sync, redirect
  logic to maintain) for the same outcome the probe achieves in one small endpoint.

## 2. What changes to the Cloudflare Access Application configuration does this feature
   require, and who is responsible for making that change?

**Decision**: The Access Application's path coverage must be narrowed to exclude the new
public paths (`/`, `/docs`, and the static asset paths the SPA bundle needs to boot from
those two entry points) while continuing to cover everything else, including every
existing dashboard route and all of `/api/*`. This is an operator-performed, deploy-time
Cloudflare dashboard configuration change — not something this codebase can perform or
enforce — and must be documented as a required step, the same way Principle VII already
requires documenting the separate Preview-URLs Access step.

**Rationale**: Cloudflare Access Application path scoping is dashboard/API configuration
external to the Worker; per [[never-touch-github-settings]]-style project convention
(dashboard/settings changes are the operator's action, never silently automated), this
must be a documented manual step, not something implementation tasks attempt to script
against the operator's live Cloudflare account.

**Alternatives considered**: None — Access Application configuration has no code-level
equivalent; this is inherent to how Access works.

## 3. What should the transitional "Sign in" loading state (if any) show between the click
   and the browser leaving for Cloudflare Access?

**Decision**: A brief, generic "Redirecting to sign in…" state with no protocol-specific
detail, shown only for the instant before `window.location` is set to the app's own root
(the path Access is configured to protect) — matching spec.md FR-006 and the design
source's option (b). No issuer/scopes/callback/step-checklist content ships.

**Rationale**: A real Access redirect is an immediate full-page navigation; there is no
multi-second window for an animated multi-step checklist to mean anything, and fabricating
one risks exactly the false protocol detail FR-006 prohibits.

**Alternatives considered**: The design source's literal multi-step animated hand-off
(rejected — misrepresents a protocol this app has no part in, prohibited by FR-006).
Dropping the transitional state entirely (viable, simpler; left as an implementation-time
choice between "nothing" and "one line of text" since both satisfy FR-006 — tasks.md should
not over-specify this cosmetic detail).

## 4. Documentation content accuracy — sources of truth for corrected sections

**Decision**: Pull the following from this repo directly at implementation time, not from
the design mock, per spec.md FR-004:
- Deploy steps: `README.md`'s self-hosting instructions and `wrangler.jsonc`.
- Required token permissions: this repo's actual current requirements — cross-reference
  memory of known permission gaps (Account Settings Read, Access: Groups Read, Access:
  Identity Providers Read, in addition to the base per-module scopes) so the documented
  list is complete, not just the design mock's original guess.
- Dashboard screen list/descriptions: `app/nav-items.ts`'s existing `NAV_ITEMS` labels and
  tooltip descriptions verbatim, so the doc page can never drift from the live sidebar.
- Status vocabulary wording: the actual badge labels used in the implemented UI (WARNING/
  CRITICAL/PROTECTED/N-A patterns already visible across existing screens), not the design
  mock's generic REVIEW/IDLE terms.
- "The baseline file" section: verify against the actual Security Posture module
  (`worker/modules/security/`) before writing a single line — if no user-editable baseline
  file exists in the real implementation, this section is rewritten to describe whatever
  mechanism (fixed baseline, hardcoded thresholds, etc.) actually exists instead.
- Retention/limits numbers: the actual audit/drift retention window and re-scan cadence
  already implemented (specs 007/019/024), not the design mock's placeholder numbers.

**Rationale**: Directly implements spec.md FR-004's prohibition on shipping fictional
product claims; sourcing from the live nav items and README keeps the doc page from
silently drifting out of sync with the product it describes.

**Alternatives considered**: Copying the design mock's content as a starting point and
patching it — rejected as higher-risk (easy to miss a fictional detail buried in otherwise
plausible-sounding copy) than writing each corrected section from the actual source of
truth first.
