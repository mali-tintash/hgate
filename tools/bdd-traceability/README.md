# BDD Traceability Verifier

This dependency-free Node.js CLI enforces hGATE's TypeScript/Jest traceability
contract in an adopting project:

- every Gherkin `Scenario` and `Scenario Outline` has one valid,
  repository-unique `@scenario:<ID>` tag
- every current scenario ID appears in at least one active Jest `it(...)` or
  `test(...)` title as `[BDD:<ID>]`
- Jest references do not point to missing scenarios

## Requirements

- Node.js 18 or later
- TypeScript tests named `*.spec.ts` or `*.test.ts`
- BDD specifications under `.github/skills/**/bdd-scenarios.md`

The verifier reads TypeScript source but does not compile or execute it.

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
`it.skip`, `test.skip`, or `test.todo` do not satisfy coverage. Unknown
references still fail when they occur in skipped or todo tests.

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
- `2`: arguments, input discovery, or file access failed

Text diagnostics and versioned JSON records are sorted deterministically.

## Self-test

```bash
node --test tools/bdd-traceability/tests/*.test.mjs
```
