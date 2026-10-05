# BDD-to-TDD Human Sign-Off Loop

This protocol closes hGATE implementation and behavioral-enhancement work for
TypeScript/Jest projects. It reuses the deterministic verifier in this
directory, presents its evidence to a human, records requested changes, and
repeats until the current repository satisfies the BDD traceability contract
and the human explicitly signs off.

The verifier proves static linkage. Human review must still decide whether each
referenced Jest test meaningfully asserts its scenario's Given/When/Then
outcome.

## Scope

Use this loop for one owning module. In hGATE projects, a Bounded Context is a
module and its slug is the BC directory name under `.github/skills/`.

The report is module-scoped, but the verifier must run repository-wide. A
module cannot be signed off while another module introduces a duplicate
scenario ID or any other repository-wide traceability violation.

This v1 protocol supports:

- BDD specifications in Markdown Gherkin fences
- TypeScript tests named `*.spec.ts` or `*.test.ts`
- Jest `it(...)` and `test(...)` titles

It does not perform formal verification, generate properties, or validate
business logic beyond the assertions a human reviews in the referenced Jest
tests.

## Persistent Artifact

After approval, create exactly one immutable record:

```text
docs/verification/bdd-signoffs/<module-slug>/
  YYYY-MM-DD-<change-slug>.md
```

Start from [signoff-template.md](./signoff-template.md). A change affecting
several BCs creates one record per affected BC. Each record may reference the
same repository-wide verifier result and candidate revision, but its scenario
evidence and human decision remain owned by that module.

Do not edit a signed-off artifact. A later verification creates a new file.

## Audit Binding

Sign-off applies to a clean candidate Git revision, not an uncommitted moving
worktree:

1. Commit the candidate specification, tests, and implementation.
2. Require `git status --short` to be empty.
3. Record `git rev-parse HEAD` as the verified revision.
4. Run Jest and the verifier against that revision.
5. After explicit approval, create and commit the sign-off artifact separately.

The sign-off artifact and BC lifecycle update may be newer than the verified
revision. Inspect every later changed path:

```bash
git diff --name-only <verified-revision>..HEAD
```

Sign-off artifacts and lifecycle-only `status.md` changes do not make the
evidence stale. Any change that can affect scenarios, test discovery or
execution, implementation behavior, verifier source, or verifier configuration
does. If relevance is uncertain, treat the evidence as stale and require a new
attempt.

If the project cannot provide a clean candidate revision, report that durable
revision binding is unavailable and do not claim auditable sign-off.

## State Machine

```text
OPEN
  -> VERIFYING
  -> CHANGES_REQUIRED       verifier exit 1
  -> BLOCKED                verifier exit 2 or invocation failure
  -> AWAITING_SIGN_OFF      verifier exit 0 and Jest evidence passes

AWAITING_SIGN_OFF
  -> CHANGES_REQUESTED      explicit human feedback
  -> SIGNED_OFF             explicit human approval

CHANGES_REQUIRED | CHANGES_REQUESTED | BLOCKED
  -> OPEN
  -> VERIFYING
```

`SIGNED_OFF` is terminal for one artifact. Keep the owning BC lifecycle at
`IMPLEMENTING` or `CHANGING` until this state is reached.

## Attempt Procedure

For each attempt:

1. Confirm the candidate revision is clean and record its SHA.
2. Run the smallest Jest command that executes every changed or referenced test.
   Use the adopting project's existing Jest command; do not invent a second
   test configuration.
3. Run the configured repository-wide verifier and preserve its exit status and
   JSON output:

   ```bash
   npm run --silent verify:bdd -- --format json
   ```

   Use the package script so project-specific `--scenario-path`,
   `--test-path`, and `--exclude` options remain active.
4. Build the human report from the JSON:
   - Candidate revision and commands
   - Repository summary and exact diagnostics
   - Module scenario IDs, specification locations, active Jest references, and
     Jest result
   - Human-review note that linkage is not proof of assertion quality
   - Attempt state and required next action
5. Preserve the attempt summary and any human feedback for the final artifact.

Any scenario, test, implementation, verifier source, verifier configuration, or
candidate-revision change invalidates the previous pass. Start a new attempt.

## Exit and Retry Behavior

| Result | State | Required action |
|---|---|---|
| Jest fails | `CHANGES_REQUIRED` | Continue red-green-refactor; do not run or offer sign-off as though tests passed |
| Verifier exit `0` | `AWAITING_SIGN_OFF` | Present the report and ask the human to sign off or request changes |
| Verifier exit `1` | `CHANGES_REQUIRED` | Apply the diagnostic remediation through the owning workflow, then commit and retry |
| Verifier exit `2` | `BLOCKED` | Correct discovery, paths, or input access; retry without inferring a conformance result |
| Invocation crash / `BDD009` | `BLOCKED` | Correct the tool or environment; retry without inferring a conformance result |

Sign-off is unavailable unless Jest evidence passes and the verifier exits `0`.

## Diagnostic Remediation

| Code | Action |
|---|---|
| `BDD001` | Add one stable, repository-unique scenario ID |
| `BDD002` | Retain exactly one scenario ID |
| `BDD003` | Replace the malformed ID and update its test references |
| `BDD004` | Preserve the rightful stable ID; assign a new unique ID to the conflicting scenario and update its tests |
| `BDD005` | Add or activate a meaningful static-title Jest test through red-green-refactor |
| `BDD006` | Correct a stale/incorrect test reference, or restore behavior only through an approved specification decision |
| `BDD007` | Correct the malformed or unclosed `[BDD:<ID>]` marker |
| `BDD008` | Correct scenario discovery or configured paths |
| `BDD009` | Treat the verifier failure as a blocked tooling attempt |

Behavior or specification changes return to the owning skill's spec-first phase.
Test-only gaps remain in its TDD loop. Never rewrite a specification merely to
make the verifier pass.

## Human Decision

For a passing attempt, present exactly two outcomes:

- **Sign off**: the human confirms that the module's referenced tests
  meaningfully protect the current scenarios.
- **Request changes**: record the feedback, keep the BC lifecycle unchanged,
  apply the changes through the owning workflow, and retry from a new clean
  candidate revision.

Silence, an ambiguous response, or approval of a different plan is not sign-off.
Record the reviewer identity only as supplied or available from the session; do
not infer it.

After sign-off:

1. Create the module-scoped artifact from the template.
2. Include every attempt and requested change from this loop.
3. Commit the artifact, and optionally the owning BC's lifecycle-only
   `status.md` update, without changing any other path in that commit.
4. Only then may the owning workflow close its BC lifecycle transition.

## Acceptance Criteria

```gherkin
Scenario: Present a passing candidate for human review
  Given a clean candidate revision with passing relevant Jest tests
  And every current scenario ID is unique and has an active Jest reference
  When the repository-wide verifier exits 0
  Then the workflow presents repository and module evidence
  And the state becomes AWAITING_SIGN_OFF
  And lifecycle completion waits for an explicit human decision

Scenario: Iterate after requested changes
  Given a passing attempt is awaiting sign-off
  When the human requests changes
  Then the feedback is preserved in the attempt history
  And the owning workflow applies specification-first and test-first rules
  And Jest and the verifier run again against a new clean candidate revision

Scenario: Block sign-off on traceability violations
  Given the verifier exits 1
  When the workflow presents its diagnostics
  Then each diagnostic includes its required remediation
  And sign-off is unavailable until a later attempt exits 0

Scenario: Distinguish discovery or tooling failure
  Given the verifier exits 2 or invocation fails
  When the attempt is recorded
  Then the state becomes BLOCKED
  And no conformance result or sign-off is inferred

Scenario: Persist explicit approval
  Given passing Jest and verifier evidence is awaiting sign-off
  When the human explicitly approves it
  Then an immutable module-scoped artifact records the verified revision
  And the artifact records every attempt and requested change
  And the owning BC may transition to IMPLEMENTED

Scenario: Invalidate stale evidence
  Given a module has a signed artifact
  When a later commit can affect scenarios, Jest evidence, implementation behavior, or verifier behavior
  Then the prior evidence is stale
  And a fresh Jest run, verifier run, report, and sign-off are required
```
