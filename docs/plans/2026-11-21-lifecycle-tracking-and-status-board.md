# Plan: Lifecycle Tracking, Gate Evidence and Status Board

**Status:** IMPLEMENTED 2026-11-21 on `enhanced-reviewability` (local commits, not pushed); decisions D1–D6 in §3
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

1. Attribute each row of a BC's `status.md` Transition History to the commit
   that introduced it (`git blame` on that line; fall back to `git log -S`).
   Several transitions recorded in one session share one commit; rows not yet
   committed are attributed to the working tree. No hashes are stored by hand.
   (Frontmatter-change detection alone would miss transitions committed
   together, which is the normal case after a refinement session.)
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

| ID | Decision | Resolution (2026-11-21) |
|---|---|---|
| D1 | "What changed" baseline | **Both:** per BC, since its last lifecycle transition; and since the previous commit (`HEAD~1`); plus uncommitted working-tree changes. Timeline also shows every step-to-step diff |
| D2 | Status report location | Gitignored `.hgate/status.json` (avoids the self-reference problem) |
| D3 | Gap drift severity | **Warning only, but not missable** — see §3.1 |
| D4 | Schema versioning | `schemaVersion: 2`; viewer reads 1 and 2; new ADR (ADR-008 asked to revisit past v1) |
| D5 | Business-rule identity | Content hash with the rule number as label. As built (T6a): match by hash first, so pure renumbering shows as `moved` (not a change); edits then match by number and show as modified. Stable rule IDs stay in backlog |
| D6 | Gate catalog | §4 accepted as drafted |

### 3.1 "Not missable" drift warnings (D3)

Warnings never fail a command, but every surface must show them:

- **Viewer:** a persistent banner at the top of every tab with the warning count, not dismissible while warnings exist; amber badge on each affected BC card and gap row; Board tab opens with the drift list expanded when count > 0.
- **CLI:** `project:sync`, `project:check` and `verify-spec` print a `WARNINGS (n)` block as the last lines of output, after the success line, and exit 0.
- **CI:** emit `::warning file=…,line=…::` annotations (GitHub) and a summary line; Bitbucket gets the same summary in the log.
- **Projection:** `diagnostics[]` with stable codes so tools can count them.

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

- [x] **T0 — Resolve D1–D6** and mark this plan `APPROVED`.

### Phase 1 — Model and rules

- [x] **T1 — ADR: lifecycle gate evidence and two-output split**
  - Depends on: T0
  - Output: `docs/adr/2026-11-xx-lifecycle-gate-evidence-and-status-report.md`
  - Acceptance:
    - [x] Records the gate model, `status.md` as authority, projection vs status-report split, git derivation method, schema v2 (D4)
    - [x] Lists consequences: `fetch-depth: 0`, squash-merge limitation, gitignored output

- [x] **T2 — Gate catalog and status template**
  - Depends on: T1
  - Files: new `skills/hgate-guide/references/lifecycle-gates.md` (catalog table, parseable); `skills/bc-refinement/assets/status-template.md` (Gate Evidence section, Open Items `ID` column); `skills/hgate-guide/references/lifecycle-status.md` (update rules point to gates)
  - Acceptance:
    - [x] Catalog matches the D6 outcome; every transition in lifecycle-status.md maps to at least one gate
    - [x] Template contains no ambiguous placeholders the generator would mis-parse

- [x] **T3a — Specialist skills write gate evidence (refinement, exploration)**
  - Depends on: T2
  - Files: `skills/domain-exploration/SKILL.md`, `skills/bc-refinement/SKILL.md` (+ phase-6/7 references)
  - Acceptance:
    - [x] Each skill's close phase writes Gate Evidence rows for its transition before changing `lifecycle:`
    - [x] Existing phase numbering unchanged

- [x] **T3b — Specialist skills write gate evidence (review, implementation, enhancement)**
  - Depends on: T2
  - Files: `skills/bc-review/SKILL.md` + `references/report-template.md` (persist report at `docs/verification/bc-reviews/<bc>/YYYY-MM-DD-<mode>.md`), `skills/bc-implementation/SKILL.md`, `skills/bc-enhancement/SKILL.md`, `skills/hgate-guide/SKILL.md` (reads gates when diagnosing)
  - Acceptance:
    - [x] `bc-review` persists its report (closes F4) and records `GATE-SREV-REPORT` / `GATE-VER-REPORT`
    - [x] Implementation and enhancement link the BDD sign-off file in `GATE-IMPL-SIGNOFF`

### Phase 2 — Projection (Track A)

- [x] **T4a — Schema v2 + status parsing**
  - Depends on: T2
  - Files: `docs/hgate-project.schema.json`, `tools/project-projection/generate.mjs`, tests and fixtures, `docs/hgate-project.example.json`
  - Adds per BC: `transitions[]`, `gates[]`, `blockers[]`, `nextSkill`, `openItems[]`
  - Acceptance:
    - [x] Example regenerates byte-for-byte; idempotent; `--check` still detects drift
    - [x] v1 projects still generate (or a clear upgrade message), per D4
    - [x] Malformed gate rows fail with an `HGP` code listing every problem

- [x] **T4b — Merged gap ledger with drift diagnostics**
  - Depends on: T4a
  - Joins gaps by ID across `domain-map.md` Open Boundary Gaps, `context-map.md` gaps, each `status.md` Open Items
  - Acceptance:
    - [x] Top-level `gaps[]` with sources and dispositions per file
    - [x] Drift (differing dispositions) emitted as `diagnostics[]` warnings, non-failing per D3
    - [x] CLI prints the trailing `WARNINGS (n)` block per §3.1
    - [x] Fixture reproduces the live-pet G11–G13 drift case

- [x] **T4c — Artifact stats and sign-off index**
  - Depends on: T4a
  - Adds per BC: `stats` (rules, scenarios, features, decisions, properties, ACLs, ports) and `signoffs[]` (files under `docs/verification/**/<bc>/`)
  - Acceptance:
    - [x] Counts are derived only from Markdown, no git or test run
    - [x] Unit tests cover zero, one and many cases

- [x] **T5 — Gate validation in `verify-spec`**
  - Depends on: T4a
  - Acceptance:
    - [x] Current `lifecycle` requires PASS rows for the gates of the transition into it (new `HGS` codes)
    - [x] Gap drift reported as warning with the trailing `WARNINGS (n)` block per §3.1
    - [x] Tests for pass, missing gate, failed gate

### Phase 3 — Git-derived status report (Track B)

- [x] **T6a — Semantic snapshot extractor (pure, no git)**
  - Depends on: T4a
  - Files: new `tools/project-status/snapshot.mjs` + tests
  - Acceptance:
    - [x] Given BC file contents, returns ordered items with content hashes: scenarios, rules (D5), decision headings, model sections, ports, ACLs, gates, open items
    - [x] Diff function returns added / removed / modified per category; deterministic

- [x] **T6b — Git walker and status report CLI**
  - Depends on: T6a
  - Files: `tools/project-status/generate.mjs`, README, tests that build temporary git repos
  - Acceptance:
    - [x] Attributes each Transition History row to its introducing commit (blame), including rows committed together and uncommitted rows
    - [x] Emits step-to-step diffs, last-transition→HEAD, `HEAD~1`→HEAD, HEAD→worktree (per D1)
    - [x] Optionally embeds `verify:bdd --format json` coverage when tests exist
    - [x] Clear message on shallow clone or missing git; no timestamps; idempotent

### Phase 4 — Viewer

- [x] **T7a — Board tab (projection only)**
  - Depends on: T4b, T4c
  - Acceptance:
    - [x] Lifecycle swimlanes with BC cards (classification, next skill, blockers, stats)
    - [x] Gap ledger with drift warnings; diagnostics panel
    - [x] Persistent, non-dismissible warning banner and amber badges per §3.1
    - [x] Works on v1 and v2 projections; tests in `project-viewer.test.js`

- [x] **T7b — Per-BC timeline and change view (status report)**
  - Depends on: T6b, T7a
  - Acceptance:
    - [x] Timeline of transitions with gates, signer, evidence links
    - [x] Each step expands to its semantic diff; "since last transition", "since previous commit" and "uncommitted" shown at top
    - [x] Degrades gracefully when `.hgate/status.json` is absent

### Phase 5 — Wiring and docs

- [x] **T8 — Scripts, CI, hooks**
  - Depends on: T5, T6b
  - Acceptance:
    - [x] `package.json`: `project:status`; `test` includes new suites
    - [x] `.github/workflows/verify.yml` runs all test suites (closes F8)
    - [x] `templates/ci/hgate-verify.yml` and hooks updated; `.hgate/` gitignored; `fetch-depth: 0` documented

- [x] **T9 — Documentation**
  - Depends on: T8
  - Files: `README.md`, `docs/adoption-guide.md`, tool READMEs, `templates/CLAUDE.hgate.md`
  - Acceptance:
    - [x] Describes the gate model, both outputs, board, timeline, limitations

### Phase 6 — Proof on live-pet and verification

- [x] **T10 — Live-pet migration and proof**
  - Depends on: T9
  - Steps: copy updated `tools/` and skills; migrate both BCs' `status.md` (Gate Evidence backfill, Open Items IDs); fix stale gaps in `domain-map.md`; run `project:sync`, `verify-spec`, `project:status`; open the viewer
  - Note: the connected live-pet folder is a git worktree whose git directory (`/Users/muhammadali/Codes/live-pet/.git`) is outside the connected folder, so git fails from the agent shell. `github.com/mali-tintash/live-pet` `main` has only the 3 setup commits; the Pet Mind work is not pushed. Before T10: push the worktree branch, or grant folder access to `/Users/muhammadali/Codes/live-pet`.
  - Acceptance:
    - [x] Board shows Pet Mind `REFINED`, Pet Companion `DISCOVERED`, gap ledger, drift cleared after the fix
    - [x] Pet Mind timeline shows three transitions with changes

- [x] **T10.5 — Fix bugs found in T10**
  - Acceptance:
    - [x] Transition History accepted in either order; all tools normalise to chronological order (shared helper)
    - [x] verify-spec gate-checks every BC with a `status.md`, including DISCOVERED
    - [x] Partially resolved gaps get a distinct `PARTIAL` state, visible on the board (not a drift warning)

- [x] **T11 — Independent verification**
  - Depends on: T10
  - A sub-agent that did not build the work checks every acceptance box against the repo, runs all tests, and reports findings.

---

### Phase 7 — Viewer help (added 2026-11-21)

- [x] **T12 — Board legends, tooltips and guide**
  - Acceptance:
    - [x] Hover tooltips on every abbreviation and badge (Kind H/D/R, Result, gap state, badges, "n/m gates")
    - [x] Legends under the gate evidence table and the gap ledger
    - [x] "?" help button in the viewer header opens a guide panel
    - [x] Guide also lives at `docs/viewer-guide.md`; a test keeps the embedded copy identical

- [x] **T13 — Adaptive gap attention panel**
  - Acceptance:
    - [x] Gap ledger box style follows contents: any MIXED/OPEN → soft red + red left border ("Gaps need attention"); only PARTIAL/DEFERRED → soft amber ("Gaps pending"); all RESOLVED → neutral one-line collapsed summary
    - [x] Header count chips; warning icon (not colour alone); unresolved sorted first; resolved behind "Show resolved (n)"
    - [x] Guide and glossary updated; tests for each panel state

### Phase 8 — Viewer redesign, direction B (added 2026-11-22)

Review findings: no brand (pale blue everywhere, unlike hgate.org's pine/sage + Bricolage/Instrument Sans/IBM Plex Mono); document-style long scroll with three Load buttons; 7 mostly empty swimlanes overflowing; text-wall cards; buttons indistinguishable from badges; gap dispositions repeated per source; cramped tables; underused diagram; textarea-first Scenarios tab with a Merit client sample; no overview, first-run or dark mode.

- [x] **T14a — Design system and app shell**
  - Acceptance:
    - [x] hgate.org tokens (palette, fonts bundled locally with the viewer, tabular numerics), light + dark (prefers-color-scheme)
    - [x] Distinct button / chip / status-pill components; tables don't wrap dates, paths truncate with hover
    - [x] Top bar: project name, single Load project, warning count, refresh, "?"; first-run welcome screen
    - [x] Merit-specific default sample removed (neutral sample or empty state)
- [x] **T14b — Board redesign**
  - Acceptance:
    - [x] Summary strip (BCs by state, gates met, open gaps, warnings, last change)
    - [x] Lifecycle matrix (BC rows × state columns) with kanban toggle; no horizontal overflow at 1280px
    - [x] Compact cards/rows: status, gate progress, open gaps, next skill; no duplicate labels
    - [x] Gap attention panel always visible beside/below the matrix; identical dispositions collapse to "n sources agree"
    - [x] BC details in a right slide-over (Esc to close, focus managed)
- [ ] **T14c — Project and Scenarios tabs**
  - Acceptance:
    - [ ] Diagram fits to screen, domain grouping boxes, larger nodes, edge labels without overlap (hover for full text)
    - [ ] Scenarios: BC picker + rendered scenarios; paste box behind "Paste Markdown"
- [ ] **T14d — Visual verification** (screenshots light/dark, 1280 and 1440 widths, fix pass)

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
| 2026-11-21 | T0 | Done | D1 both, D2 gitignored, D3 warning-not-missable, D4 v2, D5 hash, D6 accepted. T6b method changed to row blame after finding live-pet commits transitions together |
| 2026-11-21 | T1, T2 | Done | ADR-009 (two ADRs share 008); `lifecycle-gates.md` catalog + Gate Evidence format + validity rules; template gains Gate Evidence (DISC-BOUNDARY + PROJ-SYNC rows) and Open Items `ID`. Five transitions only require GATE-PROJ-SYNC. Parsers must treat `[...]` cells and `YYYY-MM-DD` as unfilled. Tests 129/130 (pre-existing BDD009 env failure) |
| 2026-11-21 | T3a | Done | domain-exploration Phase 10 and bc-refinement Phase 0/5g/6/7 write gate rows before `lifecycle:`; resolved gaps must update map dispositions. Open: map templates should state gap IDs are shared with the Gap Register (fold into T9) |
| 2026-11-21 | T3b | Done | bc-review persists reports to `docs/verification/bc-reviews/` with frontmatter and records SREV/VER gates (failing review = FAIL row, no transition; code-verification mode records no gate); implementation/enhancement gate tables; hgate-guide treats unmet gates as not reached |
| 2026-11-21 | T4a | Done | Schema v2: per BC `nextSkill, blockers, transitions, gates, openItems`; legacy status.md generates (empty arrays, `id: null`); malformed gate rows HGP002; v1 local schema → HGP003 upgrade message (document in T9). Schema rejects unknown fields, so T4b/T4c must add theirs. Viewer rejects v2 until T7a. Tests 139/140 |
| 2026-11-21 | T6a | Done | `tools/project-status/snapshot.mjs`: `snapshotBc(files)`, `diffSnapshots(before, after)` over features, scenarios, rules, skill, model, ports, decisions, acls, aclSections, properties, gates, openItems; rules renumbering → `moved`. 19 tests pass |
| 2026-11-21 | T5 | Done | `tools/verify-spec/gates.mjs`; codes HGS001–HGS007 (HGS006 legacy = warning); trailing WARNINGS block + GitHub annotations; strict HGS004 signer/role rules. Gap drift in verify-spec still to wire (T8, via `tools/shared/gaps.mjs`). 51/51 verify-spec tests |
| 2026-11-21 | T4b, T4c | Done | Top-level `gaps[]` (state RESOLVED/DEFERRED/OPEN/MIXED) + `diagnostics[]` (HGW001 drift, HGW002 gap missing from maps), shared `tools/shared/gaps.mjs`; per-BC `stats` and `signoffs[]` (business sign-offs in `property-signoffs/`). Live-pet copy: 5 HGW001 warnings (G11–G13, G15, G16). Tests 179/180 |
| 2026-11-21 | T6b | Done | `tools/project-status/generate.mjs` → `.hgate/status.json` (steps with commit/sharedCommit/changes; sinceLastTransition, sincePreviousCommit, uncommitted; optional `--bdd` coverage). No-git/shallow fallbacks exit 0 with a warning. Limitation: blame credits a row to the commit that last edited it (`git log -S` fallback not built). 31 tests pass |
| 2026-11-21 | T7a | Done | Board tab (swimlanes, cards, gap ledger, diagnostics), non-dismissible `#warningBanner` on every tab, amber badges (also via gap→BC), v1/v2/legacy support; viewer loads optional `.hgate/status.json` into `statusReport`; timeline slot left for T7b. Tests 190/191 |
| 2026-11-21 | T8 | Done | `project:status` script; `npm test` and CI run all suites (F8); `.hgate/` gitignored; GitHub template uploads status artifact (non-failing); new Bitbucket template; pre-commit runs verify:spec on map changes; verify-spec prints HGW001/HGW002 drift (project-wide, ignores `--bc`). Tests 223/224 |
| 2026-11-21 | T7b | Done | Timeline in BC details: three change summaries, steps with commit, gates, signer, expandable diffs; `null` changes shown as Unknown; stale-report and git notices; hint when report missing. Display gate matching attaches a gate to the latest matching transition dated on/before it (differs from Validity Rule 1's "on or after" — display only; check in T11). Tests 230/231 |
| 2026-11-21 | T9 | Done | README (Gates, Status Report, viewer v2, warning codes), adoption guide (scripts, Bitbucket, migration), CLAUDE.hgate.md gate rule, projection schema-version notes, map templates state shared `G<n>` IDs. Timeline wording aligned to T7b by orchestrator |
| 2026-11-21 | T10 | Done (test bed, uncommitted) | Live-pet: tools/skills/schema copied, both status.md migrated (backfilled gates signed `Product owner (Technical PM)`), gaps aligned, projection in-sync, verify-spec OK, no drift. Status report from a reconstructed history in VM scratch (labelled in `.hgate/README.md`). Bugs found → T10.5: (1) newest-first Transition History breaks project-status ordering; (2) verify-spec skips BCs without model/scenarios, so DISCOVERED gates are unchecked; (3) "Resolved for X; Y to confirm" classified RESOLVED, partial gaps invisible |
| 2026-11-21 | T10.5 | Done | `tools/shared/transitions.mjs` `orderTransitions` used by generator, verify-spec, project-status, viewer; project-status uses `git blame -M`; verify-spec gate-checks every BC with status.md (`N BC(s) (spec X, gates Y)`); `PARTIAL` gap state + blue badge. Live-pet: 0 diagnostics, G11/G15/G16 PARTIAL, `OK: 2 BC(s) (spec 1, gates 2)`, status steps e2fd0aa → 408e714 (shared). Tests 244/245 |
| 2026-11-21 | T11 | Done | Independent verifier: all boxes PASS except T7a gate summary (N/A counted as met, missing gates not counted). Fixed: shared `tools/shared/gate-rules.mjs` used by verify-spec and generator; projection per-BC `gateStatus`; cards show n/m with unmet list; catalog rows with dated evidence paths no longer skipped; ADR §6/§8 corrected; fixture catalogs synced (byte-equality test); clearer HGS001; one warnings format. Live-pet signers now `Unrecorded product owner (Technical PM)`. Tests 255/256 (BDD009 fails only in this VM: a global typescript under `/opt/cowork-node-tools` lacks `ScriptTarget`) |
| 2026-11-21 | T12 | Done | `GLOSSARY` drives tooltips and legends; "?" help panel (Esc/Close, focus return); `docs/viewer-guide.md` embedded as generated `viewer-guide.js` (`node tools/gherkin-viewer/sync-guide.mjs`), byte-equality test. Tests 261/262. Not checked in a real browser |
| 2026-11-21 | T13 | Done | `gapPanelModel` (attention / pending / clear / empty), panel styled by level with icon, count chips, natural-order sorting, "Show resolved (n)"; guide section added and re-synced. Live-pet: pending, `3 partial · 1 deferred · 2 resolved`. Tests 267/268 |
| 2026-11-22 | T14a | Done | Tokens (light + dark), `.btn/.chip/.pill/.card/.panel/.table` components, sticky top bar (single Load, Reload, warnings button kept non-dismissible, "?"), welcome screen, tab order Board/Project/Scenarios, fonts bundled in `tools/gherkin-viewer/fonts/`, Merit sample replaced by a library-loan sample. Open: subset fonts lack `[ ] | $ { }` and backtick; swimlanes overflow at 1280 (T14b) |
| 2026-11-22 | T14b | Done | Summary strip (5 tiles), lifecycle matrix with progress rails + kanban toggle, gap panel as cards beside the matrix ≥1400px (below at 1280), identical dispositions collapse to "n sources agree", modal BC drawer (620px, focus trap). Helpers `buildSummaryStrip`, `buildLifecycleMatrix`, `collapseDispositions`, `baseLifecycleOf`. Open: kanban scrolls below ~1100px; faint dark scrim. Tests 274/275 |
