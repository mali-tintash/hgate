# BC Implementation Decisions

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
