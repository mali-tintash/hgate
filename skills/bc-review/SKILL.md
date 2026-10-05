---
name: bc-review
description: "Use this skill to review, audit, or assess a Bounded Context in two phases: first inspect its skill/specification files for failure paths, boundaries, ambiguity, contradictions, authorization, tenant isolation, concurrency, external failures, observability, and audit requirements; then verify every finding against implementation code and tests. Trigger phrases: BC review, bounded context review, review skill files, specification audit, check findings in code, documentation versus implementation, gap analysis."
argument-hint: "<bounded-context-name> [full|spec-only|code-verification]"
---

# Bounded Context Two-Phase Review

## Purpose

Perform a repeatable, evidence-based review of one Bounded Context (BC):

1. **Specification review** — identify weaknesses in the BC's skill files without inspecting code.
2. **Code verification** — determine whether each reported concern is covered, partially covered,
   missing, or intentionally deferred in implementation and tests.

This is a read-only review of specifications and source code. Do not modify
specification, source, migration, or test files. The only permitted write is the
target BC's local `status.md` after the final report is complete.

## Inputs

- BC name, matching `.github/skills/<bc-name>/`
- Review mode:
  - `full` — run both phases; default
  - `spec-only` — stop after Phase 1
  - `code-verification` — verify an existing findings list supplied by the user
- Optional business description from the user

If the BC or mode is unclear, ask one focused question using the question tool.

## Non-Negotiable Rules

1. Review one BC per invocation.
2. Keep Phase 1 code-blind: do not inspect `src/**`, migrations, or tests.
3. Do not silently redesign adjacent BCs. Record cross-BC concerns as deferred items.
4. Every material claim must cite an exact file and line range.
5. Distinguish documented intent, executable behavior, and test coverage.
6. A test asserting behavior is evidence of intent and regression protection, not proof that all
   runtime paths are safe.
7. Do not report style, naming, or speculative architecture preferences.
8. Prioritize correctness, security, data isolation, financial duplication, and recoverability.
9. Never expose credentials, tokens, PII, gift-card secrets, or raw sensitive log contents in the
   report.
10. Do not edit specification, source, migration, or test files during either
    review phase. Lifecycle metadata may be updated only after reporting.

## Phase 0 — Scope and Context

### 0.1 Inventory documentation

Read:

1. Every file under `.github/skills/<bc-name>/`
2. Project-wide conventions (`CLAUDE.md`, `AGENTS.md`, or equivalent)
3. Skill files for every adjacent BC named by the target BC

Reading adjacent BC documentation is required to identify ownership boundaries. Do not inspect
adjacent implementation code during this phase.

### 0.2 Establish business intent

If the user has not already described the intended behavior, ask:

> Please describe the business behavior of the `<bc-name>` BC — what triggers it, what it does,
> and what outcomes it produces.

Do not infer business intent solely from route or class names.

### 0.3 Declare the scope lock

Before reporting findings, state:

```text
Scope lock: This review covers the <bc-name> BC only.

In scope:
- <behavior and contracts owned by this BC>

Out of scope:
- <adjacent BC>: <what it owns>

Cross-BC concerns will be recorded as deferred items, not redesigned here.
```

### 0.4 Check cohesion

Assess whether the BC still has one reason to change. Flag a cohesion concern when at least two
of these signals occur:

- Independent business capabilities
- Unrelated aggregates or lifecycles
- Different actors triggering independent workflows
- Unrelated external integrations
- Different operational or authorization models
- Different reasons to change

Report the concern, but continue the review unless the user explicitly requests refinement.

## Phase 1 — Specification Review

Review only the target and adjacent documentation. Evaluate each operation, lifecycle transition,
integration, aggregate, job, and endpoint through all lenses below.

### Lens 1 — Missing failure paths

Check for:

- Validation rejection
- Authentication and authorization failure
- Missing, stale, revoked, or terminal domain records
- Partial success between sequential steps
- Dependency acceptance followed by timeout or local persistence failure
- Retry after an unknown outcome
- Malformed or incomplete dependency responses
- Cleanup, compensation, reconciliation, and manual recovery
- Unknown enum/status values

### Lens 2 — Boundary conditions

Check:

- Zero, negative, fractional, maximum, overflow, empty, and omitted values
- String lengths, formats, precision, currency, timezone, and UUID validation
- Empty and unexpectedly large collections
- First/last page and page beyond available results
- Duplicate identifiers, idempotency keys, and references
- State-transition boundaries and terminal-state behavior
- Deterministic selection when several candidates exist

### Lens 3 — Ambiguity

Flag language that permits multiple materially different implementations:

- Undefined ownership or source of truth
- “First,” “latest,” or “default” without ordering rules
- Undefined status mapping or fallback
- Undefined retryability or error contract
- Unconfirmed external contracts presented as settled behavior
- Terms used without glossary definitions

### Lens 4 — Contradictions

Compare:

- `SKILL.md` against domain model, BDD scenarios, and ACL files
- List versus detail semantics
- Request versus response identifiers
- Aggregate invariants versus fallback behavior
- Stated parity versus unsupported or omitted capabilities
- Target BC assumptions against adjacent BC contracts

### Lens 4a — Scenario traceability

Check the specification for:

- A valid `@scenario:<BC>-<CAPABILITY>-<NNN>` tag on every Scenario and
  Scenario Outline
- Duplicate scenario IDs within the BC or across all BC specifications
- Reused or renumbered IDs
- Business rules without a scenario ID that protects them
- Materially different outcomes sharing one ID
- Retired IDs that remain in the current specification

### Lens 4b — Optional universal properties

If `properties.md` exists, review it independently from BDD scenarios:

- Every declaration has one stable, unique `@property:<ID>`.
- The claim is universal or explicitly bounded-universal rather than one named
  example rewritten as a property.
- Quantification, preconditions, oracle, technique, generator, and bounds are
  complete and falsifiable.
- `FINITE_MODEL` claims state exact completeness bounds and do not claim
  unbounded proof.
- Generated properties use synthetic data and cannot persist secrets, personal
  data, or production identifiers.

Absence of `properties.md` is not a finding. Goal 3 is optional at every
adoption level.

### Lens 5 — Authorization and tenant isolation

Check separately:

- Authentication: who is the caller?
- Authorization: which operation may the caller perform?
- Resource ownership: does the resource belong to the tenant, client, user, or wallet?
- Tenant resolution: when and how is tenant context established?
- Opaque external IDs: are they verified before data is returned?
- Cross-tenant external calls: does CLS/database isolation actually protect them?
- Disabled/revoked clients, environment separation, scopes, roles, and capability grants
- Sensitive fields exposed by read endpoints

Tenant-scoped database access does not prove ownership for data fetched from an external service.

### Lens 6 — Atomicity and concurrency

For every multi-step workflow, identify:

- Transaction boundaries
- Locks, compare-and-set rules, and unique constraints
- Get-then-create races
- Shared mutable resources such as active carts
- Duplicate submission and request-level idempotency
- Idempotency-key scope, retention, and payload-conflict behavior
- “External success, local failure” recovery
- Saga, compensation, retry, and reconciliation behavior
- Concurrent state transitions such as revocation during submission

### Lens 7 — External-service failures

Require defined behavior for:

- Timeout and connection failure
- Rate limiting and `Retry-After`
- Upstream validation, authentication, conflict, and not-found responses
- Upstream `5xx`
- Malformed successful responses
- Eventual consistency after create/update
- Token refresh/retry
- Retry limits, backoff, jitter, and circuit breaking where appropriate
- Stable public error translation and retry-safety guidance

### Lens 8 — Observability and audit

Check for:

- Correlation/request IDs across BC boundaries
- Tenant, client, actor, environment, and resource identifiers
- Step-level workflow outcomes
- Dependency latency and normalized error metrics
- Duplicate, orphan, retry, and reconciliation metrics
- Security and state-transition audit records
- Alerting versus expected unsupported behavior
- Log redaction requirements for tokens, credentials, PII, and fulfilment secrets
- Retention and erasure requirements for persisted audit/PII data

### Phase 1 evidence and severity

Use:

- **Critical** — plausible cross-tenant disclosure, unauthorized sensitive access, duplicate
  financial fulfilment, or unrecoverable integrity loss
- **High** — likely production failure, orphaned external state, material contract break, or no
  operational traceability
- **Medium** — meaningful edge case, ambiguity, or inconsistency with bounded impact
- **Low** — real but limited maintainability or boundary concern

For each finding provide:

1. Severity
2. Review lens
3. Concise finding
4. Exact documentation citations
5. Consequence
6. Required decision or open question

Do not call an intentional, explicitly documented `501` or deferred capability a defect.

### Phase 1 output

Use the Phase 1 table from [report-template.md](./references/report-template.md), followed by:

- Prioritized open questions
- Contradictions summary
- Deferred cross-BC items
- Cohesion result

For `spec-only`, update local lifecycle metadata after reporting:

- Use `REFINED -> SPEC_REVIEWED` only when no unresolved Critical or High
  specification finding blocks implementation.
- Otherwise use `REFINED -> BLOCKED` and record the findings, owner, and return
  state.

Modify only `.github/skills/<bc-name>/status.md`.

For `spec-only`, stop here.

## Phase 2 — Code Verification

### 2.1 Build a verification checklist

Turn every Phase 1 finding into one verification item. Preserve its identifier and wording so the
documentation and implementation reports remain traceable.

For `code-verification` mode, use the findings supplied by the user. If citations or intended
behavior are missing, read the target BC documentation before inspecting code.

### 2.2 Trace only relevant implementation

Inspect:

1. `src/<bc-name>/**`
2. Migrations and models used by the BC
3. Tests for the BC
4. Only direct dependency paths needed to verify a finding

Trace continuous runtime paths end to end:

```text
controller/consumer
  -> guard/interceptor
  -> application service
  -> repository or outbound port
  -> adapter/external dependency
  -> persistence/migration
```

Do not perform a general review of adjacent BC code. Stop at the point where enough evidence
exists to classify the target finding.

For a large BC, a read-only code-review or code-explorer subagent may own Phase 2. Give it the
complete Phase 1 findings and prohibit edits and style feedback.

### 2.3 Inspect tests as separate evidence

For each finding, determine:

- Is the safeguard implemented?
- Is it enforced at application, database, or external-adapter level?
- Is the failure branch tested?
- Are concurrency and retry semantics genuinely exercised or merely mocked?
- Does a DTO test bypass the actual validation pipeline?

Build a bidirectional scenario traceability map:

```text
| Scenario ID | Scenario | Executable tests | Test level | Coverage assessment |
|---|---|---|---|---|
```

Report:

- Scenario IDs with no meaningful executable test
- `[BDD:<scenario-id>]` test references with no current scenario
- Duplicate or malformed IDs
- Tests carrying an ID but asserting a different outcome
- Scenarios covered only by mocks that bypass the relevant runtime boundary

Absence of a test does not prove absence of behavior. Presence of a test does not eliminate
uncovered races or integration failures.

Run `npm run verify:bdd` and include its deterministic diagnostics as evidence.
Any duplicate or malformed scenario ID, uncovered scenario, or unknown test
reference is at least a specification-conformance finding. Continue reviewing
whether each referenced test meaningfully asserts the scenario outcome; the
tool proves linkage, not assertion quality.

When `properties.md` exists, also run `npm run verify:properties` and the
project's configured property/model Jest suite. Build a separate property
traceability map:

```text
| Property ID | Universal claim | Technique | Executable tests | Generator/model and bounds | Coverage assessment |
```

Classify generated-run success and bounded finite-model completeness exactly as
declared. Inspect the newest artifact under
`docs/verification/property-signoffs/<bc-name>/`. A missing or stale artifact
for a scope that explicitly opted into Goal 3 is workflow-evidence debt; a BC
that never opted in has no Goal 3 defect. Property evidence never substitutes
for scenario evidence, and scenario evidence never substitutes for property
evidence.

Inspect the newest artifact under
`docs/verification/bdd-signoffs/<bc-name>/`, if present. Treat it as human
review evidence only when:

- Its status is `SIGNED_OFF`
- Its module matches the target BC
- Its verified revision exists
- No later change affects scenarios, test discovery or execution,
  implementation behavior, verifier source, or verifier configuration

A missing or stale artifact is a workflow-evidence finding, not proof that the
implementation behavior is missing. A current artifact does not replace this
review's independent assessment of test quality.

### 2.4 Classification

Classify every finding exactly once:

| Status | Definition |
|---|---|
| **Covered** | Implementation enforces the complete requirement and meaningful tests protect it |
| **Partially covered** | A safeguard exists, but one or more material paths or guarantees remain |
| **Missing** | No effective implementation addresses the concern |
| **Not applicable / deferred** | The capability is explicitly unsupported or owned elsewhere, and current behavior matches that decision |
| **Cannot verify** | Required source, contract, generated code, or environment behavior is unavailable |

Do not classify a concern as Covered merely because:

- Authentication exists but resource ownership is unchecked
- A unique constraint exists but its conflict is not recovered
- Downstream idempotency exists but request retries generate new downstream keys
- A timeout exists but unknown outcomes can duplicate side effects
- Logs exist but lack correlation, audit semantics, or redaction
- Happy-path tests exist

### 2.5 Find undocumented safeguards

After verifying findings, make one focused pass for material safeguards present in code but absent
or understated in the target BC documentation, including:

- Database uniqueness or locking
- Retry and token-refresh behavior
- Idempotency guarantees
- Sensitive-field stripping
- Error translation
- Persistence recovery

List only safeguards relevant to the reviewed findings.

### Phase 2 output

Use the Phase 2 table from [report-template.md](./references/report-template.md).

Each row must contain:

- Original concern
- Code status
- Implementation evidence with exact line ranges
- Test evidence, or explicitly “No meaningful test found”
- Residual risk

Include a scenario traceability summary:

- Current scenario IDs
- IDs with meaningful executable coverage
- Uncovered IDs
- Unknown or retired IDs referenced by tests
- Current, stale, or missing BDD-to-TDD sign-off evidence
- When Goal 3 exists: current property IDs, executable coverage, honest bounds,
  counterexample dispositions, and current/stale/missing property sign-off

Finish with:

1. Counts by status
2. Top three to five implementation priorities
3. Safeguards present in code but missing from documentation
4. Deferred cross-BC items
5. Explicit statement that no specification, source, migration, or test files
   were modified

### Lifecycle status update

After the full final report, use `IMPLEMENTED -> VERIFIED` only when all
material requirements are covered, no unresolved Critical or High finding
remains, and the target BC has current `SIGNED_OFF` BDD-to-TDD evidence;
otherwise use `IMPLEMENTED -> BLOCKED`.

Update only `.github/skills/<bc-name>/status.md`. Record report evidence,
blockers, recommended next skill, and transition history.

## Quality Checklist

Before returning the final report, verify:

- [ ] One BC remained in scope
- [ ] Phase 1 did not inspect implementation code
- [ ] Every Phase 1 finding appears once in Phase 2
- [ ] Every material claim has an exact citation
- [ ] Authorization and resource ownership were assessed separately
- [ ] Database tenant isolation and external-resource ownership were assessed separately
- [ ] Request idempotency and downstream idempotency were assessed separately
- [ ] Unknown-outcome and partial-success paths were considered
- [ ] External failures include timeout, rate limit, `5xx`, malformed response, and eventual consistency
- [ ] Observability includes both traceability and redaction
- [ ] Tests were treated as supporting evidence, not conclusive proof
- [ ] Every current scenario ID was mapped to executable tests
- [ ] Unknown and retired test references were reported
- [ ] Module-scoped BDD-to-TDD sign-off evidence was classified as current,
      stale, or missing
- [ ] Undocumented safeguards were reported
- [ ] Cross-BC concerns were deferred, not redesigned
- [ ] No specification, source, migration, or test files were modified
- [ ] Any lifecycle update was limited to the target BC's `status.md`
