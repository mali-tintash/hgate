# <BC Name> Verification Properties

Use this optional specification only after the human opts into hGATE Goal 3
business-logic verification for the BC change. Concrete examples remain in
`bdd-scenarios.md`; this file contains universal or explicitly bounded-universal
claims.

Each `##` heading is one property declaration and must use a stable,
repository-unique ID:

```text
@property:<BC>-<CAPABILITY>-<three-digit-sequence>
```

## @property:<BC>-<CAPABILITY>-001 <Universal business claim>

- **Claim:** <One falsifiable invariant stated in domain language.>
- **Quantification:** <For every generated value or reachable state covered.>
- **Preconditions:** <Conditions that define valid inputs or starting states.>
- **Oracle:** <Observable outcome that decides whether the claim holds.>
- **Technique:** `PROPERTY`
- **Generator:** <Named generator contract and the domain values it constructs.>
- **Bounds:** `N/A`
- **Risk:** `MEDIUM`
- **Sensitivity:** `MUTATION`
- **Sensitivity-Evidence:** <mutant or defect id and what it changes>; <failing test/seed/message observed>

## @property:<BC>-<CAPABILITY>-002 <Bounded finite-state claim>

- **Claim:** <One invariant over the bounded lifecycle or policy model.>
- **Quantification:** <For every reachable state and enabled command.>
- **Preconditions:** <Initial states and command-enablement rules.>
- **Oracle:** <Invariant checked in every reachable state or transition.>
- **Technique:** `FINITE_MODEL`
- **Generator:** `N/A`
- **Bounds:** <Exact states, commands, input domains, and maximum depth claimed complete.>
- **Risk:** `LOW`
- **Sensitivity:** `N/A`
- **Sensitivity-Waiver:** <Why a controlled negative check is not worth its cost (LOW risk only).>

### Authoring rules

- Use `PROPERTY` for generated examples against real production domain or
  application code.
- Use `FINITE_MODEL` only for a pure, genuinely finite model that can be
  exhaustively explored within the declared bounds.
- Keep property IDs after wording clarifications that preserve the claim.
- Give a materially different claim a new ID and retire the old ID in the BC's
  `decisions.md`.
- Generate valid values by construction; document invalid-input properties
  separately.
- Never use production data, credentials, tokens, or personal information in a
  generator or persisted counterexample.
- Assign `Risk` (`LOW`, `MEDIUM`, `HIGH`) by business consequence of an
  undetected defect. Every property needs sensitivity evidence: a controlled
  negative check showing the property fails when its defect is present.
  `Sensitivity` is a comma-separated list of `MUTATION`, `KNOWN_BAD_FIXTURE`,
  `INJECTED_DEFECT`, `ORACLE_VIOLATION`, or `REGRESSION_COUNTEREXAMPLE`.
  `LOW` may use `N/A` with a `Sensitivity-Waiver`; `MEDIUM` and `HIGH` need a
  method; `HIGH` needs a production-logic method, not `ORACLE_VIOLATION` alone.
  `Sensitivity-Evidence` is `<mutant/defect>; <failure observed>`.
- Do not restate a named Given/When/Then example as a universal property.
