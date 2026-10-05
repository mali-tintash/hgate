# Context Map

## Purpose

This document records confirmed relationships between bounded contexts. It
describes ownership and information exchange without sharing internal models or
prematurely fixing transport details.

## Context Relationships

Relationship IDs are stable, repository-unique kebab-case identifiers.

| Relationship ID | Provider/Owner BC ID | Consumer BC ID | Information or decision exchanged | Source of truth | Consistency expectation | Candidate interaction | Translation/ACL | Status |
|---|---|---|---|---|---|---|---|---|
| `[...]` | `[...]` | `[...]` | [...] | [...] | Immediate / Eventual / TBD | Request-response / Domain event / Scheduled sync / TBD | ACL name / None / TBD | Confirmed / Provisional |

## Relationship Details

### `[relationship-id]` — [Provider BC] -> [Consumer BC]

**Business purpose:** [...]

**Provider owns:**

- [...]

**Consumer owns:**

- [...]

**Published contract or event:**

- [Business-level description; detailed contract belongs in BC refinement]

**Failure and consistency expectations:**

- [...]

**Open contract questions:**

- [...]

**Decision evidence:**

- [BC-local decision record or cross-cutting ADR]

## Cross-BC Journeys

Journey IDs are stable, repository-unique kebab-case identifiers.

| Journey ID | Journey | Participating BC IDs | Entry point | Business outcome | Validation artifact |
|---|---|---|---|---|---|
| `[...]` | [...] | `[...]` | [...] | [...] | `docs/features/<feature-name>/validation.md` |

## Open Relationship Gaps

| ID | Relationship | Gap | Owner | Disposition |
|---|---|---|---|---|
| [...] | [...] | [...] | Open / Deferred / Out of scope |
