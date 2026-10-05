# Business-Logic Verification Human Sign-Off Loop

This optional protocol closes hGATE Goal 3 verification for one module after
the existing BDD-to-TDD sign-off has completed. It keeps universal properties
separate from example BDD scenarios, executes the adopting project's real Jest
tests, preserves counterexamples, and requires explicit human approval.

## Entry decision

During initial implementation and behavioral enhancement, ask:

> Do you want Goal 3 business-logic verification for this BC change?

If the human declines:

1. Record one concluded entry in the BC's `decisions.md` using
   **Asked -> Findings -> Decision/Action**.
2. Name the exact change scope and supplied rationale.
3. Do not create a skipped sign-off artifact.
4. Continue with the existing BDD-to-TDD gate.

If the human opts in, complete this protocol. The choice is scoped to the
current change and does not silently enable or disable later changes.

## Persistent artifact

After approval, create exactly one immutable record:

```text
docs/verification/property-signoffs/<module-slug>/
  YYYY-MM-DD-<change-slug>.md
```

Start from [signoff-template.md](./signoff-template.md). Multi-BC work creates
one record per affected BC. Never edit a signed artifact.

## Audit binding and staleness

Sign-off applies to a clean candidate Git revision:

1. Commit the property specification, generators/models, tests, implementation,
   and verifier configuration.
2. Require `git status --short` to be empty.
3. Record `git rev-parse HEAD`.
4. Run the property/model Jest command and verifier against that revision.
5. Create and commit the artifact separately after explicit approval.

Later sign-off artifacts and lifecycle-only `status.md` changes do not make the
evidence stale. Changes to property claims, generators, models, tests,
implementation behavior, the verifier, Jest configuration, run configuration,
or finite bounds do. Uncertain relevance defaults to stale.

## State machine

```text
OPEN
  -> VERIFYING
  -> CHANGES_REQUIRED       property/model falsification or verifier exit 1
  -> BLOCKED                invalid evidence or verifier exit 2
  -> AWAITING_SIGN_OFF      Jest and verifier pass

AWAITING_SIGN_OFF
  -> CHANGES_REQUESTED      explicit human feedback
  -> SIGNED_OFF             explicit human approval

CHANGES_REQUIRED | CHANGES_REQUESTED | BLOCKED
  -> OPEN
  -> VERIFYING
```

`SIGNED_OFF` is terminal for one artifact. This state is separate from the
existing BDD-to-TDD state machine.

## Attempt procedure

For each attempt:

1. Confirm the candidate revision is clean and record its SHA.
2. Run the configured property/model Jest command using the project's existing
   Jest configuration:

   ```bash
   npm run --silent test:properties
   ```

3. Run the repository-wide property verifier and preserve exit status and JSON:

   ```bash
   npm run --silent verify:properties -- --format json
   ```

4. Build the human report:
   - candidate revision and exact commands
   - repository verifier summary and diagnostics
   - module property claims, techniques, tests, generated-run configuration,
     and finite-model bounds
   - generator/model/oracle adequacy assessment
   - every sanitized counterexample and its disposition
   - explicit limitation of each evidence type
5. Preserve the attempt and feedback for the final artifact.

Any relevant change invalidates the attempt and requires a new clean candidate.

## Evidence classification

| Result | State | Required action |
|---|---|---|
| Generated property or stateful command falsifies a claim | `CHANGES_REQUIRED` | Preserve seed, replay path, minimized input/commands, and disposition; correct through spec-first and test-first workflow |
| Finite model finds an invariant violation | `CHANGES_REQUIRED` | Preserve the shortest breadth-first command path and state; correct through the owning workflow |
| Verifier exit `1` | `CHANGES_REQUIRED` | Fix declaration or traceability diagnostics |
| Verifier exit `0` and Jest passes | `AWAITING_SIGN_OFF` | Present evidence and ask for separate Goal 3 approval |
| Verifier exit `2` or `PROP010` | `BLOCKED` | Correct discovery, configuration, access, or tooling |
| Excessive generator discards, timeout, non-replayable failure, flaky result, invalid model/bounds, or finite-model state-limit exhaustion | `BLOCKED` | Repair evidence; do not infer a property failure or pass |

Sign-off is unavailable unless the verifier exits `0`, the property/model Jest
suite passes, every prior counterexample has a recorded disposition, and the
human separately approves Goal 3 evidence.

## Counterexample handling

Record:

- property ID and candidate revision
- exact command
- `fast-check` seed and shrink/replay path
- minimized synthetic input or stateful command sequence
- expected invariant and observed outcome
- disposition
- focused regression example, when the failure exposed a distinct boundary

Counterexamples must be synthetic and sanitized. Never persist production data,
secrets, tokens, credentials, personal data, or raw logs. The final sign-off
artifact preserves the summarized attempt history after the defect is fixed.

If replay does not reproduce the failure, classify the attempt `BLOCKED`; do not
discard the failure or call it a business-rule falsification.

## Human decision

For passing evidence present exactly two outcomes:

- **Sign off Goal 3**: the human accepts the property inventory,
  generators/models, oracles, bounds, limitations, and counterexample
  dispositions.
- **Request Goal 3 changes**: preserve feedback, return through the owning
  spec-first and test-first workflow, and retry from a clean revision.

BDD approval does not imply Goal 3 approval. Verifier or Jest success does not
imply human approval. Silence or ambiguous approval is not sign-off.

## Acceptance criteria

```gherkin
Scenario: Decline optional business-logic verification
  Given a BC change has approved BDD scope
  When the human declines Goal 3 verification
  Then the scope and rationale are recorded in the BC decisions
  And no property sign-off artifact is created
  And the BDD-to-TDD close gate remains unchanged

Scenario: Keep examples and universal claims distinct
  Given a BC has BDD scenarios and opted-in verification properties
  When traceability is checked
  Then scenario IDs resolve only through the BDD verifier
  And property IDs resolve only through the property verifier
  And neither evidence type substitutes for the other

Scenario: Falsify and replay a generated property
  Given an executable property references a current property ID
  When generated input falsifies the invariant
  Then the minimized counterexample, seed, and replay path are reported
  And the state becomes CHANGES_REQUIRED
  And sign-off waits for a passing clean candidate

Scenario: Exhaust a declared finite model
  Given a finite model declares explicit states, commands, inputs, and depth
  When every reachable transition within those bounds is explored
  Then the report claims completeness only within those bounds
  And it does not claim an unbounded proof

Scenario: Distinguish invalid evidence from falsification
  Given generation discards excessively, replay fails, execution times out, or tooling fails
  When the attempt is recorded
  Then the state becomes BLOCKED
  And no pass or business-rule failure is inferred

Scenario: Sign off Goal 3 separately
  Given property Jest evidence and static traceability pass on a clean revision
  When the human approves the Goal 3 evidence
  Then an immutable module-scoped property sign-off records the evidence
  And later relevant changes make the evidence stale
```
