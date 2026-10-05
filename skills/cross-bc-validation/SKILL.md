---
name: cross-bc-validation
description: >
  Use this skill to validate one completed business journey that crosses two or
  more implemented bounded contexts. It performs a read-only comparison of
  published contracts, events, ports, adapters, runtime wiring, and tests;
  identifies incompatible or missing journey hops; and routes each finding to
  its owning BC. Trigger phrases include "validate this cross-BC feature",
  "verify the end-to-end bounded context flow", "check integration between these
  BCs", and "does this business journey work across contexts". It does not
  redesign boundaries or implement fixes.
context: fork
---

# Cross-BC Validation

## Purpose

Verify that one confirmed business journey works coherently across several
implemented BCs without weakening BC isolation. Validate published contracts
and observable behavior, not private model equivalence.

This is a read-only validation workflow. Findings are assigned to owning BCs and
fixed later in separate `bc-enhancement` forks.

## Input

- One named business journey or feature
- Its trigger, participating actors, and expected business outcome
- The participating BC names
- `docs/domain-map.md` and `docs/context-map.md`
- Each BC's specification, decisions, status, source code, and tests
- Any cross-cutting ADR governing the journey

## Output

A persistent report at:

```text
docs/features/<feature-name>/validation.md
```

The report includes:

- Confirmed journey and participating BCs
- Hop-by-hop ownership and contracts
- Contract compatibility
- Runtime wiring evidence
- Test and execution evidence
- Failure, retry, ordering, and idempotency findings
- Status for every journey hop
- Findings routed to owning BCs
- Recommended follow-up skill for each finding

Do not modify BC specification, source, migration, test, decision, or status
files.

## Non-Negotiable Rules

1. Validate one business journey per session.
2. Require at least two participating BCs.
3. Read each BC's public contract and only the implementation needed to trace
   the journey.
4. Do not compare private aggregate shapes across BCs.
5. Do not redesign domain boundaries during validation.
6. Do not implement fixes in this session.
7. Every finding must identify an owning BC or explicitly state that ownership
   is unresolved.
8. Cite exact specification, code, and test evidence.
9. Treat passing isolated unit tests as insufficient proof of contract
   compatibility.
10. Do not advance or modify BC lifecycle status.
11. Persist one feature-specific report rather than appending to a global file.
12. Ask the user to confirm missing journey intent; never invent a hop or
    expected outcome.

## Workflow

### Phase 0 - Journey Scope Lock

Establish:

- Journey name
- Business trigger
- Primary actor
- Expected outcome
- Participating BCs
- Entry point
- Observable completion signal
- Explicit non-goals

Declare:

```text
Scope lock: This validation covers the <journey-name> journey only.

Participating BCs:
- <BC A>: owns [...]
- <BC B>: owns [...]

Validation boundary:
- From: [...]
- Through: [...]
- To: [...]

No specifications or source code will be modified.
```

If the journey or ownership is ambiguous, ask one focused question at a time.
If ambiguity could change BC boundaries, stop and recommend
`domain-exploration`. If boundaries are known but a technical architecture
choice is unresolved, recommend `architecture-decision-exploration`.

### Phase 1 - Read Confirmed Artifacts

Read:

1. `docs/domain-map.md`
2. `docs/context-map.md`
3. Relevant ADRs
4. Every specification file for each participating BC
5. Each BC's `status.md`
6. Source and test files needed to trace the public journey

Require each participating BC to be `IMPLEMENTED` or `VERIFIED`. If a BC is not
implemented, classify the journey as `BLOCKED` and recommend its next local
skill.

State every file read before reporting findings.

### Phase 2 - Confirm the Journey Sequence

Build a business-level sequence:

```text
| Hop | Trigger/Caller | Owning BC | Business action | Published output | Consumer | Expected outcome |
|---|---|---|---|---|---|---|
```

Ask the user to confirm the sequence before inspecting compatibility. A journey
description in code is not a substitute for confirmed business intent.

### Phase 3 - Build the Contract Matrix

For every boundary crossing record:

```text
| Hop | Provider contract/event | Consumer expectation | Identity/correlation | Delivery/consistency | Translation/ACL | Status |
|---|---|---|---|---|---|---|
```

Check:

- Contract name and version
- Required and optional fields
- Identifier meaning and ownership
- Enum/status compatibility
- Money, precision, currency, time, and timezone semantics
- Authentication, authorization, tenant, and actor propagation
- Correlation and idempotency identifiers
- Ordering and duplicate-delivery expectations
- Error and retry semantics
- Backward compatibility
- ACL translation into consumer language

Do not require identical internal types. Require compatible published meaning.

### Phase 4 - Trace Runtime Wiring

Trace each hop:

```text
entry point
  -> owning application behavior
  -> published port/event/API
  -> transport or adapter
  -> consumer entry point
  -> consumer application behavior
  -> owned state/outcome
```

Verify:

- Provider publication is reachable
- Adapter or transport registration exists
- Consumer subscription/call path is registered
- Environment and tenant context propagate correctly
- Transactions stop at BC boundaries
- Unknown outcomes have retry or reconciliation behavior
- The final observable outcome is produced

Report missing wiring separately from contract incompatibility.

### Phase 5 - Validate Failure and Concurrency Paths

For each boundary inspect:

- Provider success followed by delivery failure
- Consumer rejection after provider commit
- Timeout with unknown outcome
- Duplicate command or event delivery
- Out-of-order delivery
- Concurrent state change in another BC
- Partial journey completion
- Retry exhaustion
- Poison or malformed message
- Compensation, reconciliation, or operator recovery
- Correlation, metrics, audit, and redaction

Only require behavior promised by the confirmed specifications and ADRs. Report
undefined material behavior as a specification gap.

### Phase 6 - Inspect and Run Tests

Inventory:

- Provider contract tests
- Consumer contract tests
- Adapter integration tests
- Event serialization tests
- End-to-end journey tests
- Failure and retry tests

Run the smallest existing commands that validate the journey. Do not add or
modify tests in this read-only session.

Run `npm run verify:bdd` once for the repository and use its output when
recording participating scenario IDs. Treat nonzero traceability results as
findings owned by the affected BCs.

For each test distinguish:

- What the test proves
- What is mocked
- Which real boundary remains unverified

Record the participating BC scenario IDs that support each journey hop. Report
an uncovered scenario ID or unknown `[BDD:<scenario-id>]` test reference as a
finding owned by that BC; do not repair it in this session.

### Phase 7 - Classify Every Hop

Use exactly one status:

| Status | Meaning |
|---|---|
| `VALIDATED` | Published meaning, runtime wiring, and meaningful test evidence agree |
| `PARTIAL` | Some safeguards or evidence exist, but a material guarantee is missing |
| `INCOMPATIBLE` | Provider and consumer contracts disagree materially |
| `MISSING` | A required contract, adapter, consumer, or journey behavior does not exist |
| `BLOCKED` | A participating BC or required decision is not ready |
| `DEFERRED` | The capability is explicitly excluded and current behavior matches that decision |
| `CANNOT_VERIFY` | Required code, contract, environment, or runtime evidence is unavailable |

Do not classify a hop as `VALIDATED` solely because:

- Field names match
- Unit tests pass independently
- Both BCs compile
- An event is published but no registered consumer is proven
- A retry exists without stable idempotency
- Tenant context exists only on one side

### Phase 8 - Route Findings

For every non-validated hop provide:

```text
Finding:
Severity:
Owning BC:
Evidence:
Business consequence:
Required decision or change:
Recommended skill:
```

Routing:

- Missing or ambiguous business contract -> `bc-refinement` for the owning BC
- Bug, wiring gap, incompatible implementation, or missing tests in an existing
  BC -> `bc-enhancement`
- Unresolved ownership or BC boundary -> `domain-exploration`
- Unresolved cross-cutting technical mechanism -> `architecture-decision-exploration`

When both provider and consumer must change, create two findings and recommend
separate BC sessions. Reference the same confirmed contract or ADR in both.

### Phase 9 - Persist the Validation Report

Write:

```text
# Cross-BC Validation - <Journey>

## Outcome
PASS | PARTIAL | BLOCKED | FAIL

## Scope and expected business outcome
## Participating BCs and lifecycle status
## Confirmed journey sequence
## Contract matrix
## Runtime wiring evidence
## Test execution evidence
## Failure and concurrency analysis
## Hop classifications
## Findings by owning BC
## Open or unavailable evidence
## Recommended follow-up sessions
```

Outcome rules:

- `PASS`: every required hop is `VALIDATED`
- `PARTIAL`: no incompatible/missing hop, but material evidence is incomplete
- `BLOCKED`: a prerequisite BC or decision is not ready
- `FAIL`: at least one required hop is `INCOMPATIBLE` or `MISSING`

The report is feature-local. Do not update BC status files or a global
validation log.

## Completion Criteria

Validation is complete when:

- The user confirmed the business journey
- Every participating BC and boundary hop is identified
- Every hop has specification, runtime, and test evidence
- Failure, retry, ordering, tenant, and idempotency semantics were considered
- Every hop has exactly one classification
- Every finding has an owner and recommended next skill
- The report is persisted under the feature-specific path
- No BC specification, source, migration, test, decision, or status file changed
