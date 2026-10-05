# BC Enhancement Decisions

## Cross-Cutting References

- [Localized decisions and lifecycle state](../../docs/adr/2026-08-07-localized-workflow-artifacts.md)
- [Session-start specification synchronization](../../docs/adr/2026-08-07-spec-first-session-synchronization.md)
- [BDD scenario-to-test traceability](../../docs/adr/2026-08-07-bdd-scenario-test-traceability.md)
- [BDD-to-TDD human sign-off loop](../../docs/adr/2026-10-05-bdd-tdd-human-signoff-loop.md)
- [Triviality gate for implementation-detail changes](../../docs/adr/2026-08-07-trivial-change-fast-path.md)
- [Optional business-logic verification](../../docs/adr/2026-10-05-optional-business-logic-verification.md)

## bc-enhancement covers iterative delivery, not only behavior changes

**Asked:** Does bc-enhancement apply when adding new capability to an already-built
BC as part of deliberate incremental delivery, or only when changing or fixing
existing behavior?

**Findings:** The full pipeline (spec-first, ghost-behavior sweep, consequence
interview) is as valuable for net-new additions as for replacements — the spec
must be updated before code is written, and the sweep confirms nothing
contradictory was left behind. The "Never partial-implement" rule only applies
to behavior replacements where old and new paths must not coexist; a
deliberately scoped thin slice of new capability is intentional incremental
delivery, not a partial implementation.

**Decision/Action:** bc-enhancement is the canonical skill for all post-initial-
implementation work: iterative new slices, changed rules, bug fixes, and gap
closure. The frontmatter, overview, and partial-implement rule were updated to
reflect this. The README workflow diagram and adoption guide were updated to
show bc-enhancement as the iterative loop rather than a bug/change-only path.
