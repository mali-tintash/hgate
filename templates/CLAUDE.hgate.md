# hGATE Project Instructions

## Spec-First Invariant

Specifications lead implementation. Source-code behavior must not diverge from
the owning BC's approved `SKILL.md`, `domain-model.md`, `bdd-scenarios.md`,
decisions, and ACL contracts.

Every BDD Scenario and Scenario Outline has a stable
`@scenario:<BC>-<CAPABILITY>-<NNN>` ID. Executable tests that protect the
scenario reference it as `[BDD:<scenario-id>]`. IDs are never renumbered or
reused. In TypeScript/Jest projects, run `npm run verify:bdd` before completing
implementation, enhancement, or full-review work; this deterministic gate must
pass in CI.

Before starting new work, reconcile any code changed outside an agent-governed
hGATE session. Do not silently treat manually changed code as the new
specification. The user must confirm whether each behavioral change is intended,
and the owning BC's specification must be synchronized before work continues.

## Mandatory Session Start Protocol

At the start of every session, before doing any project work, ask:

> Have there been any manual code changes made directly outside an agent session
> since the last synchronized hGATE session?

Ask this question even when the working tree appears clean. Manual changes may
already be committed.

### If the user says yes

1. Require the commit hash of the first commit containing manual changes.
2. If manual changes are uncommitted, stop and ask the user to commit them first.
   Do not inspect a partial moving diff as the synchronization baseline.
3. Show recent history to help identify the boundary:

   ```bash
   git log --oneline -10
   ```

4. Inspect the complete committed range:

   ```bash
   git diff <first-manual-commit>^..HEAD
   ```

5. Inventory every affected BC and classify each change using the shared
   checklist in `docs/change-classification.md` (Implementation-detail vs.
   Behavioral). When uncertain, classify as Behavioral.

6. For every possible behavioral change:

   - Explain the observed behavior difference with file and diff evidence.
   - Ask the user whether the behavior is intended.
   - Do not infer intent from the fact that the code was committed.

7. Reconcile each affected BC separately:

   - If the behavioral change is intended, use `bc-enhancement` for the owning
     BC to update its specification first, verify the implementation, update
     tests, and remove contradictory ghost behavior.
   - If the behavioral change is not intended, use `bc-enhancement` to restore
     implementation conformance with the approved specification.
   - If ownership or BC boundaries are unclear, stop and use
     `domain-exploration`.
   - If several BCs are affected, use one forked reconciliation session per BC.

8. Do not start unrelated new work until every behavioral change is reconciled
   or explicitly deferred with an owner and risk accepted by the user.
9. State that specification synchronization is complete and list:

   - Commit range inspected
   - Affected BCs
   - Implementation-only changes
   - Behavioral changes and user confirmations
   - Specification/test files synchronized
   - Explicitly deferred items

### If the user says no

1. Check for uncommitted changes:

   ```bash
   git status --short
   ```

2. If uncommitted changes exist, stop. Ask the user to commit them and answer the
   opening question again. Do not assume the changes came from an agent session.
3. Check for local commits not present on the branch upstream:

   ```bash
   git log @{upstream}..HEAD --oneline 2>/dev/null || echo "No upstream configured for this branch"
   ```

4. If the branch has no upstream, state that clearly and compare against the
   confirmed base branch instead:

   ```bash
   git log origin/<base-branch>..HEAD --oneline
   ```

5. If unpushed/local commits exist, show them and ask whether they were produced
   entirely by synchronized agent sessions.
6. If any commit includes manual work, return to the **user says yes** protocol
   and require the first manual commit hash.
7. Proceed only when:

   - The working tree is clean
   - Local commits have been classified
   - No unreviewed manual behavioral change remains

## Decision and Lifecycle Ownership

- BC decisions: `.github/skills/<bc-name>/decisions.md`
- BC lifecycle: `.github/skills/<bc-name>/status.md`
- Workflow-skill decisions: `decisions.md` beside that skill's `SKILL.md`
- Cross-cutting decisions: one ADR per decision under `docs/adr/`

Do not maintain a global append-only decisions file or mutable lifecycle table.

## Guided Workflow

Use `hgate-guide` when the correct workflow stage is unclear. It recommends one
next skill but does not invoke it or advance lifecycle automatically.

Run these in separate forked contexts:

- `domain-exploration`
- `architecture-decision-exploration`
- `bc-refinement`
- `bc-implementation`
- `bc-enhancement`
- `cross-bc-validation`

Keep each BC refinement, implementation, review, or enhancement session scoped
to one BC. Cross-BC validation may inspect several BCs but must not implement
fixes.
