# Quickstart: Public Landing, Documentation & Sign-In Entry

Validation scenarios that prove this feature works end-to-end, once implemented. Run
against a local `deno task dev` instance (note: per issue #488, local dev may not route
`/api/*` through the real Worker in all cases — prefer verifying the session-probe-dependent
scenarios against a deployed preview or prod instance if local dev behaves unexpectedly) and
again against the deployed instance before considering this feature done.

## Prerequisites

- The Cloudflare Access Application has been reconfigured per research.md §2 to exclude
  `/`, `/docs`, and their required static asset paths from Access coverage, while
  `/api/*` and every other dashboard route remain covered exactly as before.
- A browser session with no active Access identity (private/incognito window, or signed out).
- A second browser session with a valid, active Access identity for the same instance.

## Scenario 1 — Unauthenticated visitor sees the landing page

1. In the signed-out session, open the instance's root URL.
2. **Expect**: the public landing page renders — headline, sample exposure teaser (clearly
   labeled sample data), feature summary, self-hosting section, footer.
3. Open browser devtools' network tab; confirm no request made during page load returns
   account-specific data or requires a `200` from an Access-gated endpoint to render.

## Scenario 2 — Authenticated operator sees the dashboard, not the landing page

1. In the signed-in session, open the instance's root URL.
2. **Expect**: the existing authenticated Overview dashboard renders directly — the
   landing page is never shown to this visitor.

## Scenario 3 — Sign in hands off to Cloudflare Access

1. In the signed-out session, on the landing page, click "Sign in with Cloudflare Access"
   (test each entry point: header button, hero CTA, sample-panel "SIGN IN TO SEE YOURS").
2. **Expect**: the browser navigates toward the app's Access-protected root; Cloudflare
   Access's own challenge takes over from there. No FlareTower-rendered screen claims to
   have completed a sign-in on its own.
3. Complete Access's real challenge (whatever IdP the test instance's Access policy uses).
4. **Expect**: landing on the authenticated dashboard afterward.

## Scenario 4 — Documentation page is public and accurate

1. In the signed-out session, open `/docs` directly (not via the landing page).
2. **Expect**: the documentation page renders with no sign-in prompt.
3. Click each table-of-contents entry; **expect** the page scrolls to the matching section.
4. Spot-check the "Deploy it" section against `README.md`'s actual self-hosting steps —
   **expect** an exact match, no fictional CLI/commands.
5. Spot-check the "What each screen shows" section against `app/nav-items.ts`'s current
   `NAV_ITEMS` — **expect** every current nav label present and worded identically.
6. Spot-check the "Sign-in" section — **expect** it describes Access injecting the
   `Cf-Access-Jwt-Assertion` header FlareTower validates, with no issuer/scopes/callback
   claim implying FlareTower runs its own OIDC client.

## Scenario 5 — Navigation between public pages requires no sign-in

1. From the landing page (signed out), click "DOCUMENTATION" — **expect** arrival at
   `/docs` with no sign-in prompt.
2. From `/docs`, click "← BACK" — **expect** arrival back at the landing page, still signed
   out, no prompt.

## Done when

All five scenarios pass in both a local dev run (where feasible — see the local-dev caveat
above) and against the deployed instance.
