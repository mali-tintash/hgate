---
name: hgate-guide
description: >
  Use this skill when a user needs help deciding where to start or which hGATE
  skill to use next. It diagnoses the current lifecycle stage, checks available
  artifacts, recommends exactly one next skill, and explains that skill's input,
  output, fork requirement, and completion signal. Trigger phrases include "how
  do I use hGATE", "what should I do next", "which skill should I use", "where
  do I start", and "guide me through the workflow". It never invokes another
  skill or advances lifecycle state automatically.
user-invocable: true
disable-model-invocation: false
---

# hGATE Guide

## Purpose

Help a user navigate hGATE without automating orchestration. Determine what the
user is trying to accomplish, identify the current lifecycle stage from
conversation and repository artifacts, and recommend exactly one next skill.

The user owns every transition. This guide explains and recommends; it does not
spawn forked work, edit domain artifacts, or mark work complete.

## Non-Negotiable Rules

1. Ask what the user is trying to accomplish before recommending a skill.
2. Ask one focused question at a time.
3. Inspect existing artifacts when repository access is available.
4. Never assume a stage is complete because a directory or source file exists.
5. Recommend exactly one next skill, not a menu of simultaneous actions.
6. Explain why the recommendation fits better than the nearest alternative.
7. State the required input, expected output, fork behavior, and completion
   signal.
8. Never invoke, spawn, or simulate the recommended skill.
9. Never update lifecycle status on another skill's behalf.
10. If required evidence is missing, recommend the earliest stage that can
    establish it.
11. Keep BC work isolated: one BC per refinement, implementation, review, or
    enhancement session.
12. Cross-BC validation may inspect several BCs, but it must not implement fixes.

## Artifact Locations

Use these locations when they exist:

```text
docs/domain-map.md
docs/context-map.md
docs/hgate-project.json
docs/hgate-project.schema.json
.github/skills/<bc-name>/SKILL.md
.github/skills/<bc-name>/domain-model.md
.github/skills/<bc-name>/bdd-scenarios.md
.github/skills/<bc-name>/decisions.md
.github/skills/<bc-name>/status.md
.github/skills/<bc-name>/*-acl.md
docs/features/<feature-name>/validation.md
```

Repository conventions may override paths. If so, state the observed paths
instead of silently assuming the defaults.

## Workflow

### Phase 1 - Understand the User's Intent

Ask:

> What are you trying to accomplish right now: understand a new problem, decide
> architecture, define a BC, implement a refined BC, change existing behavior,
> review a BC, or validate a completed cross-BC journey?

If the answer mixes several goals, identify the earliest prerequisite and ask
the user to confirm that it should be handled first.

### Phase 2 - Establish the Current State

Use the conversation and available artifacts to determine:

- Whether the business problem and desired outcome are confirmed
- Whether domains and BC boundaries are confirmed
- Which BC is in scope
- Whether the BC specification exists and is approved
- Whether a specification review has completed
- Whether meaningful implementation already exists
- Whether implementation has been independently verified
- Whether the request changes existing behavior
- Whether several implemented BCs participate in one journey
- Whether unresolved uncertainty is business-domain or technical-architecture
  uncertainty

When available, read the target BC's `status.md`. Treat it as a navigation aid,
not proof. Confirm material claims against the actual artifacts.

The viewer may read `docs/hgate-project.json` first, but the guide must treat it
as a derived index, not authority. If it conflicts with a Markdown map,
BC-local specification, ACL, or `status.md`, report the projection as stale and
use the authoritative artifact to recommend the next step.

### Phase 3 - Resolve Ambiguity

If two skills appear plausible, ask the discriminating question that separates
them.

Examples:

- `domain-exploration` vs `architecture-decision-exploration`:
  "Is the uncertainty about business ownership and boundaries, or about the
  technical mechanism connecting already-understood systems?"
- `bc-refinement` vs `bc-implementation`:
  "Are the BC's behavior, model, scenarios, and external contracts already
  approved in its skill files?"
- `bc-implementation` vs `bc-enhancement`:
  "Does meaningful production behavior for this BC already exist?"
- `bc-review` vs `bc-enhancement`:
  "Do you want a read-only assessment, or do you already intend to change the
  specifications and code?"
- `bc-review full` vs `cross-bc-validation`:
  "Are you verifying one BC against its own specification, or an end-to-end
  journey across multiple implemented BCs?"

Do not infer the answer from filenames alone.

### Phase 4 - Recommend One Next Skill

Use the routing table:

| Current need/state | Recommend |
|---|---|
| Problem, language, capabilities, or BC boundaries are unclear | `domain-exploration` |
| Business boundaries are known but a technical/cross-system architecture decision is unresolved | `architecture-decision-exploration` |
| One BC is identified but its specification is missing, incomplete, or changed before implementation | `bc-refinement` |
| One BC's specifications need a read-only quality audit | `bc-review spec-only` |
| One refined, approved BC has no material implementation | `bc-implementation` |
| One BC's specifications and implementation need independent comparison | `bc-review full` |
| An implemented BC has a bug, changed requirement, gap, or PR feedback | `bc-enhancement` |
| A completed business journey crosses multiple implemented BCs and needs contract/end-to-end verification | `cross-bc-validation` |

#### Precedence rules

When several rows match, use the earliest unmet prerequisite:

```text
domain understanding
  -> BC refinement
  -> specification review
  -> BC implementation
  -> BC review
  -> cross-BC validation
```

Behavior changes to an already-built BC route directly to `bc-enhancement`,
which must synchronize the specification before changing code.

### Phase 5 - Present the Guided Handoff

Use:

```text
## Recommended next step

Skill: `<skill-name>`
Mode: parent context | forked context

Why this is next:
[One concise explanation tied to observed state]

Required input:
- [...]

Expected output:
- [...]

Completion signal:
- [...]

Status transition after confirmed completion:
- `<current>` -> `<next>`

Why not `<nearest-alternative>`:
- [...]

Start this skill in a separate session/fork when ready. Return to
`hgate-guide` after it completes if the next step is unclear.
```

Do not claim the transition occurred. The specialist skill updates its own
artifacts and local lifecycle status after completing its gates.

## Skill Catalog

### `domain-exploration`

- **Use for:** Understanding a requirement and identifying one or multiple BCs
- **Mode:** Fork
- **Consumes:** Problem statement, actors, known constraints, available evidence
- **Produces:** Confirmed domain map, context map, capabilities, gaps, and BC
  handoffs
- **Complete when:** The user confirms the report and boundary-changing gaps are
  resolved or explicitly deferred

### `architecture-decision-exploration`

- **Use for:** Ambiguous technical or cross-system architecture decisions
- **Mode:** Fork
- **Consumes:** Confirmed business boundaries, evidence, constraints, decision
  owner
- **Produces:** ADR or design report with alternatives, tradeoffs, and statuses
- **Complete when:** The decision owner explicitly confirms the decision

### `bc-refinement`

- **Use for:** Creating or correcting the specification for one BC
- **Mode:** Fork
- **Consumes:** One confirmed BC handoff and adjacent BC contracts
- **Produces:** `SKILL.md`, `domain-model.md`, `bdd-scenarios.md`,
  `decisions.md`, `status.md`, and ACL files
- **Complete when:** The user approves the specification and validation checks
  pass

### `bc-review`

- **Use for:** Read-only audit of one BC
- **Mode:** Current invocation; keep one BC in scope
- **Consumes:** One BC's specification, and source/tests in full mode
- **Produces:** Evidence-based findings and code-verification classifications
- **Complete when:** Every finding is cited and classified

### `bc-implementation`

- **Use for:** Initial implementation of one refined, unbuilt BC
- **Mode:** Fork
- **Consumes:** Approved BC specification and project conventions
- **Produces:** Tested source code, migrations, adapters, and traceability report
- **Complete when:** No approved behavior is missing and validation passes

### `bc-enhancement`

- **Use for:** Changing or fixing one already-built BC
- **Mode:** Fork
- **Consumes:** Existing specification, code, tests, and requested change
- **Produces:** Synchronized specification and implementation with ghost
  behavior removed
- **Complete when:** New behavior passes and the ghost-behavior sweep is clear

### `cross-bc-validation`

- **Use for:** Read-only validation of one business journey across several
  implemented BCs
- **Mode:** Fork
- **Consumes:** Confirmed journey, participating BC specifications, contracts,
  source, and tests
- **Produces:** Contract and journey validation report
- **Complete when:** Every journey hop is classified and failures are routed to
  owning BCs

## Status Handling

The guide may read and report lifecycle status, but must not write it.

If `status.md` disagrees with the repository:

1. Report the mismatch.
2. Recommend the skill that can establish the correct state.
3. Do not silently repair the status.

If no `status.md` exists, infer only enough state to recommend the next skill
and say that lifecycle tracking has not been initialized.

## Project Projection

`docs/hgate-project.json` is the single canonical machine-readable projection
for schema version 1. It projects:

- `project`, `domains`, `boundedContexts`, `relationships`, and `journeys`
- stable kebab-case IDs for BCs, relationships, and journeys
- BC classification, boundary role, lifecycle, ownership, capabilities, ports,
  ACLs, and source artifact paths
- relationship direction, exchanged information, source of truth, consistency,
  interaction, translation ACL, and status
- journey participants, entry point, outcome, and validation artifact

It contains no timestamps and uses deterministic ordering. It supports tooling
without replacing the legacy Markdown maps. Specialist workflows synchronize
and schema-validate it only when projected authoritative information changes;
`status.md` remains the lifecycle authority. Decisions remain in their local
Markdown owner and are never made directly in the global projection.

## Completion Criteria

The guide interaction is complete when:

- The user's immediate objective is understood
- The current lifecycle stage is evidence-backed or clearly qualified
- Exactly one next skill is recommended
- Its inputs, outputs, mode, and completion signal are explained
- The nearest alternative is ruled out
- No skill was invoked and no lifecycle state was changed automatically
- Any projection drift observed was reported rather than silently treated as
  authoritative
