# ADR-007: Parse Jest Tests with the Adopter's TypeScript Compiler API

**Status:** Accepted
**Date:** 2026-10-13
**Decision owners:** hGATE maintainers
**Reviewers:** Project contributors
**Review trigger/date:** Revisit if hGATE must support non-TypeScript test
languages or adopters without a `typescript` package

## Context

The BDD traceability and property verifiers shared a hand-rolled character
scanner (`skipWhitespaceAndComments`, `skipBalanced`, `readStaticString`)
copy-pasted into both CLIs. Review reproduced two defects that no amount of
scanner patching can close, because the scanner has no grammar:

- a regex literal containing a quote (`const re = /'/;`) opened a phantom
  string and hid every later test, so valid coverage was reported as 0
- `describe.skip(...)`/`xdescribe` wrapped tests were counted as active, because
  only modifiers directly on `it`/`test` were inspected

## Decision

Both verifiers use one shared module, `tools/shared/ts-source.mjs`, built on
`ts.createSourceFile` from the TypeScript compiler API. It walks call
expressions, resolves `it`/`test`/`describe` callee chains (`skip`, `todo`,
`only`, `each`, `x*`, `f*`), and returns each test with static title, line,
active/focused state inherited from enclosing describes, and the calls in its
body.

`typescript` is resolved with `createRequire` from the adopting project root
(`--root`). hGATE does not bundle it. If it cannot be resolved the verifier
fails with the existing verifier-failure code (`BDD009` / `PROP010`), a message
naming the fix, and exit code `2`. hGATE's own repository declares `typescript`
as a devDependency solely for its tests and CI.

A test counts as active only when neither it nor any ancestor describe is
`skip`, `todo`, `xit`, `xtest`, or `xdescribe`. `.only`/`fit`/`fdescribe` still
count as active but emit a non-failing `BDD010`/`PROP015` warning, because Jest
silently skips sibling tests while a focus exists.

## Consequences

- The tools are no longer dependency-free; adopters already using TypeScript/Jest
  satisfy the requirement with no new install.
- Parsing is correct for regex, template literals, comments, and nesting.
- The verifiers still do not compile, type-check, or run the tests.
- Diagnostic codes and deterministic text/JSON output are preserved; the JSON
  report gains an additive `warnings` array.
- Adopters must copy `tools/shared/` next to the verifier directory.
