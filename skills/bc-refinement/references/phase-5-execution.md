Reference for the "Phase 5 — Execution (Update Skill Files)" section of `SKILL.md`. Loaded on demand; the section heading lives in `SKILL.md`.

Update files in this order:

### 5a. `SKILL.md`
The entry point. Must contain:

```
---
name: <bc-name>
description: >
  One-paragraph description + trigger phrases for Copilot to load this skill.
---

# <BC Name> — Bounded Context

## Purpose
2-3 sentences on what this BC owns and why.

## Classification
Core Domain / Supporting Subdomain / Generic Subdomain + ACL note if applicable.

## NestJS Module
Full directory tree with every file named, one-liner comment per file.
Group: domain/ application/ infrastructure/ presentation/

## Key Aggregates
Bullet per aggregate: fields + lifecycle summary.

## External Integrations
One entry per ACL file. State whether contract exists or is TBD.

## Sync / Job Strategy (if applicable)
Cron schedule + strategy (idempotency, soft-delete, etc.)

## <Domain-Specific Lifecycle Section>
Numbered walkthrough of the full lifecycle (e.g., "Activation Lifecycle").

## Concurrency & Re-request Rules (if applicable)
Invariants enforced at DB level and application level.

## Domain Events Emitted
Table: Event | Payload | Consumed By
(List consuming BCs by name only — their handling logic is documented in their own skill.)

## Core Business Rules
Numbered list. Each rule is a single falsifiable statement.

## VO Discipline (present in every BC skill)
Copy this verbatim from the Catalog SKILL.md VO Discipline section.
List which VOs are VO classes and which are type aliases for this BC.

## Ubiquitous Language
Table: Term | Meaning | NOT: (anti-terms)

## Related Context Files
List every other file in this skill directory with a one-liner.
```

### 5b. `domain-model.md`
The implementation contract. Must contain:

```
## <AggregateRoot> (Aggregate Root)
TypeScript class block with all fields and types.
Field comments explaining constraints (max length, immutability, etc.)

## Type Aliases (colocated with aggregate — NOT VO classes)
Per VO Discipline rule. Plain `type` declarations.
One-liner explaining why each is an alias not a class.

## Value Objects (true VOs — carry validation/behaviour/equality)
Class blocks for every real VO.
Invariants listed as comments.

## Ports
Structured table (required):
| Name | Direction | Purpose | Contract |
|---|---|---|---|
| `SomePort` | INBOUND / OUTBOUND / BIDIRECTIONAL / UNKNOWN | Business purpose in this BC's language | Interface, event, endpoint, or `TBD` |

Every port used by the BC must appear once. `Direction` is from this BC's
perspective. Do not replace this table with prose or infer ports only from a
module tree.

## Enums
One block per enum. Valid transitions documented as comments.

## Sequelize Models (Table Definitions)
Table per aggregate/entity: column | type | constraints.
Indexes listed explicitly.
⚠️ note if table lives in tenant schema vs public schema.

## Orderability / Availability Query (if this BC is the gate)
Raw SQL showing the check other BCs must call.

## Design Decisions
Bullet per decision: what was decided AND why.
```

### 5c. `bdd-scenarios.md`
Gherkin specification. Use `assets/bdd-scenarios-template.md` as the starting
shape. Must contain one `Feature:` block per significant capability. For each
feature:

- **Happy path**: normal successful flow
- **Idempotency**: running the same operation twice produces the same outcome
- **Boundary conditions**: limits enforced by business rules
- **Failure paths**: what happens when a rule is violated
- **Integration path**: how an external system's response is handled

Scenarios must use ubiquitous language terms — never use raw column names or API field names in scenario text.

Every `Scenario` and `Scenario Outline` must have a stable repository-unique ID
using a Gherkin tag immediately above it:

```gherkin
@scenario:CART-SUBMIT-001
Scenario: Submit a valid cart
```

ID format:

```text
<BC>-<CAPABILITY>-<three-digit-sequence>
```

Rules:

- Use uppercase kebab-case, for example `CART-SUBMIT-001`.
- Search all BC `bdd-scenarios.md` files before assigning an ID; IDs must be
  unique across the repository.
- Never renumber or reuse an ID.
- Wording clarifications that preserve the same behavior retain the ID.
- A materially different business outcome gets a new ID. Remove the old
  scenario from the current specification and record its retired ID and
  replacement, if any, in this BC's `decisions.md`.
- `Background` blocks do not receive scenario IDs.
- Each scenario ID must later appear in at least one meaningful executable test
  as `[BDD:<scenario-id>]`.

### 5d. `*-acl.md` files
One file per external integration. Must contain:

```
## Purpose
What system this ACL translates from/to.

## Port Interface
The TypeScript interface the domain calls (inbound or outbound).

## Endpoint Mapping
Table: Our operation | External endpoint | Method

## Request/Response Translation
Show the FooBar DTO → domain model mapping (or vice versa).

## Cron / Schedule (if applicable)
Exact cron expression + env var name.

## Idempotency
How duplicate calls are handled.

## Error Handling
Retry strategy, fallback, circuit-breaker notes.

## Env Vars
All env vars this ACL reads.

## Open Questions
Numbered list of unresolved contract questions (marked [OPEN]).
```

If the external API contract is not yet known, create a **placeholder ACL** with a stub adapter and mark all questions `[OPEN]`.

### 5e. Optional `properties.md`

Do not create universal properties by default. Goal 3 business-logic
verification is optional at every hGATE adoption level.

When the human explicitly asks refinement to specify Goal 3 properties for the
current scope, create `properties.md` from `assets/properties-template.md`.
Otherwise omit it. A later `bc-implementation` or behavioral `bc-enhancement`
session will ask whether Goal 3 is wanted for that change and may return to
refinement if an approved property specification is needed.

Each property:

- Is discovered through the required property-discovery procedure below, not
  invented ad hoc.
- Has one stable, repository-unique
  `@property:<BC>-<CAPABILITY>-<three-digit-sequence>` ID.
- States one falsifiable universal or bounded-universal claim.
- Defines quantification, preconditions, observable oracle, technique,
  generator contract, finite bounds, and (for `PROPERTY`) the generator
  adequacy fields: partitions with rationale, boundary values, cross-field
  combinations, min runs, max discard ratio, shrinking, invalid-input
  generator, and coverage evidence.
- Declares an `Oracle source` (`REFERENCE_CALCULATION`, `DOMAIN_EQUATION`,
  `CONSERVATION`, `METAMORPHIC`, `ROUND_TRIP`, `TRUSTED_LIBRARY`,
  `STATE_INVARIANT`, or `APPROVED_TABLE`) and an `Oracle independence`
  statement. Subject and oracle never share an implementation path; circular
  or line-for-line duplicated oracles are prohibited, and finite models derive
  from approved rules, not production code.
- Uses `PROPERTY` for generated tests against production code. Its planned
  test must execute the property through `hgateProperty`; an empty test
  never satisfies coverage.
- Uses `FINITE_MODEL` only for a pure, genuinely finite state space with exact
  states, commands, inputs, and depth bounds.
- Remains distinct from named Given/When/Then examples in `bdd-scenarios.md`.
- Declares `Risk` (`LOW`/`MEDIUM`/`HIGH`) and a planned `Sensitivity` method
  (`MUTATION`, `KNOWN_BAD_FIXTURE`, `INJECTED_DEFECT`, `ORACLE_VIOLATION`,
  `REGRESSION_COUNTEREXAMPLE`; `N/A` plus `Sensitivity-Waiver` only for `LOW`;
  `HIGH` needs a production-logic method). `Sensitivity-Evidence` is completed
  during implementation. See `tools/business-verification/README.md`.

Never claim that property-based testing is proof. Never claim finite-model
completeness outside the declared bounds. Retire materially changed property
IDs in `decisions.md`, just as retired scenario IDs are recorded.

#### Required property-discovery procedure

Before writing any declaration, create
`.github/skills/<bc-name>/property-discovery.md` from
`assets/property-discovery-template.md`:

1. List every approved business rule in `SKILL.md` and `bdd-scenarios.md` that
   is in scope, with a stable rule ref.
2. For each rule, evaluate every candidate family: operation-preserved
   invariants, conservation/accounting, idempotence, monotonicity, round-trip,
   order independence, alternate-path equivalence, lifecycle transition
   safety, authorization/tenant isolation, failure atomicity, retry/replay,
   boundary/overflow.
3. Record each candidate as `ACCEPTED`, `REJECTED`, or `DEFERRED` with a
   rule-specific reason. `ACCEPTED` links to a `@property:` ID; `DEFERRED`
   names an owner, accepted risk, and revisit trigger.
4. Do not count ceremonial claims (non-negative totals, non-empty IDs, no
   exception) as coverage unless the rule itself states them.
5. Every property cites its source rules and candidate; BDD examples may seed
   candidates but are never restated as properties.
6. Present the inventory with `properties.md` for explicit human approval.

### 5f. `decisions.md`

Record concluded decisions owned by this BC. Use one entry per decision:

```text
## <Decision title>

**Asked:** <Question or ambiguity that required a decision>

**Findings:** <Evidence, constraints, and tradeoffs considered>

**Decision/Action:** <Confirmed decision and resulting action>
```

Do not record in-progress deliberation. Do not copy cross-cutting decisions into
this file; create a standalone ADR under `docs/adr/` and link to it instead.
Never append BC decisions to a global decisions log.

### 5g. `status.md`

After the user approves the refined specification and Phase 6 validation passes,
update the BC-local lifecycle status:

```text
REFINING -> REFINED
```

Record the approval evidence, clear resolved blockers, recommend
`bc-review spec-only` or `bc-implementation`, and append the transition history.
If refinement cannot complete, use `REFINING -> BLOCKED` and record the blocker,
owner, and return state.

---
