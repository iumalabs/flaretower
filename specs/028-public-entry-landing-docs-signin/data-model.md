# Data Model: Public Landing, Documentation & Sign-In Entry

No new persistent entities. This feature introduces no database tables, no new columns on
existing tables, and no new stored state (see spec.md Key Entities and plan.md's Storage
line in Technical Context).

The only "data" involved is:

- **Landing page content** — fixed, hardcoded copy and the 4-row sample exposure teaser
  (spec.md User Story 1). Lives in source as static content, not fetched or stored.
- **Documentation content** — fixed, hardcoded copy for the 9 sections (spec.md User Story
  3), sourced at implementation time per research.md §4. Static content, not fetched or
  stored.
- **Session-probe response shape** — not a stored entity, just the read-through of the
  identity `accessAuth` already resolves per request (see contracts/session-probe.md).
