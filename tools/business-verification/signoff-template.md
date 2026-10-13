---
schema_version: 1
module: <module-slug>
status: SIGNED_OFF
verified_revision: <git-sha>
verifier_schema_version: 1
signed_off_at: <ISO-8601 timestamp>
reviewer: <supplied identity or session identity>
---

# Business-Logic Verification Sign-Off - <module-name>

## Scope

- **Owning workflow:** `bc-implementation` | `bc-enhancement`
- **Property specification:** `.github/skills/<module-slug>/properties.md`
- **Change:** <short description>
- **Verified revision:** `<git-sha>`

This approval is separate from BDD-to-TDD sign-off. BDD examples and Goal 3
universal claims are independent evidence.

## Final Evidence

| Evidence | Command | Result |
|---|---|---|
| Property/model Jest suite | `<project property Jest command>` | PASS |
| Property traceability | `npm run --silent verify:properties -- --format json` | PASS (exit 0) |

Repository summary:

```text
<property files, test files, declarations, covered properties, techniques, references, errors>
```

## Module Property Evidence

| Property ID | Claim | Technique | Executable test(s) | Bounds / generated runs | Human assessment |
|---|---|---|---|---|---|
| `<ID>` | `<claim>` | `PROPERTY` / `FINITE_MODEL` | `<file:line - title>` | `<runs or exact finite bounds>` | Generator adequacy table above satisfied; model and oracle are adequate |

## Generator Adequacy Evidence

One block per `PROPERTY`; `FINITE_MODEL` properties record `N/A`.

| Property ID | Partition | Declared share | Observed share (statistics) | Boundary values hit | Required combinations hit |
|---|---|---|---|---|---|
| `<ID>` | `<label>` | `<n%>` | `<n%>` | `<yes/no per field>` | `<yes/no>` |

| Property ID | numRuns used / Min runs | Discard ratio / Max | Shrinking checked | Invalid-input generator | Counter command/output reference |
|---|---|---|---|---|---|
| `<ID>` | `<n / n>` | `<n% / n%>` | `<yes/no + note>` | `<name or N/A: reason>` | `<command and sanitized summary>` |

## Attempt History

| Attempt | Candidate revision | Jest | Verifier | Resulting state | Human feedback |
|---:|---|---|---|---|---|
| 1 | `<git-sha>` | PASS / FAIL / BLOCKED | exit 0 / 1 / 2 | `AWAITING_SIGN_OFF` / `CHANGES_REQUIRED` / `BLOCKED` | None / <requested change> |

## Counterexamples and Requested Changes

### Attempt 1

- **Property:** `<ID or N/A>`
- **Seed:** `<seed or N/A>`
- **Replay/shrink path:** `<path or N/A>`
- **Minimized synthetic input or command sequence:** `<sanitized value or N/A>`
- **Observed outcome:** `<outcome or N/A>`
- **Disposition:** `<implementation defect | specification defect | generator/model defect | unresolved | no counterexample>`
- **Regression evidence:** `<focused example test or N/A>`
- **Human response:** `<none, explicit approval, or faithful requested-change record>`

## Final Human Decision

**Decision:** SIGNED_OFF

**Evidence:** <explicit approval statement or concise faithful summary>

**Limitations acknowledged:** Generated property success applies to the recorded
runs and replay configuration. Finite-model success applies only to the exact
recorded model and bounds. Neither result is an unbounded proof or proof of an
external formal model's equivalence to production code.
