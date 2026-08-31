---
name: domain-exploration
description: >
  Use this skill when a user needs to understand a business problem or requirement,
  discover the relevant domain concepts, or determine whether the work belongs to
  one bounded context or several. Trigger phrases include "explore this domain",
  "identify the bounded contexts", "is this one BC or multiple BCs", "help me
  understand this requirement", "break this problem into domains", and "where
  does this feature belong". This skill is interactive and confirmation-gated. It
  does not produce source code or detailed BC specifications.
context: fork
---

# Domain Exploration

## Purpose

Turn an unclear problem or requirement into a user-confirmed domain and bounded
context map. Discover the business language, capabilities, rules, actors,
outcomes, ownership boundaries, and cross-context relationships before detailed
BC refinement begins.

This is a collaborative discovery process, not an autonomous classification
exercise. The AI should provide analysis and recommendations, but the user
confirms every material conclusion.

## Input

At minimum:

- A problem, requirement, product idea, or business outcome to explore
- Any known actors, systems, constraints, or existing domains

Useful supporting evidence includes:

- Existing domain documentation and glossaries
- User journeys and business processes
- Current source code, APIs, events, schemas, and architecture diagrams
- Organization or team ownership
- Known policies, regulations, and external-system contracts

Do not require technical artifacts when the user is still describing a new
business capability.

## Output

A confirmed Domain Exploration Report containing:

- Problem statement and desired outcomes
- Scope and non-goals
- Ubiquitous language glossary
- Business capabilities and rules
- Proposed domains and bounded contexts
- Core, Supporting, or Generic classification
- Context relationships and integration needs
- Single-BC or multi-BC conclusion
- Open gaps, assumptions, and deferred questions
- Recommended next hGATE skill for each BC

The report is a discovery handoff. It is not a replacement for the specification
files produced by `bc-refinement`.

When repository access is available, persist the confirmed output as:

- `docs/domain-map.md`, created from
  `assets/domain-map-template.md`
- `docs/context-map.md`, created from
  `assets/context-map-template.md`
- `docs/hgate-project.json`, the deterministic machine-readable projection of
  the confirmed maps and BC-local authoritative artifacts
- `.github/skills/<bc-name>/status.md` for each confirmed BC, created from the
  `bc-refinement` status template with lifecycle `DISCOVERED`

If an artifact already exists, update only confirmed boundary changes. Do not
overwrite unrelated BC entries or lifecycle history.

The Markdown maps, BC specifications, decisions, ACLs, and BC-local `status.md`
files remain authoritative. `docs/hgate-project.json` is one global, derived
projection for tools such as the project viewer; it is not a place to make or
approve decisions.

## Non-Negotiable Rules

1. Ask questions instead of silently filling gaps.
2. Ask one focused question at a time.
3. Label recommendations as recommendations, not decisions.
4. Obtain explicit user confirmation for every material boundary or ownership
   conclusion.
5. A gap remains `OPEN` until the user explicitly answers or confirms it.
6. Silence, topic changes, or acceptance of a neighboring point do not close a
   gap.
7. Do not equate a domain, bounded context, feature, module, service, database,
   or team without evidence.
8. Do not create source code, migrations, APIs, or detailed BC specification
   files.
9. Do not force a multi-BC design when one cohesive model is sufficient.
10. Do not force a single BC merely because the requirement was described as
    one feature.
11. If evidence and the user's preference conflict, explain the risk and ask
    for a deliberate decision.
12. Keep unresolved uncertainty visible in the final report.

## Discovery Status Vocabulary

Use these statuses throughout the discussion:

| Status | Meaning |
|---|---|
| `OBSERVED` | Supported by user testimony or inspected evidence |
| `PROPOSED` | Recommended interpretation awaiting confirmation |
| `CONFIRMED` | Explicitly accepted by the user |
| `OPEN` | Missing, ambiguous, disputed, or unanswered |
| `DEFERRED` | Intentionally postponed with a reason and owner |
| `OUT_OF_SCOPE` | Explicitly excluded from this exploration |

Only the user can move a material conclusion from `PROPOSED` to `CONFIRMED`.

## Gap Register

Maintain a visible register throughout the exploration:

```text
| ID | Topic | Gap or question | Status | Resolution/evidence |
|----|-------|-----------------|--------|---------------------|
| G1 | Actor | Who approves a refund? | OPEN | |
| G2 | State | Can a rejected request be resubmitted? | CONFIRMED | Yes, as a new request |
```

Rules:

- Add a gap whenever behavior, terminology, ownership, lifecycle, or scope is
  ambiguous.
- Ask the highest-impact open question first.
- Record the user's answer before moving to the next question.
- If an answer creates another ambiguity, add a new gap.
- Do not mark a gap resolved based only on an AI recommendation.
- If the user cannot answer, keep it `OPEN` or explicitly mark it `DEFERRED`.

## Workflow

### Phase 0 - Establish the Exploration Scope

Before analyzing boundaries:

1. Restate the problem in plain business language.
2. Identify what triggered the exploration.
3. Record the desired business outcome.
4. Record known constraints and non-goals.
5. List available evidence.
6. Ask the user to correct or confirm the framing.

Use:

```text
Exploration scope

Problem:
[Plain-language statement]

Desired outcome:
[Observable business outcome]

Known scope:
- [...]

Known non-goals:
- [...]

Open framing gaps:
- [...]

Is this an accurate starting point?
```

Do not begin bounded-context identification until the user confirms the problem
framing.

### Phase 1 - Business Discovery Interview

Ask the user to describe the requirement as a business process, without asking
them to design the software.

Explore one topic at a time:

1. Actors - who initiates, participates in, approves, or observes the process?
2. Trigger - what causes the process to begin?
3. Outcome - what business result must be produced?
4. Decisions - which rules or policies change the outcome?
5. State - what information changes over time?
6. Lifecycle - what stages and transitions exist?
7. Exceptions - what can fail, be rejected, be cancelled, or require recovery?
8. Ownership - who owns each decision and source of truth?
9. Timing - what must happen immediately, eventually, periodically, or manually?
10. Constraints - what legal, commercial, operational, or technical limits apply?

Prefer questions such as:

- "What business event starts this process?"
- "Who is allowed to make that decision?"
- "What must remain true after this step completes?"
- "Does this term mean the same thing to every actor?"
- "What happens when this dependency accepts the request but the result is not
  received?"

Avoid prematurely technical questions such as:

- "Should this be a microservice?"
- "Which database table should own this?"
- "Should this use REST or events?"

### Phase 2 - Build the Ubiquitous Language

Create a glossary from the user's language:

```text
| Term | Business meaning | Used by | Ambiguities/anti-terms | Status |
|------|------------------|---------|------------------------|--------|
```

Look for:

- The same term with different meanings
- Different terms describing the same concept
- Technical words masking a business concept
- Verbs that imply business capabilities
- Nouns that may represent entities, value objects, policies, or events

When conflicting meanings appear, do not normalize them silently. Ask whether
they represent different perspectives or different bounded contexts.

### Phase 3 - Identify Business Capabilities

Group confirmed behavior into capabilities. For each capability record:

```text
Capability:
Business purpose:
Primary actors:
Trigger:
Outcome:
Rules and decisions:
State owned:
Reason to change:
Dependencies:
Status:
```

Capabilities describe what the business must be able to do. They are not yet
bounded contexts.

Ask the user to confirm that:

- No essential capability is missing
- No listed capability is merely an implementation detail
- Each capability has a distinct business outcome

### Phase 4 - Form Bounded Context Hypotheses

Use the capabilities and language to propose one or more bounded contexts.

#### Signals that capabilities may belong to one BC

- They share one cohesive business purpose
- They use the same language with the same meanings
- They operate on the same closely related model and lifecycle
- They enforce rules that must remain consistent together
- They have the same business owner and reason to change
- Separating them would create artificial coordination without clarifying
  ownership

#### Signals that multiple BCs may be needed

- The same term has different meanings in different workflows
- Capabilities have independent business purposes or lifecycles
- Different actors or owners make independent decisions
- Different policies cause them to change independently
- They maintain different sources of truth
- They can succeed, fail, or evolve independently
- Integration is naturally expressed as a contract, domain event, or policy
  boundary
- Combining them would require one model to serve conflicting meanings

Treat these as diagnostic signals, not automatic rules.

For each proposed BC present:

```text
Proposed BC: [name]
Purpose:
Owns:
Does not own:
Ubiquitous language:
Key capabilities:
Primary actors:
Source of truth:
Reason to change:
Adjacent BCs:
Evidence:
Remaining gaps:
Status: PROPOSED
```

Then ask the user to confirm, reject, or modify the proposal.

### Phase 5 - Test the Boundaries

Walk representative scenarios across the proposed map:

1. A normal successful journey
2. A meaningful rejection or failure
3. A changed or cancelled journey
4. A scenario involving concurrent or repeated actions
5. A scenario crossing every proposed BC boundary

For each step ask:

- Which BC makes the business decision?
- Which BC owns the resulting state?
- Is another BC informed, or must it synchronously request a decision?
- Does the receiving BC translate the concept into its own language?
- Could either side change independently without sharing internal models?

If a scenario cannot be assigned cleanly, reopen the relevant boundary gap.

### Phase 6 - Classify the Subdomains

After the boundaries are confirmed, recommend a classification:

| Classification | Use when |
|---|---|
| Core Domain | Provides strategic differentiation or unique business advantage |
| Supporting Subdomain | Necessary for the business but not a primary differentiator |
| Generic Subdomain | A broadly solved capability that should usually be bought, reused, or minimally customized |

For each BC provide the recommendation and rationale, then ask for explicit
confirmation. Classification is a strategic business decision, not a measure of
technical complexity.

### Phase 7 - Describe Context Relationships

For each relationship identify only what is needed for the discovery handoff:

```text
Provider/owner:
Consumer:
Business information or decision exchanged:
Source of truth:
Consistency expectation:
Candidate interaction: request/response | domain event | scheduled sync | TBD
Translation or ACL needed: yes | no | TBD
Open contract questions:
Status:
```

Do not design detailed port interfaces, DTOs, endpoints, topics, or schemas here.
Those belong in the affected BC's `bc-refinement` session.

For a cross-BC feature:

1. Identify every affected BC.
2. Identify the owner of each business decision and state transition.
3. Record the agreed information exchanged between contexts.
4. Recommend one separate `bc-refinement` or `bc-enhancement` fork per BC.
5. Carry the confirmed relationship as a handoff into each fork.

### Phase 8 - Gap Closure Review

Before concluding, show all gaps grouped by status:

- `OPEN`
- `DEFERRED`
- `CONFIRMED`
- `OUT_OF_SCOPE`

For every `OPEN` gap ask whether the user wants to:

1. Resolve it now
2. Defer it with an owner and reason
3. Declare it out of scope

Ask one gap at a time. Do not batch approvals.

If an open gap could materially change a BC boundary, ownership decision, or
Core/Supporting/Generic classification, the exploration cannot be called final.
Mark the affected conclusion as provisional.

### Phase 9 - Final Confirmation Gate

Present the complete proposed Domain Exploration Report and ask the user to
confirm it.

The report must include:

```text
# Domain Exploration Report

## Problem and desired outcome
## Scope and non-goals
## Confirmed ubiquitous language
## Business capabilities
## Domain and bounded context map
## Single-BC or multi-BC conclusion
## Subdomain classifications
## Context relationships
## Confirmed decisions
## Open and deferred gaps
## Recommended next hGATE sessions
```

Do not describe the report as final until the user explicitly confirms it.

### Phase 10 - Handoff

After confirmation, recommend the next skill:

- Use `bc-refinement` once per newly identified or not-yet-specified BC.
- Use `bc-enhancement` once per already-built BC affected by a changed
  requirement.
- Use `bc-review` when the user wants to audit an existing BC specification or
  compare it with implementation.
- Use `architecture-decision-exploration` when a technical or cross-system
  architecture decision remains ambiguous after business boundaries are known.

Every BC handoff should include:

- Confirmed BC purpose and classification
- In-scope and out-of-scope capabilities
- Ubiquitous language
- Owned decisions and state
- Adjacent BC relationships
- Relevant open or deferred gaps

Persist the confirmed domain and context maps before closing the session. Create
or update each confirmed BC's local `status.md` and record the transition to
`DISCOVERED`. The domain map must link to local status files instead of
duplicating mutable lifecycle state.

Then synchronize `docs/hgate-project.json` because confirmed boundaries,
relationships, journeys, and lifecycle values changed. Project schema version 1
contains `project`, `domains`, `boundedContexts`, `relationships`, and
`journeys`. Use stable IDs from the maps, read lifecycle only from each BC's
`status.md`, include source artifact paths, omit timestamps, and sort every
collection deterministically by stable ID (and nested ports/ACLs by name).
Validate the result against `docs/hgate-project.schema.json`. Do not complete
the handoff if the projection is stale or invalid.

## Recommendation Protocol

When the AI has a preferred interpretation:

1. State the recommendation.
2. Explain the business evidence and tradeoff.
3. Name credible alternatives.
4. State which gaps remain.
5. Ask the user to confirm, reject, or adjust it.

Use:

```text
Recommendation: [...]

Why:
- [...]

Alternative:
- [...]

This remains PROPOSED because:
- [...]

Do you confirm this recommendation?
```

Never turn a recommendation into a confirmed decision without the user's
explicit response.

## Relationship to Other Skills

| Skill | Responsibility |
|---|---|
| `domain-exploration` | Understand the problem and identify domain/BC boundaries |
| `architecture-decision-exploration` | Resolve ambiguous technical and cross-system architecture decisions |
| `bc-refinement` | Produce detailed specification artifacts for one BC |
| `bc-review` | Audit one BC's specifications and implementation |
| `bc-enhancement` | Update specifications, code, and tests for an already-built BC |
| `cross-bc-validation` | Validate one completed journey across several implemented BCs without implementing fixes |

## Completion Criteria

Domain exploration is complete only when:

- The problem and desired outcome are confirmed
- The important business capabilities are confirmed
- Material terminology conflicts are resolved or explicitly deferred
- The single-BC or multi-BC conclusion is confirmed
- Every proposed BC has confirmed ownership and exclusions
- Every BC classification is confirmed
- Cross-BC relationships identify the source of truth
- No boundary-changing gap is silently treated as resolved
- Remaining open items are visible and assigned a disposition
- The user explicitly confirms the final report
- Confirmed maps are persisted when repository access is available
- Every confirmed BC has a local lifecycle status artifact
- Stable IDs exist for every projected BC, relationship, and journey
- `docs/hgate-project.json` matches the authoritative artifacts, has
  deterministic ordering and no timestamps, and passes schema validation

If these conditions are not met, produce an interim report and clearly label the
affected boundaries as provisional.
