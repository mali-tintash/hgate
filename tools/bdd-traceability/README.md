# BDD Traceability Verifier

This Node.js CLI has no dependencies of its own. It parses test files with the
TypeScript compiler API from the adopting project's own `typescript` package,
and enforces hGATE's TypeScript/Jest traceability contract:

- every Gherkin `Scenario` and `Scenario Outline` has one valid,
  repository-unique `@scenario:<ID>` tag
- every current scenario ID appears in at least one active Jest `it(...)` or
  `test(...)` title as `[BDD:<ID>]`
- Jest references do not point to missing scenarios

## Requirements

- Node.js 18 or later
- `typescript` installed in the adopting project (any TS/Jest project already
  has it); the verifier resolves it from `--root`. If it cannot be resolved the
  verifier prints `BDD009 verifier failure: the "typescript" package could not
  be resolved ...` and exits `2`.
- TypeScript tests named `*.spec.ts` or `*.test.ts`
- BDD specifications under `.github/skills/**/bdd-scenarios.md`

The verifier parses TypeScript source into an AST but does not compile,
type-check, or execute it. The shared parser lives in `tools/shared/`; copy it
with this directory (`cp -R tools/shared tools/bdd-traceability <project>/tools/`).

## Run

```bash
node tools/bdd-traceability/verify.mjs --root .
```

Recommended `package.json` script:

```json
{
  "scripts": {
    "verify:bdd": "node tools/bdd-traceability/verify.mjs --root ."
  }
}
```

Run `npm run verify:bdd` as a required CI gate before or alongside Jest.

## Human sign-off loop

The verifier is the deterministic engine for hGATE's BDD-to-TDD close gate. For
initial BC implementation and behavioral enhancement, follow
[`signoff-loop.md`](./signoff-loop.md) after the relevant Jest tests pass.

The loop runs this verifier repository-wide, presents module-specific evidence
to a human, records requested changes, and repeats until the verifier exits `0`
and the human explicitly signs off. Completed evidence is stored per module:

```text
docs/verification/bdd-signoffs/<module-slug>/
  YYYY-MM-DD-<change-slug>.md
```

Use [`signoff-template.md`](./signoff-template.md). A passing verifier proves
linkage and ID validity; it does not prove that the linked assertions
meaningfully protect the Given/When/Then outcome.

## Conventions

Scenario IDs use uppercase segments and a three-digit sequence:

```gherkin
@scenario:CART-SUBMIT-001
Scenario: Submit a valid cart
```

An active Jest test claims coverage in its static title:

```typescript
it('[BDD:CART-SUBMIT-001] submits a valid cart', async () => {
  // Assertions that prove the scenario outcome.
});
```

One test title may reference several IDs. Several tests may reference one ID.
Markers in comments, `describe` titles, helper variables, computed titles,
`it.skip`, `test.skip`, `test.todo`, `xit`, `xtest`, or inside a skipped or todo
`describe` (`describe.skip`, `xdescribe`, `describe.skip.each`, including
nested ones) do not satisfy coverage. Unknown references still fail when they
occur in inactive tests.

`.only`, `fit`, and `fdescribe` fail with `BDD010` (exit `1`) and do not count
as coverage: Jest silently skips every sibling test while a focus is present,
so a focused suite would otherwise report scenarios as covered that never ran.
Pass `--allow-focused` for local iteration only; the focus is then reported as
a non-failing `BDD010` warning and the test keeps counting. Do not use the flag
in CI or hooks.

An active `[BDD:ID]` test must also contain at least one assertion call in its
body: `expect(...)` (including `await expect(...).rejects...`), a supertest
`.expect(...)`, `assert(...)` / `assert.*`, or an `assert`-prefixed helper such
as `assertCartAccepted(...)`. `expect.assertions(...)` and
`expect.hasAssertions()` alone do not count. A test with an empty, comment-only,
non-asserting, or non-inline body (for example `it("...", sharedFn)`) emits
`BDD011` and does not provide coverage, so its scenario also reports `BDD005`
unless another asserting test covers it. The assertion must also be reachable
(see below) and non-tautological: `expect(true).toBe(true)`, `expect(x).toBe(x)`
or `expect(1).toBeTruthy()` (a literal checked against itself, identical pure
operands, or a truthiness matcher on a literal) can never fail and are ignored.
`BDD011` keeps one code; its message gives the reason (no assertion,
only tautological assertions, or statically unreachable assertions).
`.not`, `.resolves` and `.rejects` chains are never flagged as tautologies.
`expect.assertions(n)` is fine next to a real assertion but never enough alone.

Reachability rules (shared by `BDD011` and `PROP011`): a call counts only if it
is on a statically reachable path of the test body. These do **not** count:

- code in a constant-false branch (`if (false)`, `false && ...`, the `else` of
  `if (true)`, `while (false)`, `for (x of [])`) or after
  `return`/`throw`/`break`/`continue` (including after an `if/else` whose
  branches all exit);
- a function or arrow that is declared but never called;
- a nested callback that is not immediately invoked and not passed to a known
  invoker.

Known invokers (their callbacks are treated as run): immediately invoked
functions, `forEach`/`map`/`filter`/`some`/`every`/`find`/`findIndex`/
`findLast`/`findLastIndex`/`reduce`/`reduceRight`/`flatMap`, promise
`then`/`catch`/`finally`, `waitFor`, `act`, and `fc.property`/`fc.asyncProperty`/
`fc.assert`/`hgateProperty`/`hgateFiniteModel`/`exploreFiniteModel`. A helper
declared in the same file counts when it is called (or passed to one of those
invokers) from a reachable path, in which case its body is analysed too; awaited
helper calls are ordinary calls. Event handlers, `mockImplementation`, timers
and similar callbacks are assumed never to fire.

This remains static analysis. It proves linkage, non-emptiness and that an
assertion sits on a reachable path, not assertion quality: whether a callback
fires at runtime is undecidable in general, and an assertion can be reachable
yet weak (`expect(result).toBeDefined()`). Use the mutation/sensitivity evidence
in the property workflow (`Sensitivity`, `Sensitivity-Evidence`) as the runtime
backstop for important behaviour, and keep human review of the assertions.

## Options

```text
--root <path>           Project root (default: current directory)
--scenario-path <path> Scenario file or directory; repeatable
--test-path <path>     Jest test file or directory; repeatable
--exclude <name>       Directory name to exclude; repeatable
--allow-focused        Downgrade .only/fit/fdescribe from an error to a warning
                        (local iteration only; never in CI)
--format <text|json>   Report format (default: text)
--help                 Show help
```

Explicit scenario paths scan Markdown files. Explicit test paths still accept
only `*.spec.ts` and `*.test.ts`. Defaults exclude `.git`, `node_modules`,
`dist`, `build`, and `coverage`.

Exit codes:

- `0`: traceability is valid
- `1`: traceability violations were found
- `2`: arguments, input discovery, file access, or the `typescript` package
  failed (`BDD009`)

Text diagnostics and versioned JSON records are sorted deterministically.
The JSON report has an additive `warnings` array (non-failing diagnostics).

## Self-test

```bash
npm install   # provides the typescript dev dependency used by the test projects
node --test tools/bdd-traceability/tests/*.test.mjs
```
