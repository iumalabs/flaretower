# Feature Specification: Clone API Token Permissions

**Feature Branch**: `011-clone-token-permissions`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "Clone API Token Permissions — creating FlareTower's own
preview/production API tokens currently means manually re-checking every single permission checkbox
in the Cloudflare dashboard for each token, tedious and error-prone (easy to end up with
silently-mismatched scopes between environments). Make it easy to reuse one token's permission set
when creating the next one. Prefer a purely local helper — paste in one token's JSON payload, get
back a checklist or a JSON payload to paste into the next token's creation flow — that never calls
the Cloudflare API at all, avoiding FlareTower's own credential ever needing an 'API Tokens
Read'/'API Tokens Edit' scope (a major escalation per constitution Principle VIII). A
direct-API-call alternative should be documented for comparison, not built as the default."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Reuse an existing token's permissions when creating a new one (Priority: P1)

An operator is about to create a new Cloudflare API token (e.g. FlareTower's `preview` token, to
match a `production` token that already exists) in Cloudflare's own dashboard. Instead of manually
re-checking every permission checkbox from memory, they paste the existing token's permission
payload (copied from Cloudflare's own token-creation "JSON Payload" view) into a tool inside
FlareTower, and get back a clear checklist of what to select, or a payload they can paste directly
into Cloudflare's token-creation flow.

**Why this priority**: This is the entire reason the feature exists — the tedious, error-prone
manual re-selection is the pain point the request is about. Everything else is secondary.

**Independent Test**: Paste a real token's permission JSON into the tool; confirm the
checklist/output payload it produces, when used to create a new token in Cloudflare's dashboard,
results in a token with an identical permission set to the original — verifiable by comparing the
two tokens' own JSON payloads afterward.

**Acceptance Scenarios**:

1. **Given** an operator has a source token's permission JSON copied from Cloudflare's dashboard,
   **When** they paste it into the tool, **Then** they see a human-readable checklist of every
   permission group and scope it grants.
2. **Given** the same pasted input, **When** the operator asks for a payload to reuse, **Then** they
   receive a JSON payload shaped for Cloudflare's own token-creation flow, equivalent in permissions
   to the source.
3. **Given** the pasted text is not valid JSON, or doesn't match the shape of a Cloudflare token
   permission payload, **When** the operator submits it, **Then** they see a clear error explaining
   the input wasn't understood, not a blank or misleading result.

---

### User Story 2 - Verify two tokens' permissions actually match (Priority: P2)

An operator who already has two tokens (e.g. `preview` and `production`) wants to confirm they were
in fact given the same permissions — the exact silent-mismatch risk the original request calls out.
They paste both tokens' permission JSON into the tool and see either confirmation that they match,
or exactly where they differ.

**Why this priority**: Directly closes the "easy to end up with silently-mismatched scopes" risk
named in the original request — valuable on its own, but only after Story 1 establishes the
paste-and-parse mechanism.

**Independent Test**: Paste two known-identical permission payloads and confirm a "no differences"
result; paste two payloads that differ by one scope and confirm that exact difference is surfaced.

**Acceptance Scenarios**:

1. **Given** two pasted permission payloads that are identical in substance, **When** compared,
   **Then** the operator sees a clear "these match" result.
2. **Given** two pasted permission payloads that differ, **When** compared, **Then** the operator
   sees exactly which permission groups/scopes are present in one but not the other.

### Edge Cases

- What happens if the pasted text is malformed or not a recognizable Cloudflare token permission
  payload? MUST fail with a clear, specific error — never a silent empty or misleading result.
- What happens if a permission group in the pasted payload is one the tool doesn't specifically
  recognize (e.g. a newer Cloudflare permission type added after this feature was built)? MUST still
  be represented in the checklist/output (e.g. by its raw identifier), not silently dropped.
- What happens if the two payloads being compared in User Story 2 belong to tokens scoped to
  different Cloudflare accounts? The comparison still runs as a structural diff — recognizing that
  as a real possibility is the operator's own judgment call, not something this tool needs to detect
  or block.
- What happens if an operator pastes something that happens to include a live secret value (not just
  a permission policy)? The system MUST NOT persist, log, or transmit anything pasted into it beyond
  the current session's in-tool display.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: FlareTower MUST let an operator paste an existing Cloudflare API token's
  permission-policy JSON (as copied from Cloudflare's own token-creation view) into a tool within
  FlareTower.
- **FR-002**: From pasted input, FlareTower MUST produce a human-readable checklist of the
  permission groups/scopes it grants.
- **FR-003**: From pasted input, FlareTower MUST also produce a JSON payload equivalent, suitable
  for pasting directly into Cloudflare's own token-creation flow to reproduce the same permissions
  on a new token.
- **FR-004**: FlareTower MUST let an operator paste two permission payloads and see whether they
  match, and if not, exactly what differs between them.
- **FR-005**: This feature MUST operate entirely without FlareTower calling any Cloudflare API
  endpoint to read or create API tokens — the operator always performs the actual token creation
  themselves, in Cloudflare's own dashboard.
- **FR-006**: FlareTower's own Cloudflare API credential MUST NOT require any new permission scope
  to support this feature.
- **FR-007**: Pasted input MUST be handled only for the current session — MUST NOT be persisted to
  storage or written to any log.
- **FR-008**: If pasted input is not valid or not recognizable as a token permission payload,
  FlareTower MUST show a clear, specific error rather than an empty or silently-incorrect result.
- **FR-009**: FlareTower MUST make clear, in the tool itself, that it only reformats/compares what's
  pasted — it does not read, create, or modify any actual token in the operator's Cloudflare
  account.

### Key Entities

- **Permission Policy**: The set of permission groups and their scopes that a Cloudflare API token
  grants — the structure an operator pastes in and receives back, reformatted. Not a
  FlareTower-persisted entity; exists only transiently in the current session.
- **Comparison Result**: The outcome of comparing two Permission Policies — either "match" or a
  specific list of differences (present in one, absent in the other).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An operator goes from "existing token's permission payload in hand" to "ready-to-paste
  payload for a new, identically-scoped token" in under one minute, having manually re-selected zero
  permission checkboxes.
- **SC-002**: An operator determines whether two existing tokens' permission sets match — or exactly
  how they differ — in under one minute, without cross-referencing checkboxes by eye.
- **SC-003**: This feature ships with zero new Cloudflare API token scopes documented as required in
  the README — confirming FlareTower's own credential gains no new capability.
- **SC-004**: Nothing pasted into this tool is retrievable after the operator's session ends.

## Assumptions

- **Local-only by design, not just for v1**: per constitution Principle VIII (least-privilege; scope
  added only when a mutation feature actually needs it) and explicit product direction, this feature
  is scoped to a local paste-in/paste-out helper. A direct-Cloudflare-API alternative (FlareTower
  itself reading and/or creating tokens via `/user/tokens/*` endpoints) is a real, considered
  alternative — documented during planning as a rejected-for-now alternative, not built. Revisiting
  that would need its own explicit review, not an assumption made in passing here.
- **Source of the pasted payload**: Cloudflare's own token-creation UI exposes the permission policy
  as structured JSON (its "JSON Payload"/Terraform-adjacent view) — this feature parses that shape.
  It is not assumed to be pixel- or field-identical forever; the edge case for unrecognized
  permission groups covers reasonable drift in Cloudflare's own UI/API over time.
- **Scope of "permissions"**: this feature concerns only the permission groups/scopes portion of a
  token — not other per-token metadata (name, expiration, client IP/certificate restrictions), which
  remain the operator's own judgment call for each token, same as today.
- This feature does not change anything about the actual behavior, detection logic, or audit trail
  of any of the 7 existing Cloudflare-resource modules or the identity/authorization layer.
- This feature does not itself create, read, or modify any Cloudflare API token — the operator
  always performs that action directly in Cloudflare's own dashboard.
