# ADR-001: Localize hGATE Decisions and Lifecycle State

**Status:** Accepted
**Date:** 2026-08-07
**Decision owners:** hGATE maintainers
**Reviewers:** Project contributors
**Review trigger/date:** Revisit if repository-scale status aggregation becomes necessary

## Context

hGATE supports several engineers and AI agents working on different BCs in
parallel. A global append-only decisions file or lifecycle table makes unrelated
BC work modify the same file, causing merge conflicts and weakening ownership.

The workflow still needs stable project-level domain boundaries, durable
cross-cutting decisions, and discoverable lifecycle progress.

## Scope and Non-Goals

### In Scope

- Storage of workflow-skill and BC decisions
- Storage of cross-cutting architecture decisions
- Storage of BC lifecycle state
- Ownership of domain and context maps

### Non-Goals

- Automated orchestration
- Centralized workflow dashboards
- Runtime deployment or release status

## Evidence

| Claim | Epistemic status | Source | Confidence |
|---|---|---|---|
| Parallel BC work should avoid shared mutable files | Observed | hGATE workflow design discussion | High |
| Decisions need an owning context and durable rationale | Observed | Refinement and enhancement workflows | High |
| Domain boundaries change less frequently than BC lifecycle state | Assumed | Expected DDD project workflow | Medium |

## Decision Drivers

- Minimize merge conflicts
- Preserve clear ownership
- Keep decisions close to their affected specifications
- Allow cross-cutting decisions to remain singular and linkable
- Make lifecycle state discoverable without duplicating it

## Alternatives Considered

### Option A: Global decision and lifecycle files

**Benefits:** Simple discovery and one place to read.
**Costs/risks:** Merge-conflict hotspot, unclear ownership, duplicated parallel
updates.
**Evidence confidence:** High.

### Option B: Fully local files without project-level maps or ADRs

**Benefits:** Maximum write isolation.
**Costs/risks:** Cross-cutting decisions and relationships become fragmented.
**Evidence confidence:** Medium.

### Option C: Local mutable artifacts plus stable maps and standalone ADRs

**Benefits:** Local ownership, low conflict rate, singular cross-cutting
decisions, and discoverable boundaries.
**Costs/risks:** Consumers must follow links across several files.
**Evidence confidence:** High.

## Decision

Use:

- `decisions.md` beside each workflow skill for skill-owned decisions
- `.github/skills/<bc-name>/decisions.md` for BC-owned decisions
- `.github/skills/<bc-name>/status.md` for mutable BC lifecycle state
- One standalone file under `docs/adr/` for each cross-cutting decision
- `docs/domain-map.md` and `docs/context-map.md` for stable project boundaries
  and relationships

Domain and context maps link to BC-local status rather than duplicating mutable
lifecycle values. Feature validation reports remain feature-local under
`docs/features/<feature-name>/`.

## Architecture Invariants

- No global append-only decision file
- No global mutable BC lifecycle table
- One authoritative lifecycle file per BC
- One authoritative ADR per cross-cutting decision
- Cross-BC validation does not mutate BC lifecycle

## Consequences

### Positive

- Independent BC work usually changes independent files
- Ownership and rationale stay near specifications
- Cross-cutting decisions have one authoritative record
- Workflow state can be linked without duplication

### Negative and Tradeoffs

- No single mutable dashboard summarizes every BC
- Readers must traverse links from maps to BC-local artifacts
- Aggregate reporting would require a read-only generated view

## Risks and Mitigations

| Risk | Mitigation | Residual risk/owner |
|---|---|---|
| Domain map becomes a conflict hotspot | Update only for confirmed boundary changes, not lifecycle transitions | Domain exploration owner |
| Local status becomes stale | Specialist completion gates update the owning BC's status | BC owner |
| Cross-cutting decisions are copied into BC files | Link to one ADR instead of duplicating its content | Reviewers |

## Decision Register

| Topic | Decision | Status | Owner | Rationale |
|---|---|---|---|---|
| BC decisions | Store in BC-local `decisions.md` | Decided | BC owner | Local ownership |
| BC lifecycle | Store in BC-local `status.md` | Decided | BC owner | Avoid shared writes |
| Cross-cutting decisions | Store one ADR per decision | Decided | Decision owner | Singular source of truth |
| Domain relationships | Store in stable domain/context maps | Decided | Domain owners | Discoverability |

## Open Decisions

| Question | Why it matters | Owner | Resolution path |
|---|---|---|---|
| Should hGATE later generate a read-only status dashboard? | Could improve visibility without shared writes | Maintainers | Revisit after adoption feedback |

## Exclusions

- CI status
- Deployment readiness
- Release management

## Validation

- Parallel BC changes should not require editing the same decision/status file.
- Every specialist workflow must name the lifecycle transition it owns.
- Repository searches must find no global append-only decision or lifecycle
  convention.
