---
name: bc-refinement
description: >
  Use this skill when the user asks to refine a particular Bounded Context (BC) skill. The sub-agent will lock scope to a single BC, assess whether it is cohesive enough to remain one BC, ask questions to understand the actual business behaviour, identify gaps in the existing skill files, and then update all files to align with the business requirements.
context: fork
---
# BC Skill Refinement Process

---

## Overview

This document defines the repeatable process used to bring a Bounded Context (BC) skill into alignment with its actual business behaviour.

**Input**: An existing skill directory at `.github/skills/<bc-name>/`  
**Output**: Fully updated `SKILL.md`, `domain-model.md`, `bdd-scenarios.md`,
`decisions.md`, `status.md`, one or more `*-acl.md` files, and any new ACL files
needed.

**Golden rule: one BC per session.** If conversation drifts toward another BC, warn the developer, note it in the Deferred Items log, and suggest redirecting. The developer has final authority — but the risk of cross-BC contamination must be clearly stated before proceeding.

---

## Phase 0 — Read Everything First + Scope Lock

Before generating any output:

1. Read all files in `.github/skills/<bc-name>/`
2. Read all other BC skill files to understand what adjacent BCs already own
3. Read `CLAUDE.md` for project-wide conventions

Then declare a **Scope Lock** to the user:

```
Scope lock: This session covers the [bc-name] BC only.

In scope:
  - Everything owned and decided by this BC

Out of scope (owned by other BCs):
  - [List every adjacent BC and what it owns, one line each]

Any concern that belongs to another BC will be noted in a Deferred Items log
and addressed in a separate session. It will NOT be designed or implemented here.
```

**Do not generate any other output until Phase 0 is complete.**

At session start, update this BC's `status.md` from `DISCOVERED`, `REFINED`, or
`SPEC_REVIEWED` to `REFINING`. If the file does not exist, create it from
`assets/status-template.md` and record why lifecycle tracking was initialized
late. Immediately synchronize the lifecycle into `docs/hgate-project.json` and
validate the projection; `status.md` remains authoritative.

---

## Phase 1 — Business Alignment Interview

Ask the user to describe what the BC is *actually supposed to do* in plain business language:

> *"Please describe the business behaviour of the `<bc-name>` BC — what triggers it, what it does, and what outcomes it produces. Don't worry about technical details; describe it as a business user would."*

**Rules for this phase:**
- Ask one focused question at a time; do not bundle.
- Do **not** assume anything — if something is unclear, ask explicitly.
- Do **not** generate code or updated files during this phase.
- Document all open/deferred questions (those the user could not answer yet).

---

## Phase 1.5 — Cohesion Check

After the business alignment interview, **before** doing any gap analysis, assess whether the described BC is cohesive enough to remain a single BC.

### Decomposition Signals

Flag a potential split if **two or more** of these are true:

| Signal | Example |
|---|---|
| Two distinct business concerns that could stand alone | "manages catalog AND approves activations" |
| Aggregates with no direct relationship | different lifecycles, different owners, never referenced together |
| Different roles trigger different parts independently | tenants interact with one part; LiveOps interact with another |
| Unrelated external integrations | two external APIs that share no domain concepts |
| The BC name uses "and" or is vague | "Catalog and activations BC" |
| Different reasons to change | one part changes when products change; the other when approval rules change |

### If no signals fire

State clearly:
```
Cohesion check passed — [bc-name] describes a single cohesive concern. Continuing to gap analysis.
```

### If signals fire

Pause refinement. Present a decomposition proposal:

```
Cohesion concern: the described BC appears to cover [X] and [Y], which are distinct concerns.

Proposed split:
  BC A — [Name]: owns [concern A]. Triggered by [trigger]. Produces [outcome].
  BC B — [Name]: owns [concern B]. Triggered by [trigger]. Produces [outcome].

Rationale: [one sentence per signal that fired]

Options:
  1. Split as proposed — proceed with BC A only this session; BC B gets its own session.
  2. Keep as one BC — explain why these concerns must stay together.
  3. Adjust the split — describe a different boundary.
```

**Do not proceed until the user explicitly chooses an option.** If they choose option 1, update the Scope Lock to reflect the narrower BC before continuing.

---

## Phase 2 — Gap Analysis

Compare the business description (Phase 1) against the existing skill files. Produce a structured gap list:

| Gap Category | Description |
|---|---|
| **Missing concepts** | Aggregates, entities, or lifecycle states absent from the current model |
| **Wrong behaviour** | Existing rules that contradict the business description |
| **Wrong cadence/schedule** | Cron jobs or polling intervals that differ from spec |
| **Missing events** | Domain events that should be emitted but aren't listed |
| **Missing integrations** | External systems that interact with this BC but have no ACL file |
| **VO Discipline violations** | String-wrapper VO classes that should be type aliases |
| **Cross-BC contamination** | Concepts, methods, or ports that belong to another BC |
| **YAGNI contamination** | Methods or ports added for a BC that does not yet exist |

Present the gap list to the user for confirmation before proceeding.

When identifying cross-BC contamination, name the BC it belongs to and add it to the Deferred Items log (see *Active Redirection* below).

---

## Phase 3 — Structured Clarification

For each non-trivial gap, ask a targeted clarifying question. Group questions by topic. Use multiple-choice where the answer space is bounded.

Capture answers as a numbered list in the session plan. Mark deferred questions as `[OPEN]`.

**Minimum questions to resolve before proceeding:**
1. Granularity of any approval/activation lifecycle (e.g., per-product vs per-denomination)
2. Status transitions — what statuses exist, what transitions are allowed, which are terminal
3. Concurrency rules — can duplicate pending records exist?
4. Who can trigger state transitions (tenant vs admin vs system job)?
5. What domain events does **this BC** emit? *(Limit to the event name and payload. What consuming BCs do with those events is out of scope — that belongs in the consuming BC's refinement session.)*
6. Any external API contracts — does a real API spec exist or is it TBD?

---

## Active Redirection (applies throughout the entire session)

Whenever the user raises a concern that belongs to another BC — whether during interview, clarification, or execution — apply this protocol:

1. **Acknowledge** the concern in one sentence.
2. **Name the BC it belongs to.**
3. **Log it** in the Deferred Items section (see format below).
4. **Redirect** back to the current BC.

```
That sounds like it belongs to the [X] BC — I've noted it in the Deferred Items log.
Let's stay focused on [current BC] for now.
```

### Deferred Items Log

Maintain a running list. Present it at the end of the session.

```
## Deferred Items (for other sessions)

| BC | Item | Why deferred |
|----|------|--------------|
| Ordering BC    | Cart submission webhook handler  | Belongs to Ordering BC's ACL, not here |
```

If the user wants to implement a deferred item in the current session, issue a clear warning before proceeding:

```
⚠️ Warning: implementing [item] here introduces cross-BC coupling.
[item] belongs to the [X] BC. Adding it to [current BC] means [current BC]
now has a reason to change when [X] changes — violating single-responsibility.

Recommended: defer to a separate [X] BC session.
Proceeding anyway? [yes / no]
```


---

## Phase 4 — Plan & Approval

Write a plan summarising:
- New domain concepts to add (aggregates, entities, enums, type aliases)
- Business rules to add or correct
- Domain events to add
- Schema changes
- Files to update vs. files to create
- Contamination to remove (with destination BC noted)

Present the plan using `exit_plan_mode`. Do not modify any files until the user approves.

---

## Phase 5 — Execution (Update Skill Files)

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

### 5e. `decisions.md`

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

### 5f. `status.md`

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

## Phase 6 — Validation

After updating all files, self-check:

1. Every aggregate in `SKILL.md` has a corresponding class in `domain-model.md`.
2. Every domain event in the SKILL.md event table has a matching `.event.ts` in the module tree.
3. Every business rule in `SKILL.md` has at least one BDD scenario that tests it.
4. Every external integration mentioned in `SKILL.md` has a corresponding `*-acl.md` file.
5. No VO Discipline violations remain (string wrappers as VO classes).
6. All ubiquitous language terms in `bdd-scenarios.md` match the glossary in `SKILL.md`.
7. **BC Isolation check**: Does any port, method, service, or aggregate in this BC exist solely to serve an adjacent BC? If yes, flag as cross-BC contamination and move to the Deferred Items log.
8. **YAGNI check**: Does any port, method, or concept only make sense once a BC that does not yet exist is built? If yes, flag as YAGNI contamination and move to the Deferred Items log.
9. Every concluded BC decision from the session is recorded in this BC's
   `decisions.md`; cross-cutting decisions link to standalone ADRs.
10. The BC-local `status.md` reflects `REFINED` only after user approval and all
    validation checks pass.
11. Every Scenario/Scenario Outline has one valid, repository-unique
    `@scenario:<ID>` tag; no ID is duplicated or reused.
12. `domain-model.md` contains the structured Ports table and every port has a
    name, direction, purpose, and contract.
13. If the refined authoritative artifacts changed projected information,
    synchronize `docs/hgate-project.json`. Include the BC's stable ID, name,
    domain ID, classification, boundary role, lifecycle from `status.md`,
    ownership, capabilities, structured ports, ACL metadata, and source paths.
    Preserve unrelated entries and deterministic ordering, omit timestamps, and
    validate against `docs/hgate-project.schema.json`.

Report any violations to the user after completing the update.

The projection is derived and cannot introduce a decision absent from the
Markdown artifacts. If required projected information is unconfirmed, record
the schema's `UNCONFIRMED` value or return to the authoritative artifact rather
than deciding it in JSON. A refinement is not complete when projected
authoritative information changed and the projection is stale or invalid.

---

## Phase 7 — Session Close

End every session with a structured summary:

```
## Session Summary — [bc-name] BC Refinement

### What changed
- [file]: [one-line description of change]

### Open questions [OPEN]
- [question]: deferred because [reason]

### Deferred Items (for other sessions)
| BC | Item | Why deferred |
|----|------|--------------|
| ...

### Recommended next sessions
1. [BC name] — [one sentence on why it should be refined next]
```

This ensures nothing gets lost between sessions and the next refinement has a clear starting point.

---

## Standing Rules (Applied in Every Refinement)

### BC Isolation
A BC must have a **single reason to change**. If two concerns within a BC would evolve independently — triggered by different events, owned by different teams, or changing for different business reasons — they belong in separate BCs.

- When another BC's logic is about to be added to the current BC, warn the developer and explain the coupling risk before proceeding. Cross-BC contamination typically starts with "just one method."
- A port or method that only makes sense when an adjacent (unbuilt) BC exists is a YAGNI violation — flag it, log it in Deferred Items, and recommend removing it. The developer decides.

### VO Discipline
A Value Object earns a dedicated class **only** when it carries at least one of:
- Validation invariants
- Non-trivial equality semantics
- Behaviour (methods)

Plain string/number wrappers are **`type` aliases** colocated with the aggregate file. Structural DDD elements (Aggregate, Repository, Domain Event, Application Service, ACL) remain uniform across BCs regardless of subdomain depth.

### Schema-per-Tenant
- **Global / shared tables** → `public` schema
- **Per-tenant tables** → `<tenant_schema>` set via CLS context
- Repositories targeting tenant tables must call `Model.schema(tenantContextService.getTenantSchema())` on every query.
- Cross-schema FKs from tenant tables to `public` tables are **logical only** (no Postgres FK constraint). Integrity maintained by: (a) public tables are append-only / soft-delete only, (b) cascade rules enforced in application code.

### Soft Delete
Never hard-delete domain records. Use `isActive = false` (products), status terminal states (EXPIRED, REVOKED), or equivalent per BC.

### Idempotency
Every sync job or external webhook handler must be safe to call twice. Use a checksum, external correlation ID, or UNIQUE constraint to guard against duplicate processing.

### Decimal Money
Always use `DECIMAL(12,4)` for monetary amounts in Postgres. Never use `FLOAT` or `DOUBLE`. In TypeScript use `decimal.js` or equivalent. Never compare Money values with `==`.

### Domain Events
All state transitions that adjacent BCs need to know about must emit a domain event. The event payload must contain enough context for consumers to act without querying back.

Document the event name and payload in this BC's skill. How consuming BCs handle the event is documented in the consuming BC's skill — not here.

### ProductType Extensibility
Always use the `ProductType` enum. Never hardcode `'GIFT_CARD'` as a string literal.

### Ports (Outbound Dependencies)
Every outbound dependency (external API, messaging, storage outside the BC) must be accessed via a **port interface** defined in the domain layer (`domain/ports/`). The ACL adapter in the infrastructure layer *implements* the port. Application services depend on the port interface, never on the adapter directly.

```
ApplicationService → calls → SomePort          (domain/ports/)
                                  ↑ implements
                          SomeExternalClient    (infrastructure/acl/)
```

This rule applies uniformly to **all** outbound integrations — there are no exceptions for "simple" sync jobs or polling clients.

### No Raw External DTOs in Domain
No domain aggregate or application service may hold a raw API response object. Translation always happens in the ACL adapter.

---

## Reference Output

The **Catalog BC** skill (`.github/skills/catalog/`) is the canonical reference for a fully-refined, cleanly-scoped BC skill. It was produced by applying this process, including removing cross-BC contamination

Key files to reference:
- `SKILL.md` — purpose, full module tree, business rules, VO Discipline section, ubiquitous language
- `domain-model.md` — type aliases block, true VO classes, Sequelize schemas, design decisions
- `bdd-scenarios.md` — features ordered from infrastructure concern → core feature → supporting concern; no scenarios for adjacent BCs
- `*-acl.md` — the BC's ACL companion file (proxy details, token lifecycle, error handling, env vars)
