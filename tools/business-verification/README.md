# Business-Logic Verification

This optional hGATE layer verifies universal business claims beyond
example-based BDD scenarios. It supports:

- property-based tests that exercise production TypeScript through Jest
- exhaustive finite-state exploration where the complete bounded state space is
  small enough to enumerate
- deterministic property-to-test traceability
- reproducible, minimized counterexamples
- a separate human sign-off from BDD-to-TDD approval

It does not provide unbounded mathematical proof. A property-based pass applies
to the configured generated runs. A finite-model pass applies only to the
states, commands, inputs, and depth named in the property's declared bounds.

## Opt in

`bc-implementation` and behavioral `bc-enhancement` must ask whether the human
wants business-logic verification for the current BC change.

- If declined, record the scope and rationale in the BC's `decisions.md`. Do
  not create `properties.md` or a sign-off artifact only to represent a skip.
- If accepted, create or update `.github/skills/<bc-name>/properties.md` from
  the reusable template and follow
  [`signoff-loop.md`](./signoff-loop.md) after BDD-to-TDD sign-off.

The decision applies to the named change scope. A later change asks again.

## Install

Copy this directory into the adopting TypeScript/Jest project:

```bash
mkdir -p tools
cp -R /path/to/hgate/tools/business-verification tools/
npm install --save-dev fast-check
```

Add project scripts. Keep the project's existing Jest configuration:

```json
{
  "scripts": {
    "verify:properties": "node tools/business-verification/verify.mjs --root .",
    "test:properties": "jest --runInBand test/verification"
  }
}
```

Only projects that have opted into Goal 3 need these scripts or `fast-check`.
Run both commands in CI once at least one current `properties.md` exists.

## Specification contract

Each opted-in BC owns:

```text
.github/skills/<bc-name>/properties.md
```

Start from
[`skills/bc-refinement/assets/properties-template.md`](../../skills/bc-refinement/assets/properties-template.md).
Every property uses one stable, repository-unique heading:

```markdown
## @property:CART-TOTAL-001 Cart totals remain non-negative
```

Every level-two (`##`) heading in `properties.md` is a property declaration.
Use level-three headings for supporting guidance or notes.

Required fields are:

- `Claim`
- `Quantification`
- `Preconditions`
- `Oracle`
- `Technique`
- `Generator`
- `Bounds`

`Technique` is exactly `PROPERTY` or `FINITE_MODEL`. Generated properties name a
generator contract and use `Bounds: N/A`. Finite models may use
`Generator: N/A`, but must state exact states, commands, input domains, and
depth bounds.

Properties specify universal or bounded-universal claims. Concrete journeys and
named examples remain in `bdd-scenarios.md`. Do not attach a property marker to
a BDD scenario or use a scenario ID as a property ID.

## Executable contract

Property tests use the adopting project's Jest runtime and reference the
property ID in a static title:

```typescript
it("[PROP:CART-TOTAL-001] keeps every valid cart total non-negative", () => {
  fc.assert(
    fc.property(validCartArbitrary, (cart) => {
      expect(calculateTotal(cart).isNegative()).toBe(false);
    }),
  );
});
```

Recommended project structure:

```text
test/verification/<bc-name>/
  generators/
    <concept>.generator.ts
  <capability>.property.spec.ts
  <lifecycle>.model.spec.ts
```

Generator rules:

- Generate valid domain values by construction.
- Keep invalid-input generators separate and label their expected rejection.
- Compose small value generators into aggregate generators.
- Avoid broad `filter` use; excessive discarded cases make evidence invalid.
- Generate synthetic values only. Never persist secrets, production identifiers,
  or personal data in counterexamples.
- Use `fast-check` seed and path replay rather than hardcoded random sources.

One Jest title may reference several property IDs and several tests may protect
one property. Comments, helpers, computed titles, `describe` titles,
`it.skip`, `test.skip`, and `test.todo` do not satisfy coverage.

## Stateful and finite-model checks

Use `fast-check` model-based commands when:

- correctness depends on command sequences
- the implementation state is too large or data-rich to enumerate
- shrinking a failing command sequence is valuable

Use [`finite-model-explorer.ts`](./finite-model-explorer.ts) only when the model
is pure, finite, and small enough to enumerate completely within declared
bounds. The model must describe business state and transitions, not copy the
production implementation line for line.

The explorer checks state invariants on every reached state and optional
transition invariants on every enabled command's before/after pair.

The explorer throws:

- `FiniteModelViolation` when an invariant is falsified, including the minimal
  breadth-first command path found
- `FiniteModelBlockedError` when the safety state limit prevents complete
  exploration

A depth bound is part of the claim. Never report an exhaustive result beyond
that bound.

## Traceability verifier

```bash
node tools/business-verification/verify.mjs --root .
```

Options:

```text
--root <path>           Project root (default: current directory)
--property-path <path> Property file or directory; repeatable
--test-path <path>     Jest test file or directory; repeatable
--exclude <name>       Directory name to exclude; repeatable
--format <text|json>   Report format (default: text)
--help                 Show help
```

The default specification root is `.github/skills`, and the default test root
is the repository. Explicit property paths scan Markdown files. Test discovery
accepts `*.spec.ts` and `*.test.ts`.

Exit codes:

- `0`: static property traceability is valid
- `1`: declaration or traceability violations were found
- `2`: arguments, discovery, file access, or verifier execution failed

Diagnostics:

| Code | Meaning |
|---|---|
| `PROP001` | Property heading has no stable ID |
| `PROP002` | Property heading has several IDs |
| `PROP003` | Property ID is malformed |
| `PROP004` | Required metadata, technique, generator, or bounds are invalid |
| `PROP005` | Property ID is duplicated |
| `PROP006` | Property has no active Jest reference |
| `PROP007` | Jest references an unknown property |
| `PROP008` | Jest property reference is malformed |
| `PROP009` | No property specification was discovered |
| `PROP010` | Verifier invocation or execution failed |

The verifier proves declaration and static linkage only. Jest execution proves
that the configured generated or finite checks passed. Human review decides
whether the property inventory, generators, model, oracle, and bounds are
meaningful.

## Counterexample contract

For every failed attempt preserve:

- property ID
- clean candidate revision
- exact command
- seed and shrink/replay path for generated checks
- minimized synthetic input, or minimized model command sequence
- expected invariant and observed outcome
- disposition: implementation defect, specification defect, generator/model
  defect, or unresolved

Do not commit raw Jest output or sensitive values. Sanitize and summarize the
counterexample in the final sign-off attempt history. When it exposes a distinct
business boundary, add a focused example regression test as well as retaining
the universal property.

## Self-test

```bash
node --test tools/business-verification/tests/*.test.mjs
```
