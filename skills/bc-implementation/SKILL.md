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

## Output

- Complete source code for one BC
- Database migrations or persistence definitions required by the specification
- Unit tests for domain and application behavior
- Integration or acceptance tests for critical BDD scenarios
- Adapters for specified external dependencies
- A specification-to-code traceability report
- An immutable module-scoped BDD-to-TDD sign-off artifact
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

Map each approved behavior to executable evidence before writing tests:

```text
| ID | Spec source | Behavior | Test level | Planned test | Production components |
|----|-------------|----------|------------|--------------|-----------------------|
| R1 | SKILL rule 1 | [...] | Unit | [...] | Aggregate, service |
| CART-SUBMIT-001 | BDD scenario | [...] | Integration | [BDD:CART-SUBMIT-001] [...] | Controller -> repository |
```

Include:

- Every core business rule
- Every BDD scenario
- Every allowed and rejected state transition
- Every authorization branch
- Every external integration success and failure path
- Every concurrency or idempotency invariant

Use the smallest meaningful test level:

| Test level | Use for |
|---|---|
| Domain unit | Aggregate invariants, value objects, policies, transitions |
| Application unit | Use-case orchestration, port calls, exception branches |
| Repository integration | Queries, mappings, constraints, transactions, schema routing |
| ACL adapter unit/integration | Translation, authentication, retries, error mapping |
| Presentation unit | DTO mapping, service delegation, response shape |
| Acceptance/integration | Critical BDD journeys across the BC's public boundary |

Avoid duplicating the same assertion at every layer. Each test should protect the
layer's responsibility.

Use the scenario IDs already defined in `bdd-scenarios.md`; do not invent
implementation-local aliases such as `S1`. Every executable test that claims
scenario coverage must include `[BDD:<scenario-id>]` in its static Jest
`it(...)` or `test(...)` title:

```typescript
it('[BDD:CART-SUBMIT-001] submits a valid cart', async () => {
  // ...
});
```

One scenario may map to several tests and one integration test may reference
several scenario IDs, but every approved scenario ID needs at least one
meaningful executable test.

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

Implement one approved slice at a time using red-green-refactor.

#### 4a. Red

1. Write tests derived from the traceability matrix, including the applicable
   `[BDD:<scenario-id>]` marker.
2. Run the smallest targeted test command.
3. Confirm the test fails for the expected missing behavior.
4. If it passes before implementation, determine whether:
   - Existing code already implements the behavior
   - The assertion is ineffective
   - The test exercises the wrong path
5. Correct the test or reclassify the initial-build eligibility. Never count an
   unexplained pre-existing pass as a valid red phase.

Do not weaken assertions merely to obtain a passing test.

#### 4b. Green

Write the minimum complete production behavior required by the approved slice:

1. Domain types, value objects, aggregates, policies, and events
2. Application use cases and domain port interfaces
3. Persistence models, migrations, repository adapters, and transactions
4. ACL adapters for external systems
5. Presentation controllers, consumers, DTOs, and validation
6. Module wiring and dependency injection

Run the targeted tests until they pass.

"Minimum" means no speculative behavior. It does not permit omitting specified
failure paths, authorization, persistence guarantees, or integration handling.

#### 4c. Refactor

After the slice is green:

- Remove duplication
- Improve names to match ubiquitous language
- Confirm dependency direction
- Remove test-only production seams that are not part of the design
- Re-run the targeted tests

Do not refactor unrelated BCs.

#### Whole-file awareness

For every file changed:

1. Read the relevant method and its immediate callers/callees.
2. Wire every new interface into its implementation and DI registration.
3. Search for stale placeholder names and unresolved references.
4. Update related tests and mocks in the same slice.

#### No orphan code

For every new component confirm:

- A port has a real adapter or an explicitly approved test stub
- An adapter is registered and reachable
- An application use case has a public caller or consumer
- A migration is included in the project's migration runner
- A domain event is emitted from the specified transition
- An event consumer is registered if it belongs to this BC
- A DTO is used by an actual entry point
- A test targets behavior rather than merely constructing the class

Delete unused speculative components instead of leaving them for future work.

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

#### 6a. Traceability verification

Update the traceability matrix with actual files and test names. Every item must
be classified:

| Status | Meaning |
|---|---|
| Implemented | Production behavior exists and meaningful tests pass |
| Blocked | Cannot be implemented because an approved dependency or decision is unavailable |
| Deferred | Explicitly excluded from the approved implementation |
| Missing | Required behavior has not been implemented |

Do not complete the task while any approved item is `Missing`.

#### 6b. Test audit

Read every test file created or changed for the BC and confirm:

- Happy paths and specified failures are covered
- Tests assert outcomes, not logs or implementation trivia
- Mocks represent port boundaries rather than bypassing business logic
- Integration tests exercise real mappings and constraints where required
- Every approved BDD scenario ID has meaningful executable coverage
- Every `[BDD:<scenario-id>]` test reference resolves to a current scenario
- No test claims coverage using a retired, unknown, or malformed scenario ID
- Tests are isolated and deterministic

#### 6c. Validation order

Run the smallest existing commands that prove the implementation:

1. Targeted tests for the BC
2. The BDD-to-TDD sign-off loop described below
3. Type checking or build
4. Targeted linting, if supported
5. Broader integration or full test suite only when needed by project policy or
   shared wiring changes

If the project has adopted hGATE but the traceability command is missing, stop
and install `tools/bdd-traceability/verify.mjs` and its package script rather
than replacing the deterministic check with manual review.

#### 6d. BDD-to-TDD human sign-off

Follow `tools/bdd-traceability/signoff-loop.md` for this BC before writing the
final conformance report.

The loop must:

- Run relevant Jest tests and the repository-wide verifier against a clean
  candidate revision
- Present module scenario evidence and all repository diagnostics to the human
- Keep the BC at `IMPLEMENTING` while changes are requested or the attempt is
  blocked
- Repeat test-first corrections until Jest passes and the verifier exits `0`
- Obtain explicit human sign-off; verifier success alone is not approval
- Create and commit one immutable artifact under
  `docs/verification/bdd-signoffs/<bc-name>/`

Do not proceed to close reporting until the loop reaches `SIGNED_OFF`.

#### 6e. Final conformance report

```text
## Specification Conformance

Business rules: <implemented>/<total>
BDD scenario IDs: <covered>/<total>
Ports and adapters: <implemented>/<specified>
Migrations and constraints: <implemented>/<specified>

BC isolation: CLEAR | VIOLATIONS FOUND
Tests: PASS | FAIL
Build/type check: PASS | FAIL | NOT AVAILABLE

Missing approved behavior:
- None | [...]

Deferred items:
- None | [...]
```

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
- Sign-off: [artifact path]

### Open or deferred items
- None | [...]

### Recommended next step
- Run `bc-review full` for an independent specification and implementation audit.
```

After all completion criteria pass, update the BC-local status:

```text
IMPLEMENTING -> IMPLEMENTED
```

If implementation is blocked, record `IMPLEMENTING -> BLOCKED` with the blocker,
owner, and intended return state. Never set `IMPLEMENTED` while traceability
contains a `Missing` item or the sign-off loop is not `SIGNED_OFF`.

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
- The traceability report contains no `Missing` approved behavior

If any condition is unmet, report the implementation as incomplete or blocked
rather than claiming completion.
