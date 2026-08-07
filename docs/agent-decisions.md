# Agent Decisions

## Guided hGATE workflow and domain exploration

**Asked:** Should hGATE automate orchestration, and how should users discover
domains and bounded contexts before BC refinement?

**Findings:** Automatic orchestration would hide important business decisions.
The existing BC refinement and enhancement skills can define cross-BC ports and
events when each affected BC is handled in a separate context. A preceding
discovery step was missing.

**Decision/Action:** Keep workflow progression user-driven. Add the
`domain-exploration` skill as an interactive, confirmation-gated process for
understanding the problem, discovering capabilities, and identifying one or
multiple bounded contexts. Use `architecture-decision-exploration` only for
unresolved technical or cross-system architecture decisions.

## Initial BC implementation after refinement

**Asked:** How should an approved BC specification be turned into its initial
source-code implementation?

**Findings:** `bc-refinement` intentionally produces specifications without
source code. `bc-enhancement` contains useful whole-BC implementation practices,
but it assumes existing behavior and focuses on ghost-behavior removal. Initial
implementation needs a separate readiness gate, specification traceability, and
genuine test-first execution.

**Decision/Action:** Add `bc-implementation` as a forked, one-BC workflow used
after refinement. It blocks on unresolved specification gaps, requires explicit
plan approval, implements in red-green-refactor business slices, audits BC
isolation and wiring, and proves every approved rule and critical BDD scenario
through a final traceability report. Existing BC changes continue to use
`bc-enhancement`.
