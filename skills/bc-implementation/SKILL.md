---
name: bc-implementation
description: >
  Use this skill to implement one refined but not-yet-built Bounded Context from
  its approved specification files. Trigger phrases include "implement this BC",
  "generate code from the BC specs", "build the refined bounded context", and
  "start implementation after refinement". This skill validates specification
  readiness, maps BDD scenarios to tests, writes failing tests before production
  code, implements the complete BC, and verifies traceability. Do not use it for
  changing an already-built BC; use bc-enhancement instead.
context: fork
---

# BC Implementation

## Purpose

Implement one approved Bounded Context (BC) from the artifacts produced by
`bc-refinement`. Preserve the BC boundary, turn its BDD scenarios into executable
tests, and deliver complete production code without inventing missing business
behavior.

This skill is for an initial implementation. If the BC is already materially
implemented and its behavior must change, stop and use `bc-enhancement`.

## Input

- The name of one BC
- An approved skill directory at `.github/skills/<bc-name>/`
- Project-wide engineering conventions
- Any confirmed handoff from `domain-exploration`

The BC skill directory should contain:

- `SKILL.md`
- `domain-model.md`
- `bdd-scenarios.md`
- `decisions.md`
- One `*-acl.md` file for each external integration
- Optional `properties.md` when Goal 3 business-logic verification was selected

## Output

- Complete source code for one BC
- Database migrations or persistence definitions required by the specification
- Unit tests for domain and application behavior
- Integration or acceptance tests for critical BDD scenarios
- Adapters for specified external dependencies
- A specification-to-code traceability report
- An immutable module-scoped BDD-to-TDD sign-off artifact
- When explicitly selected, executable property/model evidence and a separate
  immutable Goal 3 sign-off artifact
- A completion report listing any explicitly deferred items

## Golden Rules

1. One BC per implementation session.
2. Approved BC specification files are the source of truth.
3. Never close a specification gap with an implementation assumption.
4. Write a failing test before the production behavior that makes it pass.
5. Implement the whole approved BC, not only the happy path.
6. Access adjacent BCs and external systems only through specified contracts,
   ports, events, and ACL adapters.
7. Do not import another BC's aggregates, repositories, application services, or
   persistence models.
8. Do not modify BC specification files during implementation unless the user
   first returns the design to `bc-refinement`.
9. Do not report completion while approved rules or scenarios remain
   unimplemented.
10. Obtain user approval of the implementation plan before editing source code.

## Workflow

### Phase 0 - Scope Lock and Full State Read

Before generating code:

1. Read every file in `.github/skills/<bc-name>/`.
2. Read project-wide instructions such as `CLAUDE.md` or `AGENTS.md`.
3. Read adjacent BC skill files named by the target BC, but only to understand
   ownership and published contracts.
4. Inventory existing source files matching the BC's domain terms.
5. Identify shared project patterns needed for implementation:
   - Module registration and dependency injection
   - Error handling and validation
   - Persistence and migrations
   - Authentication, authorization, and tenancy
   - Testing conventions
   - External adapter registration

Do not copy business rules from another BC. Existing code is evidence of project
conventions, not a substitute for the target BC specification.

Read the target BC's `decisions.md` as supporting rationale. The current
behavioral contract remains the complete set of approved BC specification files.

Read `status.md` and require lifecycle `REFINED` or `SPEC_REVIEWED`. After
eligibility and specification readiness pass and the user approves the plan,
record:

```text
REFINED | SPEC_REVIEWED -> IMPLEMENTING
```

Immediately synchronize that lifecycle into `docs/hgate-project.json` and
validate it; the transition remains owned by `status.md`.

Declare:

```text
Scope lock: This session implements the <bc-name> BC only.

In scope:
- <capabilities owned by this BC>

Out of scope:
- <adjacent BC>: <what it owns>

Cross-BC interaction:
- <contract, port, or event this BC uses or publishes>
```

Then report what was read:

```text
Phase 0 complete.

Skill files:
- [...]

Project conventions:
- [...]

Adjacent contract files:
- [...]

Existing source files:
- [...]
```

#### Initial-build eligibility check

Classify the current code state:

| State | Action |
|---|---|
| No BC implementation exists | Continue |
| Only empty scaffolding or generated placeholders exist | Continue and identify what may be replaced |
| A partial implementation exists but has never been completed | Report it and ask whether to complete it here or first reconcile it through refinement |
| A material implementation already exists | Stop and recommend `bc-enhancement` |
| Code behavior conflicts with the approved specification | Stop and recommend `bc-enhancement`; do not overwrite the conflict as if it were a new build |

Do not infer eligibility merely from the absence or presence of a module
directory. Trace enough behavior to classify it correctly.

### Phase 1 - Specification Readiness Gate

Validate the specification before planning source code.

#### Required consistency checks

Run the deterministic part first and treat each failure as a blocking gap
(`G#`) with its `file:line`; do not re-derive these by reading the files:

```bash
npm run verify:spec -- --bc <bc-name> --phase implementation
```

It enforces checks 1 (VSP001), 4 (VSP003/004/102/103), 5 (VSP002/101), 6
(VSP105), and the clean-spec preconditions (VSP006-013, VSP104 unresolved
`[OPEN]` questions, VSP106 lifecycle `REFINED`/`SPEC_REVIEWED`). If the tool is
not installed, perform the list manually. Checks 2, 3, 7, 8, 9, and 10 stay
judgment checks; apply them yourself.

1. Every aggregate in `SKILL.md` is defined in `domain-model.md`.
2. Every business rule has at least one BDD scenario.
3. Every lifecycle state has defined allowed transitions and actors.
4. Every external dependency has an ACL file and port contract.
5. Every emitted or consumed event has a defined name and payload.
6. Persistence ownership and tenant/global schema placement are explicit.
7. Authorization and resource ownership rules are explicit.
8. Idempotency, concurrency, and duplicate-request behavior are explicit where
   side effects or state transitions exist.
9. Failure behavior is defined for validation and external dependencies.
10. Ubiquitous language is consistent across all files.

Produce:

```text
## Specification Readiness Report

### Ready
- [capability/rule]: supported by [file:section]

### Blocking gaps
- [G1] [missing or contradictory behavior]
  Needed before implementation: [decision or artifact]

### Non-blocking deferred items
- [item]: [why it does not affect the approved implementation]

Readiness: READY | BLOCKED
```

#### Gap protocol

A gap is blocking when different answers could change:

- A BC boundary or owner
- An aggregate or lifecycle
- An API, event, or port contract
- Persistence or consistency behavior
- Authorization or tenant isolation
- Idempotency, financial effects, or recovery
- An expected success or failure outcome

When a blocking gap exists:

1. Explain the ambiguity and its implementation consequences.
2. Recommend the most likely path and alternatives.
3. Ask the user to confirm how to resolve it.
4. Return the BC to `bc-refinement` so the specification files are updated.
5. Resume implementation only after the revised specification is approved.

Do not edit the specification ad hoc inside this skill. Do not mark a gap closed
until the user confirms it and the approved specification reflects the answer.

Implementation-only decisions concluded during this session belong in the
target BC's `decisions.md`. Decisions affecting several BCs require a standalone
ADR under `docs/adr/`, linked from each affected BC. Never append to a global
decisions file.

### Phase 2 - Build the Traceability Matrix

**Before doing any work in this phase, read `references/phase-2-build-the-traceability-matrix.md` in full and follow it exactly. It contains the complete body of this phase; do not proceed from memory or skip it.**

### Phase 3 - Implementation Plan and Approval

Create an ordered file-by-file plan containing:

- Files to create or modify
- Specification rule or scenario implemented by each file
- Tests written before each production component
- Module wiring and dependency injection
- Migrations, indexes, and constraints
- Ports and adapters
- Public entry points
- Validation commands

Use:

```text
## Implementation Plan - <bc-name>

### Slice 1 - <business behavior>
[test file]
  ADD: failing tests for [rules/scenarios]

[production file]
  ADD: minimum implementation satisfying those tests

### Slice 2 - <business behavior>
...

### Final wiring
[module/configuration files]
  ADD/MODIFY: [...]

### Validation
- [...]
```

Plan by cohesive vertical business slices where practical. Within each slice,
preserve the dependency direction:

```text
presentation -> application -> domain ports
                                  ^
                                  |
                         infrastructure adapters
```

Present the plan and wait for explicit user approval. Do not modify source,
migrations, or tests before approval.

### Phase 4 - Test-First Execution

**Before doing any work in this phase, read `references/phase-4-test-first-execution.md` in full and follow it exactly. It contains the complete body of this phase; do not proceed from memory or skip it.**

### Phase 5 - BC Isolation and Integration Audit

After all slices are green, inspect the complete BC for boundary violations:

```text
## BC Isolation Audit

Direct imports from adjacent BC internals:
- [...]

Cross-BC database access:
- [...]

Raw external DTOs entering the domain:
- [...]

Outbound dependencies without ports:
- [...]

Adapters leaking external terminology:
- [...]

Status: CLEAR | VIOLATIONS FOUND
```

The audit must verify:

1. Application services depend on port interfaces, not concrete adapters.
2. ACL adapters translate external contracts into this BC's language.
3. No repository queries another BC's private tables or models.
4. No shared module contains target-BC business rules.
5. Events and public contracts contain sufficient context without exposing
   private aggregates.
6. Cross-BC calls follow the ownership established during refinement.

Fix all violations before completion.

### Phase 6 - Specification Conformance and Validation

**Before doing any work in this phase, read `references/phase-6-specification-conformance-and-validation.md` in full and follow it exactly. It contains the complete body of this phase; do not proceed from memory or skip it.**

### Phase 7 - Close Report

End with:

```text
## Implementation Complete - <bc-name> BC

### Capabilities implemented
- [...]

### Tests added
- [test]: [rules/scenarios protected]

### Ports and integrations
- [...]

### Persistence changes
- [...]

### Traceability
- <implemented>/<total> business rules
- <covered>/<total> BDD scenario IDs
- BDD sign-off: [artifact path]
- Goal 3: [property sign-off artifact path] / Declined: [BC decision entry]

### Open or deferred items
- None | [...]

### Recommended next step
- Run `bc-review full` for an independent specification and implementation audit.
```

After all completion criteria pass, update the BC-local status:

```text
IMPLEMENTING -> IMPLEMENTED
```

Because lifecycle is projected, synchronize `docs/hgate-project.json` after the
authoritative `status.md` transition. Do not edit other projected fields unless
their authoritative Markdown changed through the approved workflow. Preserve
stable IDs and unrelated entries, omit timestamps, sort deterministically, and
validate against `docs/hgate-project.schema.json` before reporting completion.

If implementation is blocked, record `IMPLEMENTING -> BLOCKED` with the blocker,
owner, and intended return state. Never set `IMPLEMENTED` while traceability
contains a `Missing` item, BDD sign-off is incomplete, or selected Goal 3
verification is not `SIGNED_OFF`.

## Standing Rules

### Specifications are not suggestions

Implementation may choose code structure consistent with project conventions,
but it may not reinterpret approved business behavior. If two valid
implementations would produce different business outcomes, the specification is
not ready.

### Tests come before production behavior

Do not write all production code and add tests afterward. Work in small slices:

```text
scenario/rule -> failing test -> production behavior -> passing test -> refactor
```

Generated tests must be capable of failing. A test that only checks that a
provider or class exists is not evidence that a business rule works.

### Complete vertical paths

Do not leave domain objects disconnected from application services, ports
without adapters, controllers without validation, migrations outside the runner,
or events without their specified publication path.

### Preserve failure semantics

Do not use broad catches, silent fallbacks, or success-shaped defaults to make
tests pass. Translate and surface errors according to the approved contract.

### Preserve type safety

Do not use `any`, unsafe casts, or raw external response objects to bridge an
unfinished design. Define the correct domain and boundary types.

### No speculative extensibility

Implement the approved BC, not imagined future BCs. A port, event, method, or
abstraction that only serves an unapproved future use case is a YAGNI violation.

## Relationship to Other Skills

| Skill | When to use |
|---|---|
| `domain-exploration` | Discover the problem, domains, and BC boundaries |
| `bc-refinement` | Create or correct one BC's specification files |
| `bc-implementation` | Build one refined, not-yet-built BC using TDD |
| `bc-review` | Independently audit specifications and implementation |
| `bc-enhancement` | Change behavior in an already-built BC and remove ghost behavior |
| `architecture-decision-exploration` | Resolve unresolved technical or cross-system architecture decisions |

## Completion Criteria

Implementation is complete only when:

- Specification readiness was confirmed before coding
- The user approved the implementation plan
- Every approved business rule is implemented
- Every approved BDD scenario ID has executable coverage
- No executable test references an unknown or retired scenario ID
- Tests were observed failing before their production behavior was added
- Domain, application, infrastructure, and presentation layers are fully wired
- Specified migrations, constraints, ports, adapters, and events are present
- BC isolation audit is clear
- Targeted tests pass
- Existing build or type checks pass
- Explicit human BDD-to-TDD sign-off is recorded in an immutable module-scoped
  artifact
- When Goal 3 was selected, every approved property has meaningful executable
  coverage (verifier reports no `PROP011`-`PROP014`) and a separate current property sign-off artifact
- When Goal 3 was declined, the scoped decision and rationale are recorded in
  the BC's `decisions.md` and no skipped artifact exists
- The traceability report contains no `Missing` approved behavior
- `docs/hgate-project.json` reflects the final `status.md` lifecycle and passes
  schema validation

If any condition is unmet, report the implementation as incomplete or blocked
rather than claiming completion.
