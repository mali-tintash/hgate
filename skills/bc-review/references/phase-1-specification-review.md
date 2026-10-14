Reference for the "Phase 1 — Specification Review" section of `SKILL.md`. Loaded on demand; the section heading lives in `SKILL.md`.

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
- `Oracle source` is a documented value and `Oracle independence` names an
  independent source. Flag as a finding any circular oracle (the subject
  computes its own expected value, for example `expect(f(x)).toEqual(f(x))`),
  any reference oracle or finite model that duplicates the production
  algorithm line for line, and any independence statement that is vague or
  admits a shared implementation path.
- Generator adequacy is substantive: partitions are business-relevant with
  reasons, boundaries cover each constrained field, required combinations are
  reachable, run/discard limits fit the risk, invalid inputs use a separate
  generator, and coverage counters are present in the tests.
- `FINITE_MODEL` claims state exact completeness bounds and do not claim
  unbounded proof.
- Each `[PROP:<ID>]` test body executes the declared technique
  (`hgateProperty`/`fc.assert` or `hgateFiniteModel`/`exploreFiniteModel`); a
  reference with an empty or non-executing body (`PROP011`/`PROP012`) is a
  coverage gap, not coverage.
- `Risk` and `Sensitivity` are declared; `MEDIUM`/`HIGH` properties have
  `Sensitivity-Evidence` naming a mutant/defect and the observed failure; `HIGH`
  uses a production-logic method (not `ORACLE_VIOLATION` alone); `LOW` waivers
  have a credible reason. Flag evidence that looks asserted rather than
  observed, and any surviving mutants without disposition.
- Generated properties use synthetic data and cannot persist secrets, personal
  data, or production identifiers.

Absence of `properties.md` is not a finding. Goal 3 is optional at every
adoption level.

When `properties.md` exists, also review `property-discovery.md`; a missing
inventory is a finding:

- Every approved rule in scope appears in the inventory and has a candidate row
  for every family (operation-preserved invariants, conservation/accounting,
  idempotence, monotonicity, round-trip, order independence, alternate-path
  equivalence, lifecycle transition safety, authorization/tenant isolation,
  failure atomicity, retry/replay, boundary/overflow).
- Every row is `ACCEPTED`, `REJECTED`, or `DEFERRED`; REJECTED reasons are
  rule-specific (not "N/A" or "trivial"); DEFERRED rows name owner, risk, and
  revisit trigger.
- Every `ACCEPTED` row links to an existing `@property:` ID, and every property
  cites its source rules and candidate (no orphan properties or dangling links).
- The accepted set is not ceremony-only (non-negative totals, non-empty IDs,
  no-exception); flag rules whose only coverage is ceremonial.
- BDD examples are not restated as properties.

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

Use the Phase 1 table from [report-template.md](./report-template.md), followed by:

- Prioritized open questions
- Contradictions summary
- Deferred cross-BC items
- Cohesion result

For `spec-only`, update local lifecycle metadata after reporting:

- Use `REFINED -> SPEC_REVIEWED` only when no unresolved Critical or High
  specification finding blocks implementation.
- Otherwise use `REFINED -> BLOCKED` and record the findings, owner, and return
  state.

Modify only `.github/skills/<bc-name>/status.md` as authoritative content, then
run `npm run project:sync`; the generator projects its lifecycle.

For `spec-only`, stop here.
