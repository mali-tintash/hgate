Reference for the "Phase 6 - Specification Conformance and Validation" section of `SKILL.md`. Loaded on demand; the section heading lives in `SKILL.md`.

#### 6a. Traceability verification

Update the traceability matrix with actual files and test names. Every item must
be classified:

| Status | Meaning |
|---|---|
| Implemented | Production behavior exists and meaningful tests pass |
| Blocked | Cannot be implemented because an approved dependency or decision is unavailable |
| Deferred | Explicitly excluded from the approved implementation |
| Missing | Required behavior has not been implemented |

Do not complete the task while any approved item is `Missing`.

#### 6b. Test audit

Read every test file created or changed for the BC and confirm:

- Happy paths and specified failures are covered
- Tests assert outcomes, not logs or implementation trivia
- Mocks represent port boundaries rather than bypassing business logic
- Integration tests exercise real mappings and constraints where required
- Every approved BDD scenario ID has meaningful executable coverage
- Every `[BDD:<scenario-id>]` test reference resolves to a current scenario
- No test claims coverage using a retired, unknown, or malformed scenario ID
- Tests are isolated and deterministic

#### 6c. Validation order

Run the smallest existing commands that prove the implementation:

1. Targeted tests for the BC
2. The BDD-to-TDD sign-off loop described below
3. Type checking or build
4. Targeted linting, if supported
5. Broader integration or full test suite only when needed by project policy or
   shared wiring changes

If the project has adopted hGATE but the traceability command is missing, stop
and install `tools/bdd-traceability/verify.mjs` and its package script rather
than replacing the deterministic check with manual review.

#### 6d. BDD-to-TDD human sign-off

Follow `tools/bdd-traceability/signoff-loop.md` for this BC before writing the
final conformance report.

The loop must:

- Run relevant Jest tests and the repository-wide verifier against a clean
  candidate revision
- Present module scenario evidence and all repository diagnostics to the human
- Keep the BC at `IMPLEMENTING` while changes are requested or the attempt is
  blocked
- Repeat test-first corrections until Jest passes and the verifier exits `0`
- Obtain explicit human sign-off; verifier success alone is not approval
- Create and commit one immutable artifact under
  `docs/verification/bdd-signoffs/<bc-name>/`

Do not proceed to close reporting until the loop reaches `SIGNED_OFF`.

#### 6e. Goal 3 business-logic verification when selected

After BDD-to-TDD reaches `SIGNED_OFF`, follow
`tools/business-verification/signoff-loop.md`.

The Goal 3 loop must:

- Run the configured property/model Jest suite and repository-wide
  `npm run verify:properties` command against a clean candidate revision
- Preserve seeds, replay paths, minimized synthetic counterexamples or model
  command sequences, and their dispositions
- Treat falsification, missing or unreproducible sensitivity evidence, and
  surviving recorded mutants as `CHANGES_REQUIRED`
- Treat excessive discards, non-replayable failures, timeouts, invalid bounds,
  state-limit exhaustion, or tooling failures as `BLOCKED`
- Present property inventory, generators/models, oracles with their sources and
  independence statements, bounds, observed partition statistics and discard
  ratios, and explicit limitations to the human,
  including the `property-discovery.md` candidate counts
  (ACCEPTED/REJECTED/DEFERRED) and any DEFERRED risks
  Also present sensitivity evidence (method, mutant/defect, failure observed).
- Obtain approval separate from BDD sign-off
- Create one immutable artifact under
  `docs/verification/property-signoffs/<bc-name>/`

Property-based success applies only to configured generated runs. Finite-model
success applies only to declared bounds. Do not report either as unbounded
proof.

If Goal 3 was declined, report the BC-local decision entry instead and do not
run or simulate this loop.

#### 6f. Final conformance report

```text
## Specification Conformance

Business rules: <implemented>/<total>
BDD scenario IDs: <covered>/<total>
Goal 3 properties: <covered>/<total> / DECLINED
Ports and adapters: <implemented>/<specified>
Migrations and constraints: <implemented>/<specified>

BC isolation: CLEAR | VIOLATIONS FOUND
Tests: PASS | FAIL
Build/type check: PASS | FAIL | NOT AVAILABLE

Missing approved behavior:
- None | [...]

Deferred items:
- None | [...]
```
