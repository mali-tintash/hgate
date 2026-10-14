Reference for the "Phase 6 — Ghost Behavior Sweep" section of `SKILL.md`. Loaded on demand; the section heading lives in `SKILL.md`.

After all changes are applied, perform an explicit sweep before reporting completion.

### 5a. Keyword grep for old patterns

For each old behaviour that was removed, grep for characteristic identifiers:

```bash
# Example: if the old flow called approveItem to create ProductActivations
grep -rn "createProductActivation\|ProductActivationRepository.*save\|product_activations.*INSERT" src/<bc-name>/

# Example: if an old method name was removed
grep -rn "oldMethodName" src/<bc-name>/
```

Document each grep command run and its result.

### 5b. Import audit

Check that no file still imports a class, method, or module that was deleted:

```bash
grep -rn "DeletedClassName\|removed-module" src/<bc-name>/
```

### 5b-2. Skill-doc changelog-language sweep

This is a **semantic** check ("does this sentence require knowledge of the old design to parse?"),
not a syntactic one — a keyword grep can only ever catch phrasings someone has already thought to
list. English has unbounded ways to write "this used to be different" ("was X before Y",
"formerly", "originally X, now Y", "superseded", "migrated from", "changed from X to Y", and any
future variant no one has hit yet). Treat the grep below as a fast pre-filter for the laziest,
most common phrasings — **finding 0 matches is not evidence the sweep is clean.**

```bash
grep -rniE "previously|no longer|used to|the old |was removed|there is no|has no |not present|no root-level|no top-level|was .+ before|formerly|superseded|migrated from" .github/skills/<bc-name>/ src/<bc-name>/
```

The check that actually matters: **re-read every line you added or changed** in the skill files
(and any code comments you wrote) against the litmus test from Phase 3 — could someone who never
saw the old design understand this sentence on its own? Do this as an explicit pass over the diff
(`git diff` the skill files), not from memory of what you think you wrote. Every hit — from the
grep or from the re-read — must be either fixed (rewritten as a positive, current-state statement)
or justified as a permanent architectural invariant (not a transitional migration note). Do not
report the sweep CLEAR on the strength of the grep alone. This check does not apply to
`*.spec.ts` files.

### 5c. Test file audit

Read every `*.spec.ts` file in the BC. Confirm:
- No test still mocks a method that no longer exists on the service
- No test asserts old behaviour (e.g., "should create ProductActivation on approve")
- Every new behaviour has at least one test covering it
- Every current scenario ID has at least one meaningful `[BDD:<scenario-id>]`
  test reference
- No test references a retired, unknown, or malformed scenario ID

### 5d. Sweep report

After updating tests, follow `tools/bdd-traceability/signoff-loop.md`.
The loop runs relevant Jest tests and the repository-wide verifier against a
clean candidate revision, presents module evidence to the human, records
requested changes, and repeats until explicit sign-off. Duplicate or malformed
scenario IDs, uncovered scenarios, unknown test references, failed Jest
evidence, discovery errors, and verifier failures block sign-off; do not replace
the command with a manual grep.

Keep the BC at `CHANGING` throughout the loop. Do not proceed to the close
report until one immutable artifact exists under
`docs/verification/bdd-signoffs/<bc-name>/` and the loop reaches `SIGNED_OFF`.

If Goal 3 was selected in Phase 2a.1, then follow
`tools/business-verification/signoff-loop.md` after BDD-to-TDD sign-off. Run the
property/model Jest suite and `npm run verify:properties` against a clean
candidate revision. Preserve reproducible, sanitized counterexamples and their
dispositions and sensitivity evidence (method, mutant/defect, failure
observed). Falsification or missing sensitivity evidence requires changes; invalid or incomplete evidence is
blocked. Obtain separate human approval and create one immutable artifact under
`docs/verification/property-signoffs/<bc-name>/`.

If Goal 3 was declined, cite the BC-local decision entry in the close report.
Do not run a placeholder property check or create a skipped artifact.

Output a sweep report:

```
## Ghost Behavior Sweep

Grep commands run:
  grep -rn "..." → 0 results ✓
  grep -rn "..." → 0 results ✓

Import audit: ✓ / ✗ [list any remaining imports to fix]

Test audit:
  Files reviewed: [list]
  Removed stale mocks: [list]
  Removed stale assertions: [list]
  Retired scenario IDs removed from tests: [list]
  Current scenario IDs mapped to tests: [count/total]
  New tests covering new behaviour: [list]

Ghost behavior status: CLEAR ✓ / FOUND ✗
```

If the sweep finds ghost behavior, fix it before reporting the task complete. Do not
report CLEAR until a re-run of the grep confirms zero results.

---
