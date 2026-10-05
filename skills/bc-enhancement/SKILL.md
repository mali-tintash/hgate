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

Describe the enhancement in structured terms:

```
## Change Summary

### What triggered this change
[One sentence — requirement change, PR feedback, design decision, etc.]

### New behaviour (being introduced)
[Numbered list of what the code should do after the change]
```

### Phase 2a — Consequence Interview (mandatory)

Before identifying ripple effects yourself, **ask the user explicit consequence questions**
based on the new behaviour. The AI cannot always know which old behaviours should survive
and which should be replaced — only the user knows the full business intent.

For every significant new behaviour introduced, ask the corresponding "does the old way
still apply?" question. Ask all questions at once as a numbered list — do not ask one at
a time.

**Question template:**

```
Before I plan the implementation, I need to confirm how the new behaviour affects
existing flows. Please answer each question:

1. Now that [new behaviour X] exists, should [old behaviour Y] still happen, or is [X]
   its replacement?

2. Now that [new endpoint / flow Z] handles [outcome], should any existing code path
   that previously produced the same outcome be removed?

3. [Any other "does this survive?" question for each old flow touched by the change]
```

**Example (the incident that prompted this skill):**

> New behaviour: a `close` endpoint is added that creates `ProductActivation` records
> for all approved items at close time.
>
> Consequence question the AI must ask:
> *"Now that the close endpoint creates ProductActivations, should individual item
> approval still create a ProductActivation immediately, or is that behaviour fully
> replaced by the close endpoint?"*
>
> Without asking this, the AI would add the close endpoint correctly but leave the
> per-item creation in place — producing ghost behavior where both paths run.

**Do not proceed to Phase 2b until the user has answered all consequence questions.**

### Phase 2a.1 - Optional Goal 3 decision

For every behavioral enhancement, ask:

> Do you want Goal 3 business-logic verification for this BC change?

This choice is optional at every adoption level and applies only to the current
change scope.

If declined, record the scope and supplied rationale as a concluded
**Asked -> Findings -> Decision/Action** entry in the BC's `decisions.md`. Do
not create a skipped property sign-off artifact. Continue with the normal
BDD-to-TDD path.

If accepted, Phase 3 must create or update `properties.md` from
`bc-refinement/assets/properties-template.md`. Keep universal property claims
separate from concrete BDD examples.

### Phase 2b — Ripple Effect Analysis

Using the user's answers from Phase 2a, produce:

```
### Old behaviour confirmed REMOVED (user confirmed)
- [behaviour] in [file] — will be deleted

### Old behaviour confirmed SURVIVING (user confirmed)
- [behaviour] in [file] — will NOT be touched

### Additional ripple effects
- [Every other file/method that must change as a consequence]
```

If the ripple scope is larger than the user expected, flag it before proceeding:

```
⚠️ This change has wider scope than the initial request.
In addition to [requested change], implementing this correctly also requires:
  - [ripple effect 1]
  - [ripple effect 2]

Proceed with full scope? [yes / no — or describe narrower scope]
```

---

## Phase 3 — Skill File Sync

Update the skill files to reflect the new behaviour **before writing any source code**.
The updated skill becomes the specification the implementation must match.

Files that commonly need updates:

| Changed | Update |
|---|---|
| A new endpoint added or removed | `SKILL.md` → API Endpoints table; `bdd-scenarios.md` → add scenario(s) for the new endpoint |
| A lifecycle step changed | `SKILL.md` → lifecycle section; `bdd-scenarios.md` → affected scenario |
| A business rule changed | `SKILL.md` → Core Business Rules (renumber if needed); `bdd-scenarios.md` → affected scenario |
| A new DB column or table | `domain-model.md` → Sequelize model section; `docs/schema/hGATE-portal.dbml` → affected table block |
| An aggregate field added/removed | `domain-model.md` → aggregate block; `bdd-scenarios.md` → any scenario that creates or reads this aggregate must assert the new field |
| A request/response field added/removed | `bdd-scenarios.md` → update `When` steps that supply the field and `Then` steps that assert what is stored or returned |
| An external API call moved or added | relevant `*-acl.md` |
| A port method added/removed | `domain-model.md` → port interface block |
| A business or architectural choice is concluded | `decisions.md` → add one Asked / Findings / Decision/Action entry |
| Goal 3 is selected | `properties.md` → add or update stable universal claims, generators/models, oracles, and bounds |
| Goal 3 is declined | `decisions.md` → record scoped decline and rationale; create no property artifact |

Scenario ID rules during enhancement:

- New scenarios receive a new repository-unique `@scenario:<ID>`.
- Unchanged behavior retains its existing ID, even when wording is clarified.
- A materially changed business outcome receives a new ID.
- Removed scenarios are deleted from the current specification; record the
  retired ID and replacement, if any, in `decisions.md`.
- Remove or update every test reference to a retired ID.
- Never renumber or reuse IDs to make the sequence look contiguous.

### Skill files are specs, not changelogs

Every skill file (`SKILL.md`, `domain-model.md`, `bdd-scenarios.md`, `*-acl.md`) describes the
BC's **current** behaviour. A future reader — human or AI — has no memory of what the design
used to be, and Phase 0 of this very skill treats these files as ground truth for "what the code
does now." Writing them as a diff against the old design corrupts that ground truth and teaches
the same bad habit forward into the next enhancement.

**Do not:**
- Narrate the transition: "previously X", "used to be Y", "no longer Z", "the old
  `denominations[]` shape", "before this change". If a reader needs that history, it's in
  `git log` and the PR description — do not duplicate it into a file that's supposed to be
  timeless.
- Write a scenario or rule whose entire content is an absence: "the response has no `currency`
  field", "there is no root-level `X`". An absence proves nothing about what to do — it's a
  leftover from diffing old-spec against new-spec in your head instead of describing the new
  spec on its own terms. If X is gone, delete every scenario about X and write scenarios only
  for what replaces it.
- Add a rule to a "Core Business Rules" list that only exists to announce a removal (e.g. "field
  Y was removed"). If the removal leaves behind a genuine current fact (e.g. "discount lives in
  `offers[].fees`"), write *that* fact as the rule — the removal is implied by its absence from
  the rest of the document and doesn't need its own line.

**Do:**
- State where the data/behaviour lives now, in positive terms, and stop there.
- Keep a negative statement only when the absence is itself a permanent, load-bearing invariant
  a reader would otherwise get wrong — e.g. "`product_activations.metadata` is an immutable
  snapshot, so rows approved under an older shape permanently lack `variants`/`offers`" is a
  standing architectural fact, not a diff note, because it stays true indefinitely and explains
  defensive code a reader might otherwise assume is dead.
- Apply this to source-code comments too, not just skill files — the same rot applies to a
  comment that says "X is no longer a flattened array" in the implementation.

**Litmus test:** could someone who has never seen the old design understand and act on this
sentence on its own? If it only makes sense by contrast to something that no longer exists,
rewrite it in terms of current behaviour only.

**Exception — this does not apply to test files.** A unit test asserting
`expect(x).not.toHaveProperty('y')` is a regression guard, not documentation; asserting an
absence there is normal test design.

If the skill files are already correct (the enhancement was driven by a skill update done
separately), state that explicitly:

```
Skill files: already up to date — this change implements the design already documented.
```

**Do not proceed to Phase 4 until skill files match the new design.**

Keep decisions local to this BC's `decisions.md`. If a decision affects multiple
BCs, create one standalone ADR under `docs/adr/` and link to it from each
affected BC. Do not use a global append-only decisions file.

---

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

Apply changes according to the approved plan.

### The editing rule

For every file you open to make a change:
1. Read the method(s) you plan to change and their immediate callers
2. After editing, grep for any identifiers you renamed or deleted to surface stale references:
   ```bash
   grep -rn "oldMethodName\|RenamedType" src/<bc-name>/
   ```
3. Fix any stale references in the same edit session — do not defer

### Execution order

Make changes in this order to avoid broken intermediate states:

1. **Domain ports** — add/remove port methods first so services compile against the correct interface
2. **Domain aggregates/entities** — update fields, enums, status transitions
3. **Application services** — update business logic; remove calls to deleted port methods; add calls to new ones
4. **Infrastructure repositories** — add/remove repository methods to match updated ports
5. **Infrastructure ACL adapters** — update if external API interaction changed
6. **Presentation controllers** — update to call updated service methods; remove calls to deleted methods
7. **DTOs** — add/remove/rename fields to match updated contracts
8. **Tests** — update existing tests first (remove assertions for old behaviour), then add new ones

### No orphan code rule

When you delete a method from a service, immediately check:
- Does any controller still call it? → delete or update the controller call
- Does it still appear in any test mock? → remove from mock

When you add a method to a service, immediately check:
- Does the port interface declare it? → add if missing
- Does at least one controller call it? → add call if missing
- Does the test file mock it? → add to mock

---

## Phase 6 — Ghost Behavior Sweep

After all changes are applied, perform an explicit sweep before reporting completion.

### 5a. Keyword grep for old patterns

For each old behaviour that was removed, grep for characteristic identifiers:

```bash
# Example: if the old flow called approveItem to create ProductActivations
grep -rn "createProductActivation\|ProductActivationRepository.*save\|product_activations.*INSERT" src/<bc-name>/

# Example: if an old method name was removed
grep -rn "oldMethodName" src/<bc-name>/
```

Document each grep command run and its result.

### 5b. Import audit

Check that no file still imports a class, method, or module that was deleted:

```bash
grep -rn "DeletedClassName\|removed-module" src/<bc-name>/
```

### 5b-2. Skill-doc changelog-language sweep

This is a **semantic** check ("does this sentence require knowledge of the old design to parse?"),
not a syntactic one — a keyword grep can only ever catch phrasings someone has already thought to
list. English has unbounded ways to write "this used to be different" ("was X before Y",
"formerly", "originally X, now Y", "superseded", "migrated from", "changed from X to Y", and any
future variant no one has hit yet). Treat the grep below as a fast pre-filter for the laziest,
most common phrasings — **finding 0 matches is not evidence the sweep is clean.**

```bash
grep -rniE "previously|no longer|used to|the old |was removed|there is no|has no |not present|no root-level|no top-level|was .+ before|formerly|superseded|migrated from" .github/skills/<bc-name>/ src/<bc-name>/
```

The check that actually matters: **re-read every line you added or changed** in the skill files
(and any code comments you wrote) against the litmus test from Phase 3 — could someone who never
saw the old design understand this sentence on its own? Do this as an explicit pass over the diff
(`git diff` the skill files), not from memory of what you think you wrote. Every hit — from the
grep or from the re-read — must be either fixed (rewritten as a positive, current-state statement)
or justified as a permanent architectural invariant (not a transitional migration note). Do not
report the sweep CLEAR on the strength of the grep alone. This check does not apply to
`*.spec.ts` files.

### 5c. Test file audit

Read every `*.spec.ts` file in the BC. Confirm:
- No test still mocks a method that no longer exists on the service
- No test asserts old behaviour (e.g., "should create ProductActivation on approve")
- Every new behaviour has at least one test covering it
- Every current scenario ID has at least one meaningful `[BDD:<scenario-id>]`
  test reference
- No test references a retired, unknown, or malformed scenario ID

### 5d. Sweep report

After updating tests, follow `tools/bdd-traceability/signoff-loop.md`.
The loop runs relevant Jest tests and the repository-wide verifier against a
clean candidate revision, presents module evidence to the human, records
requested changes, and repeats until explicit sign-off. Duplicate or malformed
scenario IDs, uncovered scenarios, unknown test references, failed Jest
evidence, discovery errors, and verifier failures block sign-off; do not replace
the command with a manual grep.

Keep the BC at `CHANGING` throughout the loop. Do not proceed to the close
report until one immutable artifact exists under
`docs/verification/bdd-signoffs/<bc-name>/` and the loop reaches `SIGNED_OFF`.

If Goal 3 was selected in Phase 2a.1, then follow
`tools/business-verification/signoff-loop.md` after BDD-to-TDD sign-off. Run the
property/model Jest suite and `npm run verify:properties` against a clean
candidate revision. Preserve reproducible, sanitized counterexamples and their
dispositions. Falsification requires changes; invalid or incomplete evidence is
blocked. Obtain separate human approval and create one immutable artifact under
`docs/verification/property-signoffs/<bc-name>/`.

If Goal 3 was declined, cite the BC-local decision entry in the close report.
Do not run a placeholder property check or create a skipped artifact.

Output a sweep report:

```
## Ghost Behavior Sweep

Grep commands run:
  grep -rn "..." → 0 results ✓
  grep -rn "..." → 0 results ✓

Import audit: ✓ / ✗ [list any remaining imports to fix]

Test audit:
  Files reviewed: [list]
  Removed stale mocks: [list]
  Removed stale assertions: [list]
  Retired scenario IDs removed from tests: [list]
  Current scenario IDs mapped to tests: [count/total]
  New tests covering new behaviour: [list]

Ghost behavior status: CLEAR ✓ / FOUND ✗
```

If the sweep finds ghost behavior, fix it before reporting the task complete. Do not
report CLEAR until a re-run of the grep confirms zero results.

---

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
