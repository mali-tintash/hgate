# hGATE Viewer Guide

For tech leads and technical PMs who review where each bounded context (BC)
stands. The viewer is a read-only page: it never changes the project.

## What the viewer is

`tools/gherkin-viewer/index.html` is a standalone page. A top bar, always
visible, shows the project name and counts, the warning count, **Reload**,
**Load project** and the **?** guide button. Below it are three tabs:

- **Board**: summary strip, lifecycle matrix (or kanban), gates, the gap ledger and warnings.
- **Project**: the BC topology diagram and per-BC details.
- **Scenarios**: BDD scenarios per BC, filterable by tag, title or step.

Before a project is loaded, a welcome screen shows the commands to run first
and a **Load project folder** button. The tabs stay reachable.

Everything runs in your browser. Nothing is uploaded.

## How to open it

1. In the project root, refresh the derived files:
   - `npm run project:sync` regenerates `docs/hgate-project.json`.
   - `npm run project:status` writes `.hgate/status.json` (timeline and change summaries).
2. Open `tools/gherkin-viewer/index.html` in a browser (a `file://` page is fine).
3. Click **Load project** in the top bar (or **Load project folder** on the
   welcome screen) and pick the project root folder.
4. After editing files or re-running the commands, click **Reload**. In
   Chrome and Edge it re-reads the same folder; other browsers ask you to pick
   the folder again.

Without `.hgate/status.json` the Board still works; BC details then show
transitions only, with a hint to run `npm run project:status`.

## Board sections

| Section | What it shows |
|---|---|
| Warning count | Amber **n warnings** button in the top bar: projection warnings (gap drift and missing gaps). Shown on every tab while warnings exist, cannot be dismissed. Click it to open the diagnostics list. |
| Summary strip | Five tiles at the top: **Bounded contexts** (count and a bar by lifecycle state), **Gates met** (BCs whose current-transition gates are valid / all BCs; red names the BCs that are not valid), **Open gaps** (open + partial + drift; deferred listed beside), **Warnings**, **Last change** (latest transition date and BC). Click **Open gaps** to jump to the gap ledger, **Warnings** to open the diagnostics, **Last change** to open that BC. |
| Lifecycle matrix | Default view. One row per BC, columns Discovered → Verified. The rail fills the states already passed, rings the current state and leaves later states hollow. Changing, Blocked and Deprecated show as a marker next to the name (the rail stays at the last main state); a BC with blockers shows **n blockers**. Each row also shows the classification (and the boundary role only when it differs), warnings, the next skill (hover for the full text), gate progress and open gaps. Most advanced BCs come first. |
| Kanban | Toggle **Matrix / Kanban** above the list. One column per state with compact cards (same content as a row); empty states collapse into narrow labelled rails. |
| Gap ledger | Every shared gap (`G<n>`) with its state and dispositions, in a panel whose colour follows its contents (see below). Beside the matrix on wide screens, below it otherwise. |
| Diagnostics | Warnings with stable codes, e.g. `HGW001` (gap drift) and `HGW002` (gap missing from the maps). Open by default while warnings exist. |
| BC details | Click a row or card: a panel slides in from the right with the header (lifecycle, classification, rail, next skill, gate progress, unmet gates, counts), blockers, warnings, change summaries, timeline, all gate evidence, open items and sign-offs. Click another BC to switch; close with **Esc**, the **×** button or a click outside the panel. Focus returns to the row. |
| Change summaries | What changed in the BC spec **since the last transition**, **since the previous commit**, and **uncommitted** in the working tree. |
| Timeline | Each transition (newest at the bottom, ringed) with its commit, gates, signers and evidence; expand a step to see its semantic diff. |
| All gate evidence | Every row of the BC's `## Gate Evidence` table in `status.md`: gate, kind, transition and date; result; evidence and signer. |

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

**Gate progress** (ring and **n/m**) on a row or card: n of the m gates
required for the BC's current transition are satisfied. Red means the
transition is not valid; hover for the unmet gates. **–** means no gates are
required or recorded.

## Colours and badges

- **Amber badge** (`n warnings`): the card or gap row has drift warnings.
- **Blue "Partial" badge**: a gap resolved for part of its scope; the rest is still open. Not drift.
- **Green** `PASS` / `RESOLVED`, **red** `FAIL` / `OPEN`, **amber** `WAIVED` / `MIXED`, **grey** `DEFERRED` / `N/A`.
- **Red gate ring**: at least one required gate is unmet or failed.

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

Dispositions are collapsed. When every source file says the same thing, the
text is shown once with **n sources agree**; expand it for the `file:line`
list. When sources differ, the most common text is shown with **k of n
sources agree**, and each differing source is listed below it, highlighted in
amber with its own text.

## 5-minute review routine

1. **Warning count** in the top bar: any warnings? Click it and read each drift item.
2. **Summary strip and matrix**: red **Gates met**, red gate rings and Blocked markers show which BCs claim a state their gates do not support.
3. **Gap ledger panel**: highlighted **Differs** lines show where sources disagree; red means an `OPEN` or `MIXED` gap needs action now; amber means `PARTIAL` or `DEFERRED` gaps need an owner and a date; a collapsed ✓ line means nothing to do.
4. **Open a BC** (click its row): read "since last transition" and "uncommitted". Unreviewed spec changes show up here.
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
