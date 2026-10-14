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
  `bc-refinement/assets/properties-template.md`, and
  `.github/skills/<bc-name>/property-discovery.md` from
  `bc-refinement/assets/property-discovery-template.md`. Discovery is required:
  every approved business rule is evaluated against each property family and
  each candidate is recorded ACCEPTED/REJECTED/DEFERRED with a reason; `bc-review`
  checks the inventory. Use
  the reusable template and follow
  [`signoff-loop.md`](./signoff-loop.md) after BDD-to-TDD sign-off.

The decision applies to the named change scope. A later change asks again.

## Install

Copy this directory into the adopting TypeScript/Jest project:

```bash
mkdir -p tools
cp -R /path/to/hgate/tools/business-verification /path/to/hgate/tools/shared tools/
npm install --save-dev fast-check typescript
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

JSON report `schemaVersion` is `2`. `summary.propertyDeclarations` and
`summary.finiteModelDeclarations` count declarations by technique (they replaced
`propertyTests` and `finiteModelTests`, which overstated execution);
`summary.activeTestReferences` and `summary.inactiveTestReferences` count marker
references in Jest tests. These are marker counts, not proof of executed checks.

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
- `Oracle source`
- `Oracle independence`
- `Technique`
- `Generator`
- `Bounds`
- `Risk` (`LOW`, `MEDIUM`, or `HIGH`)
- `Sensitivity` (see [Sensitivity evidence](#sensitivity-evidence))

`PROPERTY` declarations also require the generator adequacy fields described
in [Generator adequacy contract](#generator-adequacy-contract).

`Technique` is exactly `PROPERTY` or `FINITE_MODEL`. Generated properties name a
generator contract and use `Bounds: N/A`. Finite models may use
`Generator: N/A`, but must state exact states, commands, input domains, and
depth bounds.

`Oracle source` is exactly one of `REFERENCE_CALCULATION`, `DOMAIN_EQUATION`,
`CONSERVATION`, `METAMORPHIC`, `ROUND_TRIP`, `TRUSTED_LIBRARY`,
`STATE_INVARIANT`, or `APPROVED_TABLE`. `Oracle independence` names the
independent source and why it shares no implementation path with the subject.
Subject and oracle must never use the same implementation path: circular
checks such as `expect(f(x)).toEqual(f(x))` and a reference that duplicates
the production algorithm line for line are prohibited.

Properties specify universal or bounded-universal claims. Concrete journeys and
named examples remain in `bdd-scenarios.md`. Do not attach a property marker to
a BDD scenario or use a scenario ID as a property ID.

## Reachability of the executing call

`PROP011` counts `fc.assert`/`hgateProperty`/`exploreFiniteModel`/
`hgateFiniteModel` only on a statically reachable path of the test body: not in
a constant-false branch, after `return`/`throw`, in a helper never called, or in
a callback that is not immediately invoked or passed to a known invoker (full
rules in the [BDD README](../bdd-traceability/README.md)).
This is static analysis and cannot prove the property is meaningful or that a
callback fires at runtime; the `Sensitivity` evidence below is the runtime
backstop.

## Sensitivity evidence

A passing property does not prove it can detect the defect it guards against.
Like TDD's "observe red first", each property needs a controlled negative check
whose observed failure is recorded. Cost is risk-tiered:

| Risk | Requirement |
|---|---|
| `LOW` | A method, or `Sensitivity: N/A` with a `Sensitivity-Waiver` reason |
| `MEDIUM` | At least one method |
| `HIGH` | At least one production-logic method; `ORACLE_VIOLATION` alone is insufficient |

`Sensitivity` is a comma-separated list of:

- `MUTATION` - mutation testing of production logic (Stryker for TypeScript/Jest
  is a recommended optional tool; hGATE does not require it)
- `KNOWN_BAD_FIXTURE` - a deliberately defective implementation the property rejects
- `INJECTED_DEFECT` - a temporary defect in production code observed failing,
  then reverted
- `ORACLE_VIOLATION` - a deliberately violating generated value the oracle rejects
- `REGRESSION_COUNTEREXAMPLE` - a counterexample from a prior defect, kept as a regression

`Sensitivity-Evidence` is `<mutant/defect>; <failure observed>`, for example
`Stryker mutant M12 removes the zero floor; CART-TOTAL-001 failed, seed 42`.
Add `- **Sensitivity-Waiver:**` only with `Sensitivity: N/A` on `LOW` risk.

The verifier checks only that declarations are present and well-formed:

| Code | Meaning |
|---|---|
| `PROP050` | `Risk` missing or not `LOW`/`MEDIUM`/`HIGH` |
| `PROP051` | `Sensitivity` missing |
| `PROP052` | Unknown `Sensitivity` method |
| `PROP053` | `N/A` without waiver, or `N/A` on `MEDIUM`/`HIGH` |
| `PROP054` | `Sensitivity-Evidence` missing or not `<defect>; <failure observed>` |
| `PROP055` | `HIGH` risk with `ORACLE_VIOLATION` only |

Whether the recorded failure was genuinely observed is a human-reviewed claim in
the sign-off artifact; the verifier cannot execute mutants. Reports include
`riskTiers`, `sensitivityEvidenced`, and `sensitivityWaived`.

## Executable contract

Property tests use the adopting project's Jest runtime and reference the
property ID in a static title:

```typescript
it("[PROP:CART-TOTAL-001] keeps every valid cart total non-negative", () => {
  hgateProperty(
    "CART-TOTAL-001",
    fc.property(validCartArbitrary, (cart) => {
      expect(calculateTotal(cart).isNegative()).toBe(false);
    }),
    { numRuns: 200 },
  );
});

it("[PROP:CART-STATE-001] submitted carts never reopen", () => {
  hgateFiniteModel("CART-STATE-001", cartLifecycleModel);
});
```

### Execution contract

A property reference counts as coverage only when the test body executes the
declared technique. The verifier statically requires, outside comments and
strings, a call to:

- `PROPERTY`: `hgateProperty(...)` or `fc.assert(...)`
- `FINITE_MODEL`: `hgateFiniteModel(...)` or `exploreFiniteModel(...)`

Empty callbacks, comment-only bodies, and calls of the wrong technique do not
count. [`hgate-property.ts`](./hgate-property.ts) ships the standard
`hgateProperty` and `hgateFiniteModel` wrappers. They run the check with an
explicit, replayable `seed` and `numRuns` and, when the
`HGATE_PROPERTY_EVIDENCE` environment variable names a file, append one JSON
line per passing run:

```json
{"id":"CART-TOTAL-001","technique":"PROPERTY","numRuns":200,"seed":1042}
{"id":"CART-STATE-001","technique":"FINITE_MODEL","statesVisited":3,"transitionsExplored":4,"maxDepthReached":4}
```

Static detection cannot prove the call is reachable (for example, it cannot
tell `if (false) { fc.assert(...) }` from a real run). Run the property Jest
suite with `HGATE_PROPERTY_EVIDENCE` set, then pass the file to the verifier
with `--evidence` so each covered property must have a runtime record
(`numRuns >= 1` and an integer `seed` for `PROPERTY`; `statesVisited >= 1` for
`FINITE_MODEL`). Delete the file before each run so evidence is not stale.

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
- Satisfy the [generator adequacy contract](#generator-adequacy-contract).
- Generate synthetic values only. Never persist secrets, production identifiers,
  or personal data in counterexamples.
- Use `fast-check` seed and path replay rather than hardcoded random sources.

One Jest title may reference several property IDs and several tests may protect
one property. Comments, helpers, computed titles, `describe` titles,
`it.skip`, `test.skip`, `test.todo`, `xit`, `xtest`, tests inside a skipped or
todo `describe` (`describe.skip`, `xdescribe`, `describe.skip.each`), and tests
whose body does not execute the declared technique do not satisfy coverage.
`.only`/`fit`/`fdescribe` fail with `PROP015` and do not count as coverage,
since Jest skips sibling tests while a focus is present. `--allow-focused`
(local iteration only, never CI) downgrades it to a warning that keeps coverage.

## Generator adequacy contract

A passing property is only as strong as the inputs it saw. A generator that
yields one currency, small quantities, one-item carts, and no boundaries can
pass vacuously. Every `PROPERTY` declaration therefore states:

| Field | Requirement |
|---|---|
| `Domain partitions` | `label:share% - why it matters`, `;`-separated; at least three, unique labels, shares sum to 100%. Partitions are business-relevant regions (currencies, cart sizes, denomination types, empty/boundary states), each with its reason. |
| `Boundary values` | `field=[a, b, ...]` for every constrained field, at least two values each: min, min+1, max, and the first invalid value where applicable. |
| `Cross-field combinations` | Combinations that must be reachable (for example `multi-currency x multi-item`), or `N/A: <reason>`. |
| `Min runs` | `numRuns` floor justified by risk and input complexity. Below 100 needs `Min runs rationale`. |
| `Max discard ratio` | Percent of preconditions-rejected cases. Above 20% needs `Max discard ratio rationale`; above 50% is rejected. |
| `Shrinking` | Which arbitraries are used and whether custom `map`/`chain`/`filter` limits minimization. |
| `Invalid-input generator` | Separate generator and expected rejection, or `N/A: <reason>`. |
| `Coverage evidence` | The `fc.statistics`, `classify`, or `cover`-style counters that report each partition. |

Counters must label each partition with the declared string literal, for
example `fc.statistics(arb, (cart) => (isMultiCurrency(cart) ? "multi-currency" : "single-currency"))`.
The sign-off records the observed share per partition, boundary hits, run count,
and discard ratio. A declared partition that is unobserved, or an observed
distribution far from the declared share, blocks sign-off.

Generator adequacy fields are not allowed on `FINITE_MODEL` declarations
(omit them or use `N/A`); a finite model's completeness is stated by `Bounds`.

The verifier statically checks only field shape, floors, partition-label
presence as string literals in the covering test file, and `numRuns` literals
below `Min runs`. It cannot judge whether partitions are the right ones or
whether observed statistics are realistic; that is human sign-off.

## Stateful and finite-model checks

Use `fast-check` model-based commands when:

- correctness depends on command sequences
- the implementation state is too large or data-rich to enumerate
- shrinking a failing command sequence is valuable

Use [`finite-model-explorer.ts`](./finite-model-explorer.ts) only when the model
is pure, finite, and small enough to enumerate completely within declared
bounds. The model must be derived from approved business rules and describe
business state and transitions; it must not copy the production implementation
line for line, or it shares the production bugs.

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
--evidence <path>      JSONL execution evidence from the hGATE wrappers
--allow-focused        Downgrade .only/fit/fdescribe from an error to a warning
                        (local iteration only; never in CI)
--format <text|json>   Report format (default: text)
--help                 Show help
```

The default specification root is `.github/skills`, and the default test root
is the repository. Explicit property paths scan Markdown files. Test discovery
accepts `*.spec.ts` and `*.test.ts`. Test files are parsed with the TypeScript
compiler API resolved from the adopting project's `typescript` package
(`--root`); if it is missing the verifier fails with `PROP010` and exit `2`.
The parser is shared with the BDD verifier in `tools/shared/`.

Exit codes:

- `0`: static property traceability (and evidence, when supplied) is valid
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
| `PROP011` | Property test body executes no property or finite model on a statically reachable path (the message says when the call exists but is unreachable) |
| `PROP012` | Property test body executes a different technique than declared |
| `PROP013` | `--evidence` supplied but a covered property lacks complete execution evidence |
| `PROP014` | Evidence file is unreadable or malformed |
| `PROP015` | Error: property test is focused with `.only`/`fit`/`fdescribe` (warning with `--allow-focused`) |
| `PROP030` | Generator adequacy fields missing or malformed |
| `PROP031` | Min runs below 100 or discard ratio above 20% without rationale |
| `PROP032` | Covering test file lacks a declared partition label string literal |
| `PROP033` | Covering test sets a `numRuns` literal below declared `Min runs` |
| `PROP040` | Oracle source is missing or not an allowed value |
| `PROP041` | Oracle independence is missing, a placeholder, too short, or admits a shared implementation path |

The verifier proves declaration, static linkage, and that a covering test body
calls the declared technique (plus recorded evidence when `--evidence` is
supplied). The JSON report is `schemaVersion: 2`: references carry
`executionKinds`, and `evidence` is `null` or `{ path, records }`. Jest
execution proves that the configured generated or finite checks passed.
`PROP040`/`PROP041` check only that an oracle source and a non-circular
independence statement are declared; they cannot inspect Jest bodies, so
whether the oracle is truly independent is a review and human-sign-off
question. Human review decides
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
