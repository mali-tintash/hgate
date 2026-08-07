# ADR-003: Link BDD Scenarios to Executable Tests with Stable IDs

**Status:** Accepted
**Date:** 2026-08-07
**Decision owners:** hGATE maintainers
**Reviewers:** Project contributors
**Review trigger/date:** Revisit if executable Gherkin becomes the default specification format

## Context

Markdown BDD scenarios are readable specifications but are not automatically
executable. Scenario text and tests can drift while both appear complete.
hGATE needs a framework-neutral way to prove that each approved scenario has
executable evidence and that tests do not reference removed behavior.

## Decision Drivers

- Preserve Markdown readability
- Support different test frameworks
- Provide bidirectional specification-to-test traceability
- Detect uncovered scenarios and orphaned test references
- Keep scenario identity stable through wording changes

## Alternatives Considered

### Rely on matching scenario and test descriptions

Rejected because natural-language matching is ambiguous and unstable.

### Require executable Gherkin for every project

Provides tighter coupling but imposes framework, tooling, step-definition, and
maintenance overhead that is not justified for every adoption level.

### Stable IDs referenced by tests

Provides low-cost, framework-neutral traceability while allowing optional
executable Gherkin for projects that need it.

## Decision

Every Gherkin `Scenario` and `Scenario Outline` in a BC specification receives a
repository-unique tag:

```gherkin
@scenario:CART-SUBMIT-001
Scenario: Submit a valid cart
```

Executable tests claiming coverage reference the same ID:

```typescript
it('[BDD:CART-SUBMIT-001] submits a valid cart', async () => {
  // ...
});
```

IDs use `<BC>-<CAPABILITY>-<three-digit-sequence>`, are never renumbered or
reused, and survive wording changes that preserve behavior. Materially changed
outcomes receive new IDs. Retired IDs are recorded in the owning BC's
`decisions.md` and removed from current tests.

## Architecture Invariants

- Every current scenario has exactly one stable ID.
- Every current scenario ID has at least one meaningful executable test.
- Every BDD test reference resolves to a current scenario ID.
- An ID marker alone is not proof that the test asserts the scenario outcome.
- Directly executable Gherkin remains optional.

## Consequences

### Positive

- Reviews can measure scenario coverage mechanically.
- Renamed scenarios retain traceability.
- Removed behavior leaves detectable orphaned test references.
- The convention works across testing frameworks.

### Negative and Tradeoffs

- Authors must assign and preserve IDs.
- Reviews must still assess test quality, not only marker presence.
- Full automated enforcement requires a repository-specific or shared checker.

## Validation

- Refinement rejects missing, duplicate, malformed, or reused IDs.
- Implementation includes IDs in its traceability matrix and tests.
- Enhancement preserves or explicitly retires IDs.
- Review reports uncovered scenarios and orphaned test references.
