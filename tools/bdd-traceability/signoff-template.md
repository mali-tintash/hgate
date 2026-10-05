---
schema_version: 1
module: <module-slug>
status: SIGNED_OFF
verified_revision: <git-sha>
verifier_schema_version: 1
signed_off_at: <ISO-8601 timestamp>
reviewer: <supplied identity or session identity>
---

# BDD-to-TDD Sign-Off - <module-name>

## Scope

- **Owning workflow:** `bc-implementation` | `bc-enhancement`
- **Specification:** `.github/skills/<module-slug>/bdd-scenarios.md`
- **Change:** <short description>
- **Verified revision:** `<git-sha>`

## Final Evidence

| Evidence | Command | Result |
|---|---|---|
| Jest | `<project Jest command>` | PASS |
| Repository BDD traceability | `npm run --silent verify:bdd -- --format json` | PASS (exit 0) |

Repository summary:

```text
<scenario files, test files, scenarios, covered scenarios, references, errors>
```

## Module Scenario Evidence

| Scenario ID | Specification | Active Jest test(s) | Test result | Human assessment |
|---|---|---|---|---|
| `<ID>` | `<file:line>` | `<file:line - title>` | PASS | Meaningfully asserts Given/When/Then outcome |

## Attempt History

| Attempt | Candidate revision | Jest | Verifier | Resulting state | Human feedback |
|---:|---|---|---|---|---|
| 1 | `<git-sha>` | PASS / FAIL | exit 0 / 1 / 2 | `AWAITING_SIGN_OFF` / `CHANGES_REQUIRED` / `BLOCKED` | None / <requested change> |

## Attempt Diagnostics and Requested Changes

### Attempt 1

```text
<exact verifier diagnostics or BDD000 traceability valid>
```

**Human response:** <none, explicit approval, or faithful requested-change record>

## Final Human Decision

**Decision:** SIGNED_OFF

**Evidence:** <explicit approval statement or concise faithful summary>

**Limitations acknowledged:** The verifier proves static scenario-to-test
linkage and repository-wide ID validity. Human review, supported by the recorded
Jest result, assessed whether the linked tests meaningfully assert the specified
behavior.
