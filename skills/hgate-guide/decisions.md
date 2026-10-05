# hGATE Guide Decisions

## Cross-Cutting References

- [Localized decisions and lifecycle state](../../docs/adr/2026-08-07-localized-workflow-artifacts.md)
- [Session-start specification synchronization](../../docs/adr/2026-08-07-spec-first-session-synchronization.md)
- [BDD-to-TDD human sign-off loop](../../docs/adr/2026-10-05-bdd-tdd-human-signoff-loop.md)
- [Optional business-logic verification](../../docs/adr/2026-10-05-optional-business-logic-verification.md)

## Keep orchestration manual and guided

**Asked:** Should hGATE automatically orchestrate specialist skills or guide the
user through explicit workflow transitions?

**Findings:** Automated orchestration can hide business decisions, blur approval
gates, and make fork ownership unclear. Users still need a discoverable entry
point and concrete direction about which specialist skill applies.

**Decision/Action:** Use `hgate-guide` as a non-forked navigation skill. It
diagnoses lifecycle state and recommends exactly one next specialist skill, but
never invokes that skill or advances status automatically.
