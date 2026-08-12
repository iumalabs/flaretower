# Feature Specification: Semantic Versioning & Version-Gated Production Releases

**Feature Branch**: `010-semver-releases`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "Semantic Versioning & Version-Gated Production Releases — with the full originally-scoped module roadmap (Modules 1-8) plus the Design System & App Shell Alignment feature all complete, the project is treating this as its v1.0 milestone and moving to a real release process instead of every push to main going straight to production. Establish semantic versioning starting at v1.0.0, a roughly-daily automated release cadence, production deployments gated by release rather than by every push to main (preview stays on every push, unaffected), and the running application version surfaced in the UI's existing footer slot."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New work is automatically packaged into a versioned release (Priority: P1)

A maintainer merges changes to the project over the course of normal work. Without anyone manually creating a version number or writing release notes, the project automatically recognizes that new work has landed since the last release and, on a regular cadence, packages it into a new semantically-versioned release with a record of what changed.

**Why this priority**: Every other part of this feature depends on releases existing in the first place — production can't be gated by version, and the app can't display a version, until there's a real release process producing one.

**Independent Test**: Merge a change to the main branch, wait for the next scheduled release cycle (or trigger one manually), and confirm a new version was created with correct semantic-version incrementing and a changelog entry — verifiable without touching deployment or the UI at all.

**Acceptance Scenarios**:

1. **Given** new changes have been merged since the last release, **When** the next release cycle runs, **Then** a new version is created automatically with an appropriately incremented version number and a record of what changed.
2. **Given** no changes have been merged since the last release, **When** the next release cycle runs, **Then** no new version is created.
3. **Given** a maintainer needs a release before the next scheduled cycle (e.g. an urgent fix), **When** they trigger a release manually, **Then** a new version is created immediately, following the same versioning and record-keeping rules as an automatic release.
4. **Given** the automated release process encounters a failure, **When** that happens, **Then** the failure is visible to a maintainer rather than silently swallowed.

---

### User Story 2 - Production only updates when a release ships, not on every merge (Priority: P2)

An operator responsible for the live system merges several changes over a day. None of them reach production individually the moment they're merged; instead, production updates only when a release is published, so "what's running in production" always corresponds to one specific, identifiable version rather than an arbitrary in-between state of the main branch.

**Why this priority**: This is the direct value of having releases at all (User Story 1) — decoupling "merged" from "live" — but it depends on releases existing first, so it's ordered after Story 1.

**Independent Test**: Merge a change, confirm production does not update immediately; publish a release, confirm production updates as a direct result of that release — verifiable independently of whether the UI displays a version yet.

**Acceptance Scenarios**:

1. **Given** a change is merged to the main branch, **When** no release has been published yet, **Then** the production environment does not change.
2. **Given** a release is published, **When** that happens, **Then** the production environment updates to match that release.
3. **Given** the preview environment's existing behavior, **When** a change is merged or a pull request is opened, **Then** preview continues updating exactly as it did before this feature — unaffected by the production-side change.
4. **Given** a maintainer wants to know what is currently live, **When** they check, **Then** they can identify exactly which version production is running.

---

### User Story 3 - An operator can see which version is currently running (Priority: P3)

An operator using the application glances at the interface and can immediately see which version of the application they're using, without needing to ask anyone or check deployment logs elsewhere.

**Why this priority**: Valuable observability once the first two stories exist, but the least critical piece — the release and deployment process functions correctly even before this is visible anywhere.

**Independent Test**: Load the running application and confirm the currently-deployed version is visible in the interface, matching the most recently published release that was deployed to production.

**Acceptance Scenarios**:

1. **Given** a released version is currently deployed to production, **When** an operator views the application, **Then** they see that version's identifier displayed.
2. **Given** an operator is running the application locally or viewing a preview deployment (not a numbered production release), **When** they view the application, **Then** they do not see a fabricated or misleading production version number.

### Edge Cases

- What happens on the very first release, when there is no prior version to compare against? It MUST still succeed and MUST establish the starting version (v1.0.0) rather than failing for lack of a prior reference point.
- What happens if two release triggers (a scheduled one and a manual one) occur close together? The system MUST NOT produce two conflicting or duplicate versions for the same set of changes.
- What happens when the automated release cadence is temporarily unable to run (e.g. the automation itself is down for a day)? Missed cycles MUST NOT lose track of unreleased changes — the next successful cycle MUST still include everything accumulated since the last real release.
- What happens to a version's identifying record if a maintainer needs to know exactly what changed in a specific past release, well after the fact? That information MUST remain available, not just visible at release time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST use semantic versioning (MAJOR.MINOR.PATCH) for every release, starting at v1.0.0 for this milestone.
- **FR-002**: The system MUST determine whether there is anything new to release before acting, and MUST NOT create a release when there is nothing new since the last one.
- **FR-003**: On a regular, approximately-daily cadence, the system MUST automatically create a new release (with an appropriately incremented version number) whenever there is something new to include.
- **FR-004**: A maintainer MUST be able to trigger a release outside the normal cadence (e.g. for an urgent fix that can't wait for the next scheduled cycle).
- **FR-005**: Every release MUST include a reviewable record of what changed, retrievable after the fact, not just visible at the moment of release.
- **FR-006**: Production deployments MUST occur only as a direct result of a release being published — never as a direct result of a merge to the main branch alone.
- **FR-007**: The preview environment's existing deploy-on-every-push/PR behavior MUST remain unchanged by this feature.
- **FR-008**: The running application MUST be able to report its own currently-deployed version.
- **FR-009**: The application's user interface MUST display the currently running version to anyone viewing it.
- **FR-010**: The application MUST NOT display a fabricated or misleading version number when running in a context where no real released version applies (e.g. local development).
- **FR-011**: At any time, it MUST be possible to identify exactly which released version is currently live in production.
- **FR-012**: A failure in the automated release process MUST be surfaced to a maintainer rather than failing silently.

### Key Entities

- **Release**: A semantically-versioned, immutable snapshot of the project at a point in time — has a version number, a creation date, and a record of the changes it includes. Exactly one release is "currently in production" at any given time.
- **Running Version**: The version identifier the live application reports about itself — corresponds to whichever Release most recently triggered a production deployment; absent or clearly non-production-labeled in contexts (local/preview) where no Release applies.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of production deployments can be traced back to exactly one semantically-versioned release — never to an arbitrary, unlabeled state of the main branch.
- **SC-002**: A maintainer can determine exactly which version is currently running in production by looking at the running application itself, without consulting deployment logs or asking a colleague.
- **SC-003**: On any day new work is merged, a corresponding new release is available within 24 hours without a maintainer having to manually intervene.
- **SC-004**: A maintainer needing to ship an urgent fix outside the normal cadence can get it released without waiting for the next scheduled cycle.
- **SC-005**: The version displayed in the running application always matches the release that actually triggered the currently-live production deployment — never stale or mismatched.

## Assumptions

- **Automatic version-bump classification**: this project already mandates Conventional Commits for every commit message (constitution Principle X), so the automatic release process determining PATCH vs. MINOR bumps from commit types (e.g. `fix:` → patch, `feat:` → minor) is a reasonable, low-risk default rather than something requiring a new decision. A MAJOR bump (breaking change) is assumed to require deliberate maintainer action rather than being inferred automatically — "breaking" is a judgment call about real-world impact that a script parsing commit prefixes shouldn't make unsupervised for a tool with account-wide Cloudflare access.
- **Deploys follow releases automatically**: publishing a release is assumed to automatically trigger the corresponding production deployment (no separate manual "promote" step beyond the act of cutting the release itself) — this matches the original request's framing of "deploy by version instead of by push to main," not "add an extra approval gate."
- **Cadence mechanics**: "roughly daily" is interpreted as: checked on a fixed daily schedule, releasing only when there's something new (per FR-002/FR-003) — not a strict guarantee of exactly one release every single day regardless of activity.
- This feature does not change anything about the actual behavior, detection logic, or audit trail of any of the 7 existing Cloudflare-resource modules or the identity/authorization layer — it is deployment-process and build-tooling infrastructure, plus one small addition to the existing app shell's footer.
- This feature does not change the preview environment's deployment trigger, per the original request's explicit scoping.
