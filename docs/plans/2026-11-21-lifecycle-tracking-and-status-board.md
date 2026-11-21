# Plan: Lifecycle Tracking, Gate Evidence and Status Board

**Status:** DRAFT — awaiting decisions D1–D6 before execution
**Branch:** `enhanced-reviewability`
**Date:** 2026-11-21
**Scope:** Track A (project lifecycle data into the projection + status board) and
Track B (deterministic, git-derived "what changed" per BC), starting from:

1. Decide which gates exist, what evidence each needs and who signs it; store it
   as structured data in `status.md`.
2. Extend the projection and add a status board in the viewer.

**Goal ("review" in this plan):** a tech lead or technical PM opens the local
viewer and sees the current state of every BC — lifecycle, gates passed,
blockers, open gaps, drift, artifact size — and what changed at each lifecycle
step and since the last one. No LLM tokens are spent producing any of it.

---

## 1. Findings this plan responds to

| # | Finding | Evidence |
|---|---|---|
| F1 | Projection carries only the current `lifecycle` value | `docs/hgate-project.schema.json`, `generate.mjs` |
| F2 | Transition evidence is free text with no revision, links or signer role | `status.md` Transition History (live-pet `pet-mind`) |
| F3 | Only implementation has a structured, revision-bound sign-off | `tools/bdd-traceability/signoff-loop.md` |
| F4 | `bc-review` reports are not persisted, so `SPEC_REVIEWED`/`VERIFIED` have no evidence file | `skills/bc-review/SKILL.md` ("only authoritative write is status.md") |
| F5 | Gaps drift across `domain-map.md`, `context-map.md` and `status.md` (G11–G13 still "Deferred" in live-pet domain map, resolved in `pet-mind/status.md`) | live-pet docs |
| F6 | `status.md` Open Items has no ID column, so gaps cannot be joined reliably | `skills/bc-refinement/assets/status-template.md` |
| F7 | Business rules are positional (numbered list), not stable IDs | live-pet `pet-mind/SKILL.md` Core Business Rules |
| F8 | CI runs only 3 of 5 test suites (projection and verify-spec tests skipped) | `.github/workflows/verify.yml` vs `package.json` `test` |
| F9 | The browser viewer cannot run git; any git-derived data must be precomputed | `tools/gherkin-viewer` uses File System Access API |

---

## 2. Key architecture choice: two derived outputs

Git-derived data cannot live in the committed projection: the commit that
records a transition cannot contain its own hash, and test/coverage churn would
make `project:check` fail on every code change. So the plan splits outputs:

| Output | Built from | Committed? | Checked in CI | Tool |
|---|---|---|---|---|
| `docs/hgate-project.json` (projection, extended) | Authoritative Markdown only | Yes | `project:check` (drift = fail) | `tools/project-projection/generate.mjs` |
| `.hgate/status.json` (status report, new) | Git history + working tree + verifier output + projection | No (gitignored) | Generated, not drift-checked | `tools/project-status/generate.mjs` (new) |

The viewer loads the projection (required) and the status report (optional).
Without the status report, the board still works; timelines show transitions
without change summaries.

### How "what changed" is derived (Track B)

1. Walk `git log` for each BC's `status.md`; read `lifecycle:` frontmatter at
   each commit. A commit where the value changes is that transition's commit.
   No hashes are stored by hand.
2. At each transition commit, and at `HEAD`, extract a **semantic snapshot** of
   the BC: scenario IDs + content hash, business rules + content hash,
   decision headings, domain-model sections, ports, ACLs, gates, open items.
3. Diff consecutive snapshots: added / removed / modified items per category.
4. Also diff `HEAD` against the working tree ("uncommitted changes").
5. Output is ordered and timestamp-free, so the same repo state always produces
   the same file.

Requirements: full history (`fetch-depth: 0` in CI); squash merges collapse
intermediate transitions into one commit (documented limitation).

---

## 3. Decisions needed before execution

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Default "what changed" baseline | (a) since the BC's last lifecycle transition, plus uncommitted; (b) since `HEAD~1`; (c) both | (a); the timeline also shows every step-to-step diff |
| D2 | Status report location | (a) gitignored `.hgate/status.json`; (b) committed | (a) — avoids the self-reference problem |
| D3 | Gap drift severity | (a) warning in viewer and `verify-spec`, non-failing; (b) fails `project:check` | (a) first; promote later |
| D4 | Schema versioning | (a) `schemaVersion: 2`, viewer reads 1 and 2; (b) optional fields in v1 | (a), with a new ADR (ADR-008 asked to revisit past v1) |
| D5 | Business-rule identity for diffs | (a) content hash, number as label (renumbering shows as modified); (b) introduce stable `BR-<BC>-NNN` IDs | (a) now; (b) in backlog |
| D6 | Gate catalog | Draft in §4 | Review and adjust |

---

## 4. Draft gate catalog (for D6)

Kinds: **H** = human approval, **D** = deterministic tool, **R** = record only.
Signer roles: Tech lead, Technical PM, Product owner.

| Gate ID | Transition | Kind | Required evidence | Signer |
|---|---|---|---|---|
| `GATE-DISC-BOUNDARY` | `- → DISCOVERED` | H | BC row in `domain-map.md`; relationships in `context-map.md` | Tech lead / Technical PM |
| `GATE-REF-SPEC` | `REFINING → REFINED` | D | `verify-spec` (refinement) exit 0 | — |
| `GATE-REF-APPROVAL` | `REFINING → REFINED` | H | Spec files approved (paths listed) | Tech lead / Technical PM |
| `GATE-SREV-REPORT` | `REFINED → SPEC_REVIEWED` | H | Persisted `bc-review spec-only` report, no unresolved blocking findings | Tech lead |
| `GATE-IMPL-READY` | `REFINED/SPEC_REVIEWED → IMPLEMENTING` | D | `verify-spec --phase implementation` exit 0 | — |
| `GATE-IMPL-BDD` | `IMPLEMENTING → IMPLEMENTED`, `CHANGING → IMPLEMENTED` | D | `verify:bdd` exit 0 | — |
| `GATE-IMPL-SIGNOFF` | same as above | H | `docs/verification/bdd-signoffs/<bc>/<file>.md` | Tech lead |
| `GATE-IMPL-PROPS` | same as above (optional) | H | Business-verification sign-off, or decline recorded in `decisions.md` | Tech lead |
| `GATE-VER-REPORT` | `IMPLEMENTED → VERIFIED` | H | Persisted `bc-review full` report, no unresolved blocking findings | Tech lead |
| `GATE-BLOCK` | `* → BLOCKED` | R | Blocker, owner, return state | — |
| `GATE-DEPR` | `* → DEPRECATED` | H | ADR or decision link | Tech lead / Product owner |
| `GATE-PROJ-SYNC` | every transition | D | `project:check` in-sync | — |

Proposed `status.md` addition:

```markdown
## Gate Evidence

| Transition | Gate | Kind | Result | Evidence | Signed by | Date |
|---|---|---|---|---|---|---|
| REFINING → REFINED | GATE-REF-SPEC | D | PASS | `verify-spec` OK (refinement) | — | 2026-10-14 |
| REFINING → REFINED | GATE-REF-APPROVAL | H | PASS | SKILL.md, domain-model.md, bdd-scenarios.md, decisions.md, llm-acl.md | Ali (Tech lead) | 2026-10-14 |
```

Open Items gains an `ID` column (gap IDs like `G11`, or local `OI-n`).

---

## 5. Task checklist

Status keys: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked.
Each task runs in its own sub-agent; the sub-agent reads this plan and the ADR
from T1 first, stays inside its task's scope, runs `npm test`, and ticks its
acceptance boxes here.

### Phase 0 — Decisions (main thread, no sub-agent)

- [ ] **T0 — Resolve D1–D6** and mark this plan `APPROVED`.

### Phase 1 — Model and rules

- [ ] **T1 — ADR: lifecycle gate evidence and two-output split**
  - Depends on: T0
  - Output: `docs/adr/2026-11-xx-lifecycle-gate-evidence-and-status-report.md`
  - Acceptance:
    - [ ] Records the gate model, `status.md` as authority, projection vs status-report split, git derivation method, schema v2 (D4)
    - [ ] Lists consequences: `fetch-depth: 0`, squash-merge limitation, gitignored output

- [ ] **T2 — Gate catalog and status template**
  - Depends on: T1
  - Files: new `skills/hgate-guide/references/lifecycle-gates.md` (catalog table, parseable); `skills/bc-refinement/assets/status-template.md` (Gate Evidence section, Open Items `ID` column); `skills/hgate-guide/references/lifecycle-status.md` (update rules point to gates)
  - Acceptance:
    - [ ] Catalog matches the D6 outcome; every transition in lifecycle-status.md maps to at least one gate
    - [ ] Template contains no ambiguous placeholders the generator would mis-parse

- [ ] **T3a — Specialist skills write gate evidence (refinement, exploration)**
  - Depends on: T2
  - Files: `skills/domain-exploration/SKILL.md`, `skills/bc-refinement/SKILL.md` (+ phase-6/7 references)
  - Acceptance:
    - [ ] Each skill's close phase writes Gate Evidence rows for its transition before changing `lifecycle:`
    - [ ] Existing phase numbering unchanged

- [ ] **T3b — Specialist skills write gate evidence (review, implementation, enhancement)**
  - Depends on: T2
  - Files: `skills/bc-review/SKILL.md` + `references/report-template.md` (persist report at `docs/verification/bc-reviews/<bc>/YYYY-MM-DD-<mode>.md`), `skills/bc-implementation/SKILL.md`, `skills/bc-enhancement/SKILL.md`, `skills/hgate-guide/SKILL.md` (reads gates when diagnosing)
  - Acceptance:
    - [ ] `bc-review` persists its report (closes F4) and records `GATE-SREV-REPORT` / `GATE-VER-REPORT`
    - [ ] Implementation and enhancement link the BDD sign-off file in `GATE-IMPL-SIGNOFF`

### Phase 2 — Projection (Track A)

- [ ] **T4a — Schema v2 + status parsing**
  - Depends on: T2
  - Files: `docs/hgate-project.schema.json`, `tools/project-projection/generate.mjs`, tests and fixtures, `docs/hgate-project.example.json`
  - Adds per BC: `transitions[]`, `gates[]`, `blockers[]`, `nextSkill`, `openItems[]`
  - Acceptance:
    - [ ] Example regenerates byte-for-byte; idempotent; `--check` still detects drift
    - [ ] v1 projects still generate (or a clear upgrade message), per D4
    - [ ] Malformed gate rows fail with an `HGP` code listing every problem

- [ ] **T4b — Merged gap ledger with drift diagnostics**
  - Depends on: T4a
  - Joins gaps by ID across `domain-map.md` Open Boundary Gaps, `context-map.md` gaps, each `status.md` Open Items
  - Acceptance:
    - [ ] Top-level `gaps[]` with sources and dispositions per file
    - [ ] Drift (differing dispositions) emitted as `diagnostics[]` warnings, non-failing per D3
    - [ ] Fixture reproduces the live-pet G11–G13 drift case

- [ ] **T4c — Artifact stats and sign-off index**
  - Depends on: T4a
  - Adds per BC: `stats` (rules, scenarios, features, decisions, properties, ACLs, ports) and `signoffs[]` (files under `docs/verification/**/<bc>/`)
  - Acceptance:
    - [ ] Counts are derived only from Markdown, no git or test run
    - [ ] Unit tests cover zero, one and many cases

- [ ] **T5 — Gate validation in `verify-spec`**
  - Depends on: T4a
  - Acceptance:
    - [ ] Current `lifecycle` requires PASS rows for the gates of the transition into it (new `HGS` codes)
    - [ ] Gap drift reported as warning
    - [ ] Tests for pass, missing gate, failed gate

### Phase 3 — Git-derived status report (Track B)

- [ ] **T6a — Semantic snapshot extractor (pure, no git)**
  - Depends on: T4a
  - Files: new `tools/project-status/snapshot.mjs` + tests
  - Acceptance:
    - [ ] Given BC file contents, returns ordered items with content hashes: scenarios, rules (D5), decision headings, model sections, ports, ACLs, gates, open items
    - [ ] Diff function returns added / removed / modified per category; deterministic

- [ ] **T6b — Git walker and status report CLI**
  - Depends on: T6a
  - Files: `tools/project-status/generate.mjs`, README, tests that build temporary git repos
  - Acceptance:
    - [ ] Derives each transition's commit from `status.md` history
    - [ ] Emits step-to-step diffs, last-transition→HEAD, HEAD→worktree (per D1)
    - [ ] Optionally embeds `verify:bdd --format json` coverage when tests exist
    - [ ] Clear message on shallow clone or missing git; no timestamps; idempotent

### Phase 4 — Viewer

- [ ] **T7a — Board tab (projection only)**
  - Depends on: T4b, T4c
  - Acceptance:
    - [ ] Lifecycle swimlanes with BC cards (classification, next skill, blockers, stats)
    - [ ] Gap ledger with drift warnings; diagnostics panel
    - [ ] Works on v1 and v2 projections; tests in `project-viewer.test.js`

- [ ] **T7b — Per-BC timeline and change view (status report)**
  - Depends on: T6b, T7a
  - Acceptance:
    - [ ] Timeline of transitions with gates, signer, evidence links
    - [ ] Each step expands to its semantic diff; "since last transition" and "uncommitted" shown at top
    - [ ] Degrades gracefully when `.hgate/status.json` is absent

### Phase 5 — Wiring and docs

- [ ] **T8 — Scripts, CI, hooks**
  - Depends on: T5, T6b
  - Acceptance:
    - [ ] `package.json`: `project:status`; `test` includes new suites
    - [ ] `.github/workflows/verify.yml` runs all test suites (closes F8)
    - [ ] `templates/ci/hgate-verify.yml` and hooks updated; `.hgate/` gitignored; `fetch-depth: 0` documented

- [ ] **T9 — Documentation**
  - Depends on: T8
  - Files: `README.md`, `docs/adoption-guide.md`, tool READMEs, `templates/CLAUDE.hgate.md`
  - Acceptance:
    - [ ] Describes the gate model, both outputs, board, timeline, limitations

### Phase 6 — Proof on live-pet and verification

- [ ] **T10 — Live-pet migration and proof**
  - Depends on: T9
  - Steps: copy updated `tools/` and skills; migrate both BCs' `status.md` (Gate Evidence backfill, Open Items IDs); fix stale gaps in `domain-map.md`; run `project:sync`, `verify-spec`, `project:status`; open the viewer
  - Note: the live-pet folder is a git worktree whose git directory is outside the connected folder, so git commands fail from the agent shell. Either run `project:status` locally or grant access to the main `live-pet` repo.
  - Acceptance:
    - [ ] Board shows Pet Mind `REFINED`, Pet Companion `DISCOVERED`, gap ledger, drift cleared after the fix
    - [ ] Pet Mind timeline shows three transitions with changes

- [ ] **T11 — Independent verification**
  - Depends on: T10
  - A sub-agent that did not build the work checks every acceptance box against the repo, runs all tests, and reports findings.

---

## 6. Dependency order

```text
T0 → T1 → T2 ─┬─ T3a
              ├─ T3b
              └─ T4a ─┬─ T4b ─┐
                      ├─ T4c ─┼─ T7a ─┐
                      ├─ T5   │       ├─ T7b
                      └─ T6a → T6b ───┘
T5 + T6b → T8 → T9 → T10 → T11
```

Parallel-safe after T2: T3a, T3b, T4a. After T4a: T4b, T4c, T5, T6a.

## 7. Execution notes for sub-agents

- Read this plan and the T1 ADR first; touch only files listed for the task.
- Keep tooling dependency-free (Node 18+, no new packages), matching ADR-008.
- Run `npm test` before ticking boxes; record the result in the log below.
- In the agent's device shell, git cannot delete lock files until deletion is
  allowed for the folder; commit from the main thread or grant deletion first.

## 8. Out of scope (backlog)

- Track C: immutable approval records for every human transition
- Saving in-session phase progress
- Hosted status report in CI (GitHub Pages / Bitbucket)
- Stable business-rule IDs (D5 option b)
- Removing Merit-specific leftovers from `bc-refinement` Standing Rules and `templates/CLAUDE.hgate.md`

## 9. Execution log

| Date | Task | Result | Notes |
|---|---|---|---|
