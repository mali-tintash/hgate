# ADR-004: Close BDD-to-TDD Work with Human Sign-Off

**Status:** Accepted
**Date:** 2026-10-05
**Decision owners:** hGATE maintainers
**Reviewers:** Project contributors
**Review trigger/date:** Revisit when hGATE supports test frameworks beyond TypeScript/Jest

## Context

The BDD traceability verifier deterministically detects malformed or duplicate
scenario IDs, uncovered scenarios, and unknown Jest references. A passing
static linkage check does not prove that a referenced test meaningfully asserts
the scenario outcome, and an agent conversation alone does not leave durable
evidence that a human accepted the test evidence.

hGATE needs a closed loop that executes the verifier, presents actionable
evidence, records requested changes, repeats after test-first corrections, and
preserves explicit approval without introducing hidden orchestration.

## Scope and Non-Goals

### In Scope

- Downstream TypeScript/Jest projects
- Initial BC implementation and behavioral BC enhancement
- Repository-wide traceability verification
- Module-scoped, immutable human sign-off evidence

### Non-Goals

- Formal verification
- Property-based business-logic validation
- Automatic proof that assertions are semantically sufficient
- A global mutable verification dashboard
- Interactive CI prompts or hidden workflow hooks

## Decision Drivers

- Reuse the deterministic Goal 1 verifier
- Keep human approval explicit
- Preserve test-first correction behavior
- Bind approval to a stable candidate revision
- Keep evidence local to the owning module
- Avoid duplicated parser or orchestration logic

## Alternatives Considered

### Add a standalone sign-off specialist skill

Rejected for v1 because it creates lifecycle and handoff ambiguity while the
owning BC remains `IMPLEMENTING` or `CHANGING`.

### Add an interactive wrapper CLI or agent hook

Rejected because hooks and CI prompts cannot establish meaningful human review,
and hidden automation conflicts with hGATE's manual guided-workflow decision.

### Reuse the verifier through a shared close-gate protocol

Selected because existing implementation and enhancement workflows already own
the specification, TDD corrections, lifecycle, and completion decision.

## Decision

`bc-implementation` and the behavioral path of `bc-enhancement` must execute
the shared protocol at
`tools/bdd-traceability/signoff-loop.md` before transitioning a BC to
`IMPLEMENTED`.

The protocol:

1. Runs relevant Jest tests and the configured repository-wide
   `npm run verify:bdd` command against a clean candidate revision.
2. Converts versioned JSON diagnostics into an actionable human report.
3. Blocks sign-off on Jest failure, verifier violations, discovery failure, or
   verifier failure.
4. Records explicit requested changes and repeats from a new candidate revision.
5. Requires explicit human approval of a passing report.
6. Writes one immutable sign-off record per affected module under:

   ```text
   docs/verification/bdd-signoffs/<module-slug>/
     YYYY-MM-DD-<change-slug>.md
   ```

The verifier always runs repository-wide so global ID uniqueness remains
enforced. Each artifact contains the owning module's scenario/test evidence and
the repository-wide gate summary. Multi-BC work creates one artifact per
affected BC.

Sign-off binds to a clean candidate Git revision. A later commit may add the
artifact and update lifecycle-only `status.md` files. Later changes make the
artifact stale when they can affect scenarios, test discovery or execution,
implementation behavior, verifier source, or verifier configuration. Uncertain
relevance defaults to stale.

## State Transitions

```text
OPEN -> VERIFYING
VERIFYING -> CHANGES_REQUIRED | BLOCKED | AWAITING_SIGN_OFF
AWAITING_SIGN_OFF -> CHANGES_REQUESTED | SIGNED_OFF
CHANGES_REQUIRED | CHANGES_REQUESTED | BLOCKED -> OPEN
```

The owning BC remains `IMPLEMENTING` or `CHANGING` until `SIGNED_OFF`.

## Architecture Invariants

- Human sign-off is never inferred from verifier success.
- Verifier success is never inferred from a human decision.
- Sign-off is unavailable while Jest or repository-wide traceability fails.
- Any relevant change after a passing attempt requires a new attempt.
- A signed artifact is immutable; later verification creates a new artifact.
- Artifact ownership is module-local even though ID uniqueness is
  repository-wide.
- Static linkage does not replace human assessment of assertion quality.

## Consequences

### Positive

- BDD-to-TDD completion has an explicit, repeatable human gate.
- Requested changes remain inside the owning spec-first and test-first workflow.
- Auditors can identify the exact verified revision and evidence.
- Parallel BC work writes separate sign-off directories and files.

### Negative and Tradeoffs

- Strong audit binding requires a clean candidate commit before sign-off.
- The sign-off artifact normally requires a second commit.
- Human assessment remains necessary and can vary between reviewers.
- Repository-wide failures can block a module whose own IDs are valid.

## Validation

- Implementation and behavioral enhancement cannot close without `SIGNED_OFF`.
- The final artifact references a clean revision and records all attempts.
- The final verifier result has exit code `0`, zero diagnostics, unique current
  IDs, and active Jest references for every current scenario.
- Relevant changes after the recorded revision make the artifact stale.
