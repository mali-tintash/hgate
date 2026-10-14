Reference for the "Phase 2 — Code Verification" section of `SKILL.md`. Loaded on demand; the section heading lives in `SKILL.md`.

### 2.1 Build a verification checklist

Turn every Phase 1 finding into one verification item. Preserve its identifier and wording so the
documentation and implementation reports remain traceable.

For `code-verification` mode, use the findings supplied by the user. If citations or intended
behavior are missing, read the target BC documentation before inspecting code.

### 2.2 Trace only relevant implementation

Inspect:

1. `src/<bc-name>/**`
2. Migrations and models used by the BC
3. Tests for the BC
4. Only direct dependency paths needed to verify a finding

Trace continuous runtime paths end to end:

```text
controller/consumer
  -> guard/interceptor
  -> application service
  -> repository or outbound port
  -> adapter/external dependency
  -> persistence/migration
```

Do not perform a general review of adjacent BC code. Stop at the point where enough evidence
exists to classify the target finding.

For a large BC, a read-only code-review or code-explorer subagent may own Phase 2. Give it the
complete Phase 1 findings and prohibit edits and style feedback.

### 2.3 Inspect tests as separate evidence

For each finding, determine:

- Is the safeguard implemented?
- Is it enforced at application, database, or external-adapter level?
- Is the failure branch tested?
- Are concurrency and retry semantics genuinely exercised or merely mocked?
- Does a DTO test bypass the actual validation pipeline?

Build a bidirectional scenario traceability map:

```text
| Scenario ID | Scenario | Executable tests | Test level | Coverage assessment |
|---|---|---|---|---|
```

Report:

- Scenario IDs with no meaningful executable test
- `[BDD:<scenario-id>]` test references with no current scenario
- Duplicate or malformed IDs
- Tests carrying an ID but asserting a different outcome
- Scenarios covered only by mocks that bypass the relevant runtime boundary

Absence of a test does not prove absence of behavior. Presence of a test does not eliminate
uncovered races or integration failures.

Run `npm run verify:bdd` and include its deterministic diagnostics as evidence.
Any duplicate or malformed scenario ID, uncovered scenario, or unknown test
reference is at least a specification-conformance finding. Continue reviewing
whether each referenced test meaningfully asserts the scenario outcome; the
tool proves linkage, not assertion quality.

When `properties.md` exists, also run `npm run verify:properties` and the
project's configured property/model Jest suite with `HGATE_PROPERTY_EVIDENCE`
set, passing the file to the verifier via `--evidence`. Build a separate property
traceability map:

```text
| Property ID | Universal claim | Technique | Executable tests | Generator/model and bounds | Risk / sensitivity method | Coverage assessment |
```

Compare sign-off observed partition statistics with declared shares; treat an
unobserved partition or vacuous distribution as a coverage gap.

Classify generated-run success and bounded finite-model completeness exactly as
declared. Inspect the newest artifact under
`docs/verification/property-signoffs/<bc-name>/`. A missing or stale artifact
for a scope that explicitly opted into Goal 3 is workflow-evidence debt; a BC
that never opted in has no Goal 3 defect. Property evidence never substitutes
for scenario evidence, and scenario evidence never substitutes for property
evidence.

Inspect the newest artifact under
`docs/verification/bdd-signoffs/<bc-name>/`, if present. Treat it as human
review evidence only when:

- Its status is `SIGNED_OFF`
- Its module matches the target BC
- Its verified revision exists
- No later change affects scenarios, test discovery or execution,
  implementation behavior, verifier source, or verifier configuration

A missing or stale artifact is a workflow-evidence finding, not proof that the
implementation behavior is missing. A current artifact does not replace this
review's independent assessment of test quality.

### 2.4 Classification

Classify every finding exactly once:

| Status | Definition |
|---|---|
| **Covered** | Implementation enforces the complete requirement and meaningful tests protect it |
| **Partially covered** | A safeguard exists, but one or more material paths or guarantees remain |
| **Missing** | No effective implementation addresses the concern |
| **Not applicable / deferred** | The capability is explicitly unsupported or owned elsewhere, and current behavior matches that decision |
| **Cannot verify** | Required source, contract, generated code, or environment behavior is unavailable |

Do not classify a concern as Covered merely because:

- Authentication exists but resource ownership is unchecked
- A unique constraint exists but its conflict is not recovered
- Downstream idempotency exists but request retries generate new downstream keys
- A timeout exists but unknown outcomes can duplicate side effects
- Logs exist but lack correlation, audit semantics, or redaction
- Happy-path tests exist

### 2.5 Find undocumented safeguards

After verifying findings, make one focused pass for material safeguards present in code but absent
or understated in the target BC documentation, including:

- Database uniqueness or locking
- Retry and token-refresh behavior
- Idempotency guarantees
- Sensitive-field stripping
- Error translation
- Persistence recovery

List only safeguards relevant to the reviewed findings.

### Phase 2 output

Use the Phase 2 table from [report-template.md](./report-template.md).

Each row must contain:

- Original concern
- Code status
- Implementation evidence with exact line ranges
- Test evidence, or explicitly “No meaningful test found”
- Residual risk

Include a scenario traceability summary:

- Current scenario IDs
- IDs with meaningful executable coverage
- Uncovered IDs
- Unknown or retired IDs referenced by tests
- Current, stale, or missing BDD-to-TDD sign-off evidence
- When Goal 3 exists: current property IDs, executable coverage, honest bounds,
  counterexample dispositions, and current/stale/missing property sign-off

Finish with:

1. Counts by status
2. Top three to five implementation priorities
3. Safeguards present in code but missing from documentation
4. Deferred cross-BC items
5. Explicit statement that no specification, source, migration, or test files
   were modified

### Lifecycle status update

After the full final report, use `IMPLEMENTED -> VERIFIED` only when all
material requirements are covered, no unresolved Critical or High finding
remains, and the target BC has current `SIGNED_OFF` BDD-to-TDD evidence;
otherwise use `IMPLEMENTED -> BLOCKED`.

Update only `.github/skills/<bc-name>/status.md` as authoritative content.
Record report evidence, blockers, recommended next skill, and transition
history. Then run `npm run project:sync` followed by `npm run project:check`.
Do not edit `docs/hgate-project.json` by hand; the generator preserves stable
IDs, ordering, and schema validity.
