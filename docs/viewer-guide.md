# hGATE Viewer Guide

For tech leads and technical PMs who review where each bounded context (BC)
stands. The viewer is a read-only page: it never changes the project.

## What the viewer is

`tools/gherkin-viewer/index.html` is a standalone page with three tabs:

- **Scenarios**: BDD scenarios per BC, filterable by tag, title or step.
- **Project**: the BC topology diagram and per-BC details.
- **Board**: lifecycle swimlanes, gates, the gap ledger and warnings.

Everything runs in your browser. Nothing is uploaded.

## How to open it

1. In the project root, refresh the derived files:
   - `npm run project:sync` regenerates `docs/hgate-project.json`.
   - `npm run project:status` writes `.hgate/status.json` (timeline and change summaries).
2. Open `tools/gherkin-viewer/index.html` in a browser (a `file://` page is fine).
3. Click **Load project** and pick the project root folder.

Without `.hgate/status.json` the Board still works; BC details then show
transitions only, with a hint to run `npm run project:status`.

## Board sections

| Section | What it shows |
|---|---|
| Warning banner | Count of projection warnings (gap drift and missing gaps). Shown on every tab, cannot be dismissed. **Show** opens the diagnostics list. |
| Swimlanes | One column per lifecycle state, from Discovered to Verified, plus Changing, Blocked and Deprecated. |
| Cards | One per BC: classification and role, date of the last transition, next skill, blockers, counts (rules, scenarios, decisions, open gaps), gate count and sign-offs. |
| Gap ledger | Every shared gap (`G<n>`) with its state and the disposition written in each source file, in a panel whose colour follows its contents (see below). |
| Diagnostics | Warnings with stable codes, e.g. `HGW001` (gap drift) and `HGW002` (gap missing from the maps). |
| BC details | Click a card: blockers, warnings, change summaries, timeline, all gate evidence, open items, sign-offs. |
| Change summaries | What changed in the BC spec **since the last transition**, **since the previous commit**, and **uncommitted** in the working tree. |
| Timeline | Each transition with its commit, gates, signers and evidence; expand a step to see its semantic diff. |
| All gate evidence | Every row of the BC's `## Gate Evidence` table in `status.md`. |

## Gate kinds and results

| Kind | Meaning |
|---|---|
| `H` | Human approval: a named person signs it off. |
| `D` | Deterministic check: a tool run with a pass/fail result. |
| `R` | Record only: written down, nothing to approve. |

| Result | Meaning |
|---|---|
| `PASS` | The gate is met. |
| `FAIL` | Checked and not met. The row stays as history; the transition is not valid. |
| `WAIVED` | Skipped on purpose. Needs a Tech lead signer and a reason in Evidence. |
| `N/A` | Does not apply. Satisfies optional gates only. |

**n/m gates** on a card: n of the m gates required for the BC's current
transition are satisfied. Unmet gates are listed under the count.

## Colours and badges

- **Amber badge** (`n warnings`): the card or gap row has drift warnings.
- **Blue "Partial" badge**: a gap resolved for part of its scope; the rest is still open. Not drift.
- **Green** `PASS` / `RESOLVED`, **red** `FAIL` / `OPEN`, **amber** `WAIVED` / `MIXED`, **grey** `DEFERRED` / `N/A`.
- **Red gate count**: at least one required gate is unmet or failed.

Gap states: `RESOLVED` (all sources say resolved), `PARTIAL` (resolved for
part of the scope), `MIXED` (sources disagree: drift), `DEFERRED` (postponed on
purpose), `OPEN` (not addressed yet).

Hover any badge, abbreviation or state name in the viewer for its meaning.

## Gap ledger panel

The gap ledger is a separate panel. Its look follows the most severe gap state:

| Panel | When | Look |
|---|---|---|
| **Gaps need attention** | Any gap is `OPEN` or `MIXED` | Soft red, red left border, ⚠ icon |
| **Gaps pending** | No `OPEN` or `MIXED`, but some `PARTIAL` or `DEFERRED` | Soft amber, amber left border, ⚠ icon |
| **All n gaps resolved** | Every gap is `RESOLVED` | Neutral, one collapsed line with ✓; click to expand |
| **No gaps recorded** | The projection has no gaps (schema v1 or legacy) | Neutral, one collapsed line |

The header shows count chips such as `2 open · 3 partial · 1 drift` (zero
counts are left out; `drift` counts `MIXED` gaps). Unresolved gaps come first,
most severe first (`MIXED`, `OPEN`, `PARTIAL`, `DEFERRED`), then by gap ID.
Resolved gaps sit behind **Show resolved (n)**.

## 5-minute review routine

1. **Banner**: any warnings? Click **Show** and read each drift item.
2. **Red gate counts and blockers** on cards: which BCs claim a state their gates do not support?
3. **Gap ledger panel**: red means an `OPEN` or `MIXED` gap needs action now; amber means `PARTIAL` or `DEFERRED` gaps need an owner and a date; a collapsed ✓ line means nothing to do.
4. **Open a BC**: read "since last transition" and "uncommitted". Unreviewed spec changes show up here.
5. **Gates and signers** for the latest timeline step: right kind, right person, real evidence?

## Deterministic vs LLM-written

- **LLM-written**: the Markdown (`SKILL.md`, `status.md`, gate rows, maps), written in agent skill sessions and approved by people.
- **Deterministic**: `project:sync` (projection), `verify:spec`, `project:status` (status report) and this viewer. Same input, same output.
- `project:status` runs only when someone runs it, manually or in CI. A stale report shows a notice.

## Limitations

- `D` rows are tool results recorded by the agent, not re-run by the viewer. Re-run the tool if in doubt.
- Squash merges collapse several steps into one commit; their changes appear on the last step.
- Each transition is attributed by `git blame` to the commit that last edited its row.
- Histories rebuilt after the fact (backfilled gates, reconstructed commits) are only as accurate as their reconstruction.
- Steps with no git history show changes as "Unknown", which is not the same as "No changes".
