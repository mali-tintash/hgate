# BC Review Report Templates

## Persisted Report Frontmatter

Every persisted report at
`docs/verification/bc-reviews/<bc-name>/YYYY-MM-DD-<spec-only|full>.md` starts
with:

```markdown
---
bc: <bc-name>
mode: spec-only | full
date: YYYY-MM-DD
reviewer: <Name> (Tech lead)
blocking_findings: <n>
outcome: PASS | FAIL
---
```

`reviewer` is the Tech lead who approved the report. `blocking_findings` and
`outcome` follow `SKILL.md` (Persisted Report and Gate Evidence). The body is the
Phase 1 report (`spec-only`) or the Phase 1 and Phase 2 reports (`full`).

## Phase 1 — Specification Findings

```markdown
## <BC Name> specification review

| ID | Severity | Lens | Finding | Documentation evidence | Consequence | Decision / open question |
|---|---|---|---|---|---|---|
| BC-01 | Critical | Authorization and tenant isolation | ... | `path:10-20` | ... | ... |

### Prioritized open questions
1. ...

### Contradictions
| Topic | Statement A | Statement B | Required resolution |
|---|---|---|---|

### Deferred items
| Owning BC | Item | Why deferred |
|---|---|---|

### Cohesion
Passed / concern, with one-sentence rationale.
```

## Phase 2 — Code Verification

```markdown
## <BC Name> implementation verification

| ID | Concern | Code status | Implementation evidence | Test evidence | Residual risk |
|---|---|---|---|---|---|
| BC-01 | ... | Missing | `src/...:10-20` | No meaningful test found | ... |

### Coverage summary
| Status | Count |
|---|---:|
| Covered | 0 |
| Partially covered | 0 |
| Missing | 0 |
| Not applicable / deferred | 0 |
| Cannot verify | 0 |

### Highest implementation priorities
1. ...

### Safeguards present in code but missing from documentation
| Safeguard | Code evidence | Documentation action |
|---|---|---|

### Deferred items
| Owning BC | Item | Why deferred |
|---|---|---|

No files were modified.
```

## Concise Combined Report

Use this form only when the user requests a single compact table:

```markdown
| ID | Concern | Specification finding | Code status | Evidence | Residual risk |
|---|---|---|---|---|---|
```
