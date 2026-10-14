Reference for the "Phase 2 - Build the Traceability Matrix" section of `SKILL.md`. Loaded on demand; the section heading lives in `SKILL.md`.

Map each approved behavior to executable evidence before writing tests:

```text
| ID | Spec source | Behavior | Test level | Planned test | Production components |
|----|-------------|----------|------------|--------------|-----------------------|
| R1 | SKILL rule 1 | [...] | Unit | [...] | Aggregate, service |
| CART-SUBMIT-001 | BDD scenario | [...] | Integration | [BDD:CART-SUBMIT-001] [...] | Controller -> repository |
```

Include:

- Every core business rule
- Every BDD scenario
- Every allowed and rejected state transition
- Every authorization branch
- Every external integration success and failure path
- Every concurrency or idempotency invariant

Use the smallest meaningful test level:

| Test level | Use for |
|---|---|
| Domain unit | Aggregate invariants, value objects, policies, transitions |
| Application unit | Use-case orchestration, port calls, exception branches |
| Repository integration | Queries, mappings, constraints, transactions, schema routing |
| ACL adapter unit/integration | Translation, authentication, retries, error mapping |
| Presentation unit | DTO mapping, service delegation, response shape |
| Acceptance/integration | Critical BDD journeys across the BC's public boundary |

Avoid duplicating the same assertion at every layer. Each test should protect the
layer's responsibility.

#### Optional Goal 3 decision and property matrix

Before planning source code, ask one focused question:

> Do you want Goal 3 business-logic verification for this BC implementation?

If declined:

1. Record the implementation scope and supplied rationale as a concluded
   **Asked -> Findings -> Decision/Action** entry in the BC's `decisions.md`.
2. Do not create a property sign-off artifact.
3. Continue with the existing BDD/TDD workflow.

If accepted, require an approved `.github/skills/<bc-name>/properties.md` and its
approved `property-discovery.md` candidate inventory. If either does not exist,
lacks a needed claim, or has `DEFERRED`/unresolved candidates relevant to this
scope, return to `bc-refinement`; do not invent property claims or skip the
discovery procedure inside implementation.

Build a separate property matrix:

```text
| Property ID | Candidate ID | Source rule(s) | Universal claim | Technique | Generator/model | Oracle | Oracle source / independence | Planned Jest test | Bounds | Risk | Sensitivity method |
|-------------|--------------|----------------|-----------------|-----------|-----------------|--------|------------------------------|-------------------|--------|------|--------------------|
```

Each `PROPERTY` row must also carry the declared generator adequacy fields
(partitions, boundaries, combinations, min runs, discard ratio, shrinking,
invalid-input generator, coverage counters); write the counters into the test
before the generator is considered done.

**Property red phase (sensitivity).** Passing is not enough: observe each
property fail against its defect before recording it green. Use the declared
method - mutation testing (Stryker is a recommended optional tool), a
known-bad fixture, a temporarily injected defect (revert it), a deliberately
violating value for the oracle, or a regression counterexample. Record the
mutant/defect and the failure observed in `Sensitivity-Evidence` as
`<defect>; <failure observed>`. A surviving mutant means strengthen the
generator or oracle, not accept the property. Risk tiers: `LOW` may waive,
`MEDIUM` needs a method, `HIGH` needs a production-logic method.

Keep it separate from the BDD scenario matrix. Use `PROPERTY` for generated
checks against production code and `FINITE_MODEL` only for explicitly bounded,
exhaustively enumerable models. A `[PROP:<ID>]` test must execute that technique
in its body via `hgateProperty`/`hgateFiniteModel`; empty tests are not coverage.

Implement each oracle from its declared `Oracle source`. Never use the same
implementation path as both subject and oracle, never write a "reference" that
duplicates the production algorithm line for line, and never copy production
transition logic into a finite model. If an independent oracle cannot be
built, return to `bc-refinement` rather than weakening the claim.

Use the scenario IDs already defined in `bdd-scenarios.md`; do not invent
implementation-local aliases such as `S1`. Every executable test that claims
scenario coverage must include `[BDD:<scenario-id>]` in its static Jest
`it(...)` or `test(...)` title:

```typescript
it('[BDD:CART-SUBMIT-001] submits a valid cart', async () => {
  // ...
});
```

One scenario may map to several tests and one integration test may reference
several scenario IDs, but every approved scenario ID needs at least one
meaningful executable test.
