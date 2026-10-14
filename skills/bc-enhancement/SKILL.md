---
name: bc-enhancement
description: >
  Use this skill when adding new capability to, or changing existing behaviour
  in, an already-built Bounded Context. Covers: iterative delivery of a new
  slice after first implementation, changed business rules, bug fixes, PR
  feedback, gap closure, and requirement changes. Trigger phrases: "add X to
  this BC", "change how X works", "update the behaviour of", "the requirement
  changed", "PR feedback", "fix the logic in", "enhance this feature", "the
  flow changed", "rework", "update to now do".
  Do NOT use bc-refinement for this — bc-refinement updates skill docs only.
  This skill operates on live source code with ghost-behavior detection.
context: fork
---

# BC Enhancement — Implementing Changes to a Built BC

---

## Overview

This skill is used when behaviour must be added to or changed in a BC that is
already implemented in code. It covers two equally common scenarios:

- **Iterative delivery** — adding a new capability slice to a BC after its
  first implementation. The spec did not need to be complete on day one; new
  slices are refined and implemented incrementally through this skill.
- **Behavior change** — a business rule, bug, requirement, or gap is being
  corrected or replaced in existing code.

Its primary guard is **ghost behavior detection** — the systematic discovery
and elimination of old code paths that contradict the updated design.

**The incident this skill prevents:**

> A feature was built, the design changed, the AI added the new behaviour correctly,
> but old behaviour survived undetected because the AI only reviewed the changed lines
> — not the entire BC. Both old and new behaviour ran simultaneously.

**Input:** A description of what needs to change and which BC is affected.  
**Output:** Source code that fully reflects the new behaviour, with old behaviour fully removed.

**Golden rule: zero ghost behavior tolerance.** Before closing the task, every code path
that implemented the old behaviour must be provably gone — deleted, replaced, or
explicitly blocked by the new logic.

**Fast path:** a change with no observable behavior impact (null-guard, log line,
rename, perf tweak, dependency bump) does not need the full pipeline below. Phase 0.5
classifies the change and, with human confirmation, routes genuinely trivial changes
through a lightweight fast path instead.

---

## Phase 0 — Full State Read (Non-Negotiable)

Before writing a single line of code:

### 0a. Read the skill truth

Read **every file** in `.github/skills/<bc-name>/`:
- `SKILL.md` — the canonical description of what this BC should do
- `domain-model.md` — aggregates, entities, enums, DB tables
- `bdd-scenarios.md` — acceptance scenarios that define correct behaviour
- `decisions.md` — concluded decisions and links to cross-cutting ADRs
- `status.md` — current BC lifecycle state and transition history
- All `*-acl.md` files

### 0b. Identify affected BC source files

From the change description, extract the key domain terms, method names, and type names
that are directly involved in or adjacent to the change. Grep for those identifiers
across `src/<bc-name>/` to find every file that comes under the influence of this change:

```bash
grep -rn "TermA\|methodName\|TypeName" src/<bc-name>/
```

Read only the files surfaced by the results. Repeat with additional terms if the initial
results reveal new names worth tracing.

### 0c. State what you read

After Phase 0, output a confirmation:

```
Phase 0 complete. Read:
  Skill files: [list]
  Grep commands run: [each command and its match count]
  Source files read: [every file surfaced — not a summary]
```

**Do not proceed to Phase 0.5 until this is complete.**

---

## Phase 0.5 — Triviality Gate

Before doing anything else, classify the change. This gate exists so a small
AI-authored fix does not pay the same ceremony cost as a business-rule change
— but it must default to the full pipeline whenever there is any doubt.

### Classification checklist

Classify against the shared checklist in `docs/change-classification.md`
(Implementation-detail vs. Behavioral). **When uncertain, classify as
Behavioral.** This gate is conservative by design.

### State the classification and confirm

Output the checklist with a pass/fail per item and a proposed classification,
then ask the user a single yes/no question:

```
Proposed classification: Implementation-detail — no spec impact.
[checklist with pass/fail per item]

Confirm fast path (skip ghost-behavior audit, consequence interview, and
skill-file sync)? [yes / no — or explain why this is behavioral]
```

Do not proceed on your own judgment. If the user disagrees, declines, or does
not answer this exact question, treat the change as Behavioral.

### Behavioral path

Proceed to Phase 1. First update local lifecycle status:

```text
IMPLEMENTED | VERIFIED -> CHANGING
```

Immediately synchronize that lifecycle into `docs/hgate-project.json` and
validate it; the transition remains owned by `status.md`.

If the BC is not in an eligible state, stop and resolve the status/code
mismatch before implementation.

### Implementation-detail path (fast path)

Do not transition `status.md`. Do not touch `bdd-scenarios.md`, scenario IDs,
`domain-model.md`, or any `*-acl.md` file — any such edit means the change was
misclassified and must move to the Behavioral path instead.

1. Apply the fix.
2. Run the existing targeted tests for the touched files/methods. They must
   pass without any assertion changes.
3. Run a scoped stale-reference grep for anything renamed or removed by the
   fix:
   ```bash
   grep -rn "oldIdentifier" src/<bc-name>/
   ```
4. Append one dated, one-line entry to this BC's `decisions.md`, for example:
   ```
   - 2026-08-07: Fast path — null-guard added in `cart.service.ts` around
     `getActiveCart`; no spec impact.
   ```
5. Close with a minimal report:
   ```
   ## Fast-Path Patch Complete — [bc-name] BC

   ### Change
   [one sentence]

   ### Files modified
   - [file] — [what changed]

   ### Tests
   [targeted test command] → PASS

   ### Stale-reference grep
   [command] → 0 results ✓

   ### Spec impact
   None — decisions.md updated with a one-line note.
   ```
6. Stop here. Do not run Phases 1–7.

The fast path does not synchronize `docs/hgate-project.json`: by definition it
changes no projected authoritative information or lifecycle state.

---

## Phase 1 — Ghost Behavior Audit

Compare what the code **currently does** against what the SKILL.md says it **should do**.

Produce a **Ghost Behavior Report**:

```
## Ghost Behavior Report

### Confirmed current behavior (matches skill)
- [file:line] Description of what this code does and why it is correct

### Ghost behaviors (code that contradicts the skill)
- [file:line] What this code currently does
  Contradicts: [skill rule or lifecycle step it violates]
  Must: DELETE | REPLACE | BLOCK

### Dead code (no longer called by any flow)
- [file:line] Method/block that exists but is no longer reachable after the change
  Action: DELETE

### Missing behaviors (skill says it should happen, code doesn't do it)
- [description] What the skill requires that has no implementation
  Action: ADD in [file]
```

Present this report to the user before proceeding. **Do not modify any files yet.**

---

## Phase 2 — Change Analysis

**Before doing any work in this phase, read `references/phase-2-change-analysis.md` in full and follow it exactly. It contains the complete body of this phase; do not proceed from memory or skip it.**

## Phase 3 — Skill File Sync

**Before doing any work in this phase, read `references/phase-3-skill-file-sync.md` in full and follow it exactly. It contains the complete body of this phase; do not proceed from memory or skip it.**

## Phase 4 — Implementation Plan

Produce an ordered file-by-file plan. For each file:

```
[filename]
  DELETE: [method/block — reason]
  MODIFY: [method/block — what changes]
  ADD:    [method/block — what it does]
```

Include every file that will change — controllers, services, repositories, ports, DTOs.

Use `exit_plan_mode` to present the plan and wait for explicit approval before executing.

---

## Phase 5 — Execution (Whole-File Awareness)

**Before doing any work in this phase, read `references/phase-5-execution.md` in full and follow it exactly. It contains the complete body of this phase; do not proceed from memory or skip it.**

## Phase 6 — Ghost Behavior Sweep

**Before doing any work in this phase, read `references/phase-6-ghost-behavior-sweep.md` in full and follow it exactly. It contains the complete body of this phase; do not proceed from memory or skip it.**

## Phase 7 — Close Report

End every enhancement session with:

```
## Enhancement Complete — [bc-name] BC

### Change implemented
[One sentence describing what changed]

### Files modified
- [file] — [what changed]

### Ghost behaviors eliminated
- [old behaviour] in [file:line] — DELETED

### New tests added
- [test name] in [file]

### Skill files updated
- [file] — [what changed] / Already up to date

### BDD-to-TDD sign-off
- [artifact path]

### Goal 3 business-logic verification
- [property sign-off artifact path] / Declined: [BC decision entry]

### Open items
- [anything deferred or blocked — none if clean]
```

After the enhancement, tests, ghost-behavior sweep, BDD human sign-off, and any
selected Goal 3 sign-off pass, update:

```text
CHANGING -> IMPLEMENTED
```

After authoritative specifications and `status.md` are final, synchronize
`docs/hgate-project.json` only if projected information changed. Preserve stable
BC/relationship/journey IDs and unrelated entries; derive lifecycle from
`status.md`; include structured ports, ACLs, and source paths; omit timestamps;
sort deterministically; and validate against
`docs/hgate-project.schema.json`. The projection records confirmed truth but
never decides it independently.

This intentionally makes any previous `VERIFIED` status stale. Run
`bc-review full` for independent verification. If blocked, record
`CHANGING -> BLOCKED` with the owner and intended return state.

---

## Standing Rules

### Never partial-implement a behavior change

When a change requires removing old behaviour and adding new behaviour, both
must happen in the same session. Leaving old behaviour in place "for now" is
not acceptable — it creates the exact ghost behavior problem this skill exists
to prevent.

This rule applies to behavior *changes and replacements*. Iterative delivery
is different: deliberately scoping a thin new slice (adding capability that did
not exist before) is not partial implementation — it is intentional incremental
delivery. The scope of each slice is confirmed with the user in Phase 2 before
coding begins.

### Tests must reflect the new reality

A test that mocks a deleted method will fail at runtime even if it compiles. A test that
asserts the old behaviour passing is a false green. Both must be fixed.

### Scope creep is a two-way risk

Under-scope (missing a ripple effect) causes ghost behavior.
Over-scope (touching unrelated code) risks regressions.
When in doubt about whether something is in scope, ask — don't assume.

### If the skill and the code disagree before the change starts

The skill file is the truth. If Phase 0 reveals that the current code was already
drifting from the skill (before this enhancement), flag it in the Ghost Behavior Report
and get a decision from the user: fix the drift now (inline with this task) or log it
as a separate task. Do not silently build on top of drifted code.

---

## Relationship to Other Skills

| Skill | When to use |
|---|---|
| `bc-refinement` | Designing or updating the SKILL documentation files — no source code changes |
| `bc-enhancement` | Implementing a behaviour change in already-written source code |
| `bc-refinement` then `bc-enhancement` | When the design itself needs to change AND then be implemented — run refinement first to lock the new skill, then enhancement to implement it |
