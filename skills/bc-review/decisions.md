# BC Review Decisions

## Cross-Cutting References

- [Localized decisions and lifecycle state](../../docs/adr/2026-08-07-localized-workflow-artifacts.md)
- [BDD scenario-to-test traceability](../../docs/adr/2026-08-07-bdd-scenario-test-traceability.md)
- [BDD-to-TDD human sign-off loop](../../docs/adr/2026-10-05-bdd-tdd-human-signoff-loop.md)
- [Optional business-logic verification](../../docs/adr/2026-10-05-optional-business-logic-verification.md)

- [Phase-granular skill loading](../../docs/adr/2026-10-14-phase-granular-skill-loading.md)
## Generate the project projection procedurally

- **Asked:** Should this skill hand-sync `docs/hgate-project.json`?
- **Findings:** The sync is mechanical and costs LLM tokens; see
  [ADR-008](../../docs/adr/2026-10-14-procedural-project-projection.md).
- **Decision/Action:** Run `npm run project:sync` (and `project:check` for
  drift) instead of editing the JSON by hand.
