# BC Implementation Decisions

## Cross-Cutting References

- [Localized decisions and lifecycle state](../../docs/adr/2026-08-07-localized-workflow-artifacts.md)
- [BDD scenario-to-test traceability](../../docs/adr/2026-08-07-bdd-scenario-test-traceability.md)
- [BDD-to-TDD human sign-off loop](../../docs/adr/2026-10-05-bdd-tdd-human-signoff-loop.md)
- [Optional business-logic verification](../../docs/adr/2026-10-05-optional-business-logic-verification.md)

## Separate initial implementation from enhancement

**Asked:** How should an approved BC specification be turned into its initial
source-code implementation?

**Findings:** `bc-refinement` intentionally produces specifications without
source code. `bc-enhancement` contains useful whole-BC implementation practices,
but it assumes existing behavior and focuses on ghost-behavior removal. Initial
implementation needs a separate readiness gate, specification traceability, and
genuine test-first execution.

**Decision/Action:** Use `bc-implementation` as a forked, one-BC workflow after
refinement. It blocks on unresolved specification gaps, requires explicit plan
approval, implements in red-green-refactor business slices, audits BC isolation
and wiring, and proves every approved rule and critical BDD scenario through a
final traceability report. Existing BC changes continue to use
`bc-enhancement`.
