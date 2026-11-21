# ADR-009: Lifecycle Gate Evidence and a Git-Derived Status Report

**Status:** Accepted
**Date:** 2026-11-21
**Decision owners:** hGATE maintainers
**Reviewers:** Project contributors
**Review trigger/date:** Revisit when gap drift is promoted to a failing check,
when stable business-rule IDs are introduced, or when the projection schema
moves past version 2
**Plan:** `docs/plans/2026-11-21-lifecycle-tracking-and-status-board.md`

## Context

A tech lead or technical PM needs to see, without spending LLM tokens, the
current state of every BC: lifecycle, gates passed, blockers, open gaps, drift
and what changed at each lifecycle step. Today:

- The projection (ADR-008, procedural projection) carries only the current
  `lifecycle` value.
- Transition evidence in `status.md` is free text with no signer role, revision
  or link; only implementation has a structured, revision-bound sign-off
  (ADR-006).
- `bc-review` reports are not persisted, so `SPEC_REVIEWED` and `VERIFIED` have
  no evidence file.
- Gaps drift between `domain-map.md`, `context-map.md` and `status.md`, and
  `status.md` Open Items has no ID to join on.
- The browser viewer cannot run git, so any history-derived data must be
  precomputed.

## Decision

### 1. Lifecycle gates are a named catalog

`skills/hgate-guide/references/lifecycle-gates.md` holds the gate catalog as a
parseable Markdown table (`Gate ID | Transition | Kind | Required evidence |
Signer`). Each gate has a stable `GATE-*` ID and a kind:

| Kind | Meaning |
|---|---|
| `H` | Human approval by a named signer role |
| `D` | Deterministic tool result (exit code or in-sync check) |
| `R` | Record only (structured facts, no approval) |

Signer roles are `Tech lead`, `Technical PM` and `Product owner`. Every valid
transition in `lifecycle-status.md` maps to at least one gate;
`GATE-PROJ-SYNC` applies to every transition and `GATE-IMPL-PROPS` is optional.

### 2. `status.md` is the authority for gate evidence

Each BC's `status.md` gains a `## Gate Evidence` table
(`Transition | Gate | Kind | Result | Evidence | Signed by | Date`, Result one of
`PASS|FAIL|WAIVED|N/A`). The specialist skill that owns a transition writes the
gate rows before changing `lifecycle:`. A lifecycle value is valid only when the
required gates of the transition into it have satisfying rows. Open Items gains
an `ID` first column (shared gap IDs such as `G11`, or BC-local `OI-<n>`) so
gaps can be joined across files.

### 3. Projection schema version 2

`docs/hgate-project.json` moves to `schemaVersion: 2`. Per BC it adds
`transitions[]`, `gates[]`, `blockers[]`, `nextSkill`, `openItems[]`, `stats`
and `signoffs[]`; at top level it adds a merged `gaps[]` ledger joined by gap ID
with per-source dispositions, and `diagnostics[]` carrying drift warnings. The
viewer reads both version 1 and version 2 projections.

### 4. Two derived outputs

| Output | Built from | Committed | Checked |
|---|---|---|---|
| `docs/hgate-project.json` | Authoritative Markdown only | Yes | `project:check` (drift fails) |
| `.hgate/status.json` | Git history, working tree, verifier output and the projection | No (gitignored) | Generated, never drift-checked |

Git-derived data cannot live in the committed projection: the commit that
records a transition cannot contain its own hash (self-reference), and test or
coverage churn would make `project:check` fail on every code change. The viewer
requires the projection and treats the status report as optional.

### 5. Git derivation by blaming Transition History rows

`tools/project-status` runs `git blame` on each BC's `status.md` and assigns
every Transition History row to the commit that introduced it; that commit is
the transition's commit. No hashes are written by hand. Rows committed together
share one commit (their step-to-step diffs collapse into one). Rows not yet
committed are attributed to the working tree.

At each transition commit, at `HEAD` and in the working tree, the tool extracts
a semantic snapshot of the BC (scenario IDs and content hashes, business rules,
decision headings, domain-model sections, ports, ACLs, gates, open items) and
diffs consecutive snapshots into added / removed / modified items. Output is
ordered and timestamp-free, so the same repository state yields the same file.

### 6. Baselines (plan D1)

The status report emits, per BC:

- **Since last transition** (default view): last transition commit -> working
  tree, split into committed and uncommitted parts.
- **Since `HEAD~1`**: the latest commit's effect on the BC.
- **Uncommitted**: `HEAD` -> working tree.
- **Step-to-step**: each transition commit against the previous one, shown in
  the timeline.

### 7. Drift is a warning that cannot be missed (plan D3)

Gap drift (the same gap ID with differing dispositions across files) is a
non-failing warning: it never changes an exit code, but it is never silent. The
projection records it in `diagnostics[]`; `project:sync`, `project:check` and
`verify-spec` print every drift warning with file locations and a warning
count; the viewer shows a warning badge on the board and lists each item in the
diagnostics panel. Promoting drift to a failure requires revisiting this ADR.

### 8. Business-rule identity by content hash (plan D5)

Business rules are identified by a hash of their normalized text; the list
number is a display label only. Renumbering therefore shows as modified rather
than as removal plus addition. Stable `BR-<BC>-NNN` IDs remain in the backlog.

### 9. Persisted `bc-review` reports

`bc-review` persists every report at
`docs/verification/bc-reviews/<bc>/YYYY-MM-DD-<mode>.md` (`<mode>` is
`spec-only` or `full`). `GATE-SREV-REPORT` and `GATE-VER-REPORT` link that file.

## Alternatives Considered

- **Store git data in the committed projection.** Rejected: self-referential
  hashes and constant drift failures.
- **Commit the status report.** Rejected for the same self-reference reason.
- **Optional fields in schema version 1.** Rejected: hides a structural change
  from consumers; ADR-008 asked to revisit past version 1.
- **Fail `project:check` on gap drift.** Deferred: existing projects carry
  drift and would fail before they can migrate.
- **Walk `lifecycle:` frontmatter changes instead of blaming rows.** Rejected:
  misses transitions that return to the same value and cannot attribute
  several transitions recorded in one commit.

## Consequences

- CI that builds the status report needs full history (`fetch-depth: 0`);
  shallow clones get a clear message instead of a partial report.
- Squash merges collapse intermediate transitions into one commit; their
  step-to-step diffs are merged. This is a documented limitation.
- `.hgate/` is gitignored; each developer or CI job regenerates the report.
- Existing `status.md` files must migrate: add the `## Gate Evidence` table
  (backfilling at least the transition into the current lifecycle) and the
  Open Items `ID` column. `verify-spec` gate validation reports unmigrated
  files.
- Specialist skills write gate rows before advancing `lifecycle:`, which adds a
  small, fixed amount of bookkeeping to each close phase.
