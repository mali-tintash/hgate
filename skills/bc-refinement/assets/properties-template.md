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
- **Source rules:** <Approved rule refs from `SKILL.md`/`bdd-scenarios.md`.>
- **Candidate:** <`@candidate:<BC>-NNN` from `property-discovery.md`.>
- **Quantification:** <For every generated value or reachable state covered.>
- **Preconditions:** <Conditions that define valid inputs or starting states.>
- **Oracle:** <Observable outcome that decides whether the claim holds.>
- **Oracle source:** `<DOMAIN_EQUATION>`
- **Oracle independence:** <Name the independent source of the expected value and why it shares no implementation path with the subject under test.>
- **Technique:** `PROPERTY`
- **Generator:** <Named generator contract and the domain values it constructs.>
- **Bounds:** `N/A`

## @property:<BC>-<CAPABILITY>-002 <Bounded finite-state claim>

- **Claim:** <One invariant over the bounded lifecycle or policy model.>
- **Source rules:** <Approved rule refs from `SKILL.md`/`bdd-scenarios.md`.>
- **Candidate:** <`@candidate:<BC>-NNN` from `property-discovery.md`.>
- **Quantification:** <For every reachable state and enabled command.>
- **Preconditions:** <Initial states and command-enablement rules.>
- **Oracle:** <Invariant checked in every reachable state or transition.>
- **Oracle source:** `<STATE_INVARIANT>`
- **Oracle independence:** <Name the approved rule the model derives from and why the model does not copy production transition logic.>
- **Technique:** `FINITE_MODEL`
- **Generator:** `N/A`
- **Bounds:** <Exact states, commands, input domains, and maximum depth claimed complete.>

### Oracle sources

`Oracle source` is exactly one of:

| Source | Expected value or check comes from |
|---|---|
| `REFERENCE_CALCULATION` | A separately derived calculation (different formulation, not a transcription of the production algorithm) |
| `DOMAIN_EQUATION` | A stated business equation evaluated directly on generated inputs |
| `CONSERVATION` | A quantity that must be preserved (for example, sum of parts equals the total) |
| `METAMORPHIC` | A relation between outputs of related inputs (for example, order of items does not change the total) |
| `ROUND_TRIP` | An inverse operation that must recover the input |
| `TRUSTED_LIBRARY` | A trusted, independently maintained library, pinned and named |
| `STATE_INVARIANT` | An invariant over states or transitions taken from the approved lifecycle rules |
| `APPROVED_TABLE` | A previously human-approved business table or policy |

### Authoring rules

- Complete `property-discovery.md` (from
  `assets/property-discovery-template.md`) first; declare only properties
  whose candidate is `ACCEPTED` there. Every declaration cites its source
  rules and candidate.
- Declare `Oracle source` and `Oracle independence` for every property. The
  independence statement names the independent source and explains why the
  oracle shares no implementation path with the subject.
- The subject and the oracle must never use the same implementation path.
  `expect(f(x)).toEqual(f(x))` and a "reference" that duplicates the
  production algorithm line for line are circular and prohibited.
- A finite model derives from approved business rules, not from production
  code; it must not copy production logic line for line.
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
- Do not restate a named Given/When/Then example as a universal property.
