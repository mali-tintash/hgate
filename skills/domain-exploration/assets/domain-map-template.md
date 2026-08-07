# Domain Map

## Purpose

This document records confirmed business domains, subdomains, bounded contexts,
and ownership boundaries. Update it only when domain boundaries or
classifications change.

Lifecycle progress is intentionally stored in each BC's local `status.md` to
avoid merge conflicts between teams working on different BCs.

## Problem and Business Outcome

**Problem:** [Confirmed problem statement]

**Desired outcome:** [Observable business outcome]

## Scope

### In scope

- [...]

### Out of scope

- [...]

## Ubiquitous Language

| Term | Confirmed meaning | Used by | Anti-terms or conflicting meanings |
|---|---|---|---|
| [...] | [...] | [...] | [...] |

## Domain Inventory

| Domain/Subdomain | Classification | Business purpose | Owner | Status |
|---|---|---|---|---|
| [...] | Core / Supporting / Generic | [...] | [...] | Confirmed / Provisional |

## Bounded Context Inventory

| Bounded context | Domain/Subdomain | Owns | Does not own | Local status |
|---|---|---|---|---|
| [...] | [...] | [...] | [...] | `.github/skills/<bc-name>/status.md` |

## Business Capabilities

| Capability | Owning BC | Trigger | Outcome | Status |
|---|---|---|---|---|
| [...] | [...] | [...] | Confirmed / Provisional |

## Boundary Decisions

| Decision | Status | Owner | Evidence or local decision record |
|---|---|---|---|
| [...] | Confirmed / Open / Deferred | [...] | [...] |

## Open Boundary Gaps

| ID | Gap | Affected BCs | Owner | Disposition |
|---|---|---|---|---|
| [...] | [...] | [...] | Open / Deferred / Out of scope |

## Related Artifacts

- Context map: `docs/context-map.md`
- BC specifications under `.github/skills/<bc-name>/`
- Cross-cutting ADRs under `docs/adr/`
