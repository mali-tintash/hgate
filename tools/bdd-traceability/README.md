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

`.only`, `fit`, and `fdescribe` still count as active coverage, because the
test does run, but each focused reference emits a non-failing `BDD010`
warning (report `warnings`, exit code unchanged): Jest silently skips every
sibling test while a focus is present. Treat the warning as a cue to remove
the focus before merging.

## Options

```text
--root <path>           Project root (default: current directory)
--scenario-path <path> Scenario file or directory; repeatable
--test-path <path>     Jest test file or directory; repeatable
--exclude <name>       Directory name to exclude; repeatable
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
