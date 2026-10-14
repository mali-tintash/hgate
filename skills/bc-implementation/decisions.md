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

- [Phase-granular skill loading](../../docs/adr/2026-10-14-phase-granular-skill-loading.md)
## Phase 1 consistency checks run by tool

- **Asked:** Should the agent hand-verify mechanical spec consistency (aggregate
  classes, event files, ACL docs, scenario tags, Ports table)?
- **Findings:** These are deterministic and cost many tokens as an LLM
  checklist. See [ADR-008](../../docs/adr/2026-10-14-deterministic-spec-verification.md).
- **Decision/Action:** Run `npm run verify:spec` (`tools/verify-spec`) and fix
  its failures; keep ambiguity, YAGNI, BC isolation, rule coverage and VO
  discipline as agent judgment. Fall back to manual checks only when the tool is
  not installed.
