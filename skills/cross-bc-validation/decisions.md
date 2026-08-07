# Cross-BC Validation Decisions

## Cross-Cutting References

- [Localized decisions and lifecycle state](../../docs/adr/2026-08-07-localized-workflow-artifacts.md)

## Validate journeys without implementing across BCs

**Asked:** How should hGATE verify that a feature spanning several independently
implemented BCs works end to end?

**Findings:** Refinement, implementation, enhancement, and review correctly keep
one BC in scope. They do not prove that provider and consumer contracts, runtime
wiring, retries, and final business outcomes align across the whole journey.
Implementing fixes during a multi-BC validation would violate BC isolation.

**Decision/Action:** Use `cross-bc-validation` as a read-only, forked workflow
for one confirmed journey. Persist a feature-local report, classify every hop,
and route each defect to a separate owning-BC refinement or enhancement session.
