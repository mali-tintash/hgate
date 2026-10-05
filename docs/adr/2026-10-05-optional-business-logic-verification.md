# ADR-005: Add Optional Property and Finite-Model Verification

**Status:** Accepted
**Date:** 2026-10-05
**Decision owners:** hGATE maintainers
**Reviewers:** Project contributors
**Review trigger/date:** Revisit when a concrete high-consequence invariant
requires an external solver or proof language

## Context

BDD scenarios and example-based Jest tests demonstrate selected business
journeys. Goal 1 provides deterministic scenario-to-test traceability, and Goal
2 adds explicit human review of that evidence. Neither establishes a universal
claim over generated inputs or all states in a bounded lifecycle.

hGATE needs an adoptable way to test universal business invariants while
preserving the semantic difference between examples and properties. External
SMT solvers and specification languages can prove statements about an encoded
model, but they do not automatically prove that a NestJS/Sequelize
implementation is equivalent to that model.

## Decision drivers

- Exercise real TypeScript business logic
- Keep BDD examples and universal claims independent
- Preserve minimized, reproducible counterexamples
- Make stronger verification explicit rather than ceremonial
- Support complete exploration when a state space is genuinely finite
- Avoid a second formal language and model/code correspondence burden in v1
- Keep human approval explicit and module-local

## Alternatives considered

### Require at least one property for every BC

Rejected because low-value properties create ceremonial coverage. Goal 3 must
be chosen for the current change by a human.

### Add SMT, TLA+, or Alloy in v1

Deferred. These tools can provide strong guarantees about their model and
assumptions, but hGATE would also need a credible refinement or equivalence
story connecting that model to production TypeScript. That cost is not
justified without a concrete high-consequence pilot.

### Use only property-based tests

Rejected because small lifecycle and policy models can sometimes be enumerated
completely, producing stronger bounded evidence than randomized generation.

### Add a separate optional verification layer

Selected because it preserves the existing BDD contract, exercises production
code, supports bounded exhaustive checks, and can be adopted incrementally.

## Decision

Goal 3 business-logic verification is optional for every adoption level.
`bc-implementation` and behavioral `bc-enhancement` ask the human whether to
enable it for the current BC change.

If declined, the owning BC records the scope and rationale in `decisions.md`.
No skipped-verification artifact is created.

If accepted:

1. The BC owns `.github/skills/<bc>/properties.md`.
2. Universal claims receive stable `@property:<ID>` identifiers.
3. Executable Jest tests reference those IDs as `[PROP:<ID>]`.
4. Generated property and stateful model tests use `fast-check` against real
   production code.
5. Pure finite models may use the supplied exhaustive explorer when states,
   commands, inputs, and depth are explicitly bounded.
6. `tools/business-verification/verify.mjs` enforces property declaration and
   test-reference coverage independently from BDD traceability.
7. Counterexamples preserve synthetic minimized input or command sequences,
   seeds, replay paths, and dispositions.
8. Goal 3 closes through a separate human sign-off under
   `docs/verification/property-signoffs/<module>/`.

## Architecture invariants

- A BDD scenario is an example; a property is a universal or bounded-universal
  claim. Their IDs, verifiers, reports, and approvals remain separate.
- Property-based success is not reported as mathematical proof.
- Finite-model completeness is claimed only within explicit recorded bounds.
- Invalid, flaky, non-replayable, timed-out, or incomplete evidence is blocked,
  not converted into a pass or falsification.
- A verifier pass proves static linkage, not generator, model, or oracle quality.
- Goal 3 approval is explicit and never inferred from BDD approval.
- Declining Goal 3 never weakens the existing BDD/TDD close gate.
- External solver support remains deferred until hGATE can address model/code
  correspondence for a concrete use case.

## Consequences

### Positive

- Downstream projects can discover broad implementation defects through
  generated data and command sequences.
- Small finite lifecycles can receive complete bounded exploration.
- Failures are reproducible and shrink into reviewable counterexamples.
- Teams adopt the stronger layer only where they judge it valuable.
- Existing Goal 1/2 users remain backward compatible.

### Negative and tradeoffs

- Opted-in projects add `fast-check` and property-specific Jest scripts.
- Authors must design meaningful generators, models, and oracles.
- A separate approval and artifact increase close-gate effort.
- Finite models can drift from production behavior and require human review.
- No unbounded proof is provided in v1.

## Validation

- The static verifier rejects malformed, duplicate, incomplete, uncovered, and
  orphaned property references.
- Property/model failures preserve reproducible counterexample evidence.
- Invalid evidence produces `BLOCKED`, never conformance.
- Sign-off artifacts identify the clean revision, commands, bounds, attempts,
  counterexamples, limitations, and explicit human decision.
- Workflow skills ask before enabling Goal 3 and persist a decline locally.
