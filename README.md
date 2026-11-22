# hGATE

**human Guided AI assisted Traceable Engineering**

hGATE is a manual, guided workflow for specification-driven development with AI
code generation. It combines:

- Domain-Driven Design to establish domains and bounded contexts
- Behavior-Driven Development to make business behavior explicit
- Test-Driven Development to implement approved specifications
- Local decision and lifecycle artifacts to prevent context drift

The AI recommends and executes one specialist stage at a time. Humans confirm
requirements, boundaries, plans, and workflow transitions.

## Contents

- [Quick Start](#quick-start)
  - [1. Add hGATE to your project](#1-add-hgate-to-your-project)
  - [2. Install the complete hGATE project instructions](#2-install-the-complete-hgate-project-instructions)
  - [3. Start with the guide](#3-start-with-the-guide)
- [Workflow](#workflow)
- [Skill Catalog](#skill-catalog)
- [Persistent Artifacts](#persistent-artifacts)
- [BDD Scenario Viewer](#bdd-scenario-viewer)
- [hGATE Project Viewer](#hgate-project-viewer)
- [Status Report](#status-report)
- [Specification Verifier](#specification-verifier)
- [BDD Traceability Verifier](#bdd-traceability-verifier)
- [Optional Business-Logic Verification](#optional-business-logic-verification)
- [Lifecycle](#lifecycle)
  - [Gates](#gates)
- [Example Prompts](#example-prompts)
  - [Discover a new product area](#discover-a-new-product-area)
  - [Refine one BC](#refine-one-bc)
  - [Implement an approved BC](#implement-an-approved-bc)
  - [Change existing behavior](#change-existing-behavior)
  - [Add a new capability slice to an existing BC](#add-a-new-capability-slice-to-an-existing-bc)
  - [Onboard a brownfield codebase](#onboard-a-brownfield-codebase)
  - [Validate a cross-BC journey](#validate-a-cross-bc-journey)
- [Adoption Levels](#adoption-levels)
- [Core Rules](#core-rules)
- [Why hGATE](#why-hgate)


## Quick Start

### 1. Add hGATE to your project

Clone this repository, then copy the skill directories into your target
repository:

```bash
mkdir -p /path/to/your-project/.github/skills
cp -R skills/* /path/to/your-project/.github/skills/
mkdir -p /path/to/your-project/tools
cp -R tools/bdd-traceability tools/verify-spec tools/shared \
  tools/project-projection tools/project-status tools/gherkin-viewer \
  /path/to/your-project/tools/
```

Preserve each skill's `SKILL.md`, `assets/`, `references/`, and `decisions.md`.
Add the `verify:spec`, `project:sync`, `project:check`, `project:status` and
`verify:bdd` scripts and add `.hgate/` to `.gitignore`, as listed in the
[adoption guide](docs/adoption-guide.md); its GitHub Actions and Bitbucket
Pipelines templates (`templates/ci/`) run every verifier.
The verifier and its human sign-off protocol are required parts of hGATE
adoption for TypeScript/Jest projects. The verifiers parse tests with the
project's own `typescript` package (see
[ADR-007](docs/adr/2026-10-13-typescript-ast-test-discovery.md)).

Goal 3 business-logic verification is optional. When selected for a BC change,
also copy `tools/business-verification`, install `fast-check`, and add the
property scripts described in its README. When declined, record the scoped
rationale in the BC's `decisions.md`; do not create a skipped artifact.

### 2. Install the complete hGATE project instructions

Merge [`templates/CLAUDE.hgate.md`](templates/CLAUDE.hgate.md) into your
project's `CLAUDE.md` or equivalent agent instructions.

If your project has no agent instructions yet, use it as the starting file:

```bash
cp templates/CLAUDE.hgate.md /path/to/your-project/CLAUDE.md
```

If your project already has a `CLAUDE.md`, preserve its architecture, testing,
and engineering conventions and append the complete hGATE template. 

The template includes the mandatory session-start synchronization protocol. It
checks for manual changes, inspects committed diffs, distinguishes
implementation details from behavioral changes, confirms intent with the user,
and reconciles each affected BC's specifications and tests before new work
continues.

Do not copy this repository's root `CLAUDE.md` into another project; it contains
project-specific example guidance. Use the reusable template above.

### 3. Start with the guide

Ask your AI agent:

```text
Use hgate-guide. I want to start using hGATE for this project.
```

The guide will ask what you are trying to accomplish, inspect available
artifacts, and recommend exactly one next skill. It will not start that skill or
advance lifecycle state automatically.

For a brand-new project, the first recommendation will usually be:

```text
Use domain-exploration to understand this problem and identify its domains and
bounded contexts.
```

## Workflow

```text
domain-exploration
  -> bc-refinement              (one BC, thin first slice is enough)
  -> bc-review spec-only        (recommended)
  -> bc-implementation          (one fork per BC)
  -> bc-review full
  -> bc-enhancement             (iterative: new capability, changed rule, bug, gap)
  -> bc-review full             (after each significant enhancement)
  -> cross-bc-validation        (when a journey spans implemented BCs)
```

You do not need a complete specification before first delivery. Refine and
implement a thin first slice, then extend the BC iteratively through
`bc-enhancement` as the domain is better understood.

```text
Brownfield (existing codebase, no hGATE artifacts)
  -> domain-exploration         (code, APIs, schemas, journeys as evidence)
  -> bc-refinement              (produce first-draft spec from existing code)
  -> bc-review full             (surface drift between spec and code)
  -> bc-enhancement             (close drift, bugs, and gaps)
```

Use `architecture-decision-exploration` when business boundaries are already
understood but a technical or cross-system architecture decision remains open.

## Skill Catalog

| Skill | Use it when | Main output | Fork |
| --- | --- | --- | --- |
| `hgate-guide` | You do not know the next workflow step | One recommended skill with inputs and completion signal | No |
| `domain-exploration` | The problem, language, capabilities, or BC boundaries are unclear | Confirmed domain map, context map, and BC handoffs | Yes |
| `architecture-decision-exploration` | A technical or cross-system architecture decision is unresolved | ADR or design report | Yes |
| `bc-refinement` | One BC needs an approved specification | BC skill, domain model, BDD scenarios, decisions, status, and ACLs | Yes |
| `bc-review` | One BC needs a read-only specification or implementation audit | Evidence-based findings, persisted as gate evidence under `docs/verification/bc-reviews/` | One BC per invocation |
| `bc-implementation` | One refined BC has no material implementation | Tested implementation, traceability report, and module sign-off | Yes |
| `bc-enhancement` | An implemented BC needs new capability, a changed rule, a bug fix, or a gap closed — including iterative slices after first delivery | Synchronized specification/code, ghost behavior removed, and module sign-off | Yes |
| `cross-bc-validation` | One completed journey crosses several implemented BCs | Feature-local contract and journey validation report | Yes |

## Persistent Artifacts

```text
docs/
  domain-map.md                 # confirmed domains, BCs, and ownership
  context-map.md                # relationships between BCs
  hgate-project.json            # derived machine-readable project projection
  hgate-project.schema.json     # schema for projection validation
  adr/                          # one file per cross-cutting decision
  verification/bdd-signoffs/
    <module>/                   # immutable BDD-to-TDD human sign-offs
  verification/property-signoffs/
    <module>/                   # immutable, separately approved Goal 3 evidence
  verification/bc-reviews/
    <bc>/                       # persisted bc-review reports (gate evidence)
  features/<feature>/
    validation.md               # one cross-BC journey report

.github/skills/<bc-name>/
  SKILL.md                      # BC purpose, rules, lifecycle, module design
  domain-model.md               # aggregates, values, ports, and persistence
  bdd-scenarios.md              # business scenarios with stable traceability IDs
  properties.md                 # optional universal/bounded-universal claims
  decisions.md                  # decisions owned by this BC
  status.md                     # lifecycle state, gate evidence, open items
  *-acl.md                      # external contract translation

.hgate/status.json              # derived git status report (gitignored)
```

Decision and status files are local to their owning skill or BC. hGATE does not
use global append-only decision or lifecycle files because they create merge
conflicts during parallel work.

`docs/hgate-project.json` is the single canonical machine-readable projection
used by the project viewer. Authoritative Markdown remains the source of truth,
and BC-local `status.md` remains authoritative for lifecycle. The projection is
generated, not hand-edited, by `tools/project-projection/generate.mjs`
(see [`tools/project-projection/README.md`](tools/project-projection/README.md)):
stable IDs, deterministic ordering, no timestamps, and schema validation.
Projects without the projection remain supported through their legacy Markdown
maps.

`.hgate/status.json` is a second, git-derived output: it is never committed and
never drift-checked (see [Status Report](#status-report)).

## BDD Scenario Viewer

`tools/gherkin-viewer/index.html` is a standalone, dependency-free page for
reading `bdd-scenarios.md` files without parsing raw Gherkin/Markdown by eye.

Open it directly in a browser (no server or build step required):

```bash
open tools/gherkin-viewer/index.html
```

Then click **Load project** and select your project's root folder. The viewer
finds the skills folder (`.github/skills`, `.claude/skills`, `.agents/skills`
or `.codex/skills`) and shows every bounded context as a pill, grouped by
domain; click one to render its `bdd-scenarios.md`. A skill folder counts as a
bounded context when it contains `bdd-scenarios.md`, `domain-model.md` or
`status.md`, so hGATE's own workflow skills are ignored. Bounded contexts
without scenarios appear disabled, and scenario files for folders missing from
`docs/domain-map.md` are listed under "Not in domain map". The same project
loads the Project tab.

In Chromium-based browsers only `docs/` and the skills folder are opened, so
large folders such as `node_modules` are never read. Other browsers fall back to
a standard folder upload, which lists the whole folder first. **Open file** still
renders a single scenario file, and you can paste Markdown directly. The viewer:

- extracts fenced ` ```gherkin ` blocks from the Markdown and renders each
  `Feature` as a collapsible section
- renders `Background` steps in a distinct highlighted block per feature
- renders each `Scenario`/`Scenario Outline` as its own card with
  color-coded `Given`/`When`/`Then`/`And`/`But` steps
- shows each scenario's `@scenario:<id>` tag as a pill for quick traceability
  back to tests
- supports live filtering by tag, scenario title, or step text, and a
  "Collapse all features" control for scanning large files

## hGATE Project Viewer

The viewer prefers `docs/hgate-project.json` to render a project-wide view of
domains, bounded contexts, relationships, and journeys, while retaining legacy
Markdown support. It reads schema versions 1 and 2. Schema version 2 adds, per
BC, `transitions`, `gates`, `gateStatus` (required gates of the current
transition, evaluated by the same rules as `verify-spec`), `blockers`,
`nextSkill`, `openItems`, `stats` (rules, scenarios, features, decisions,
properties, ACLs, ports, open items) and `signoffs`, plus top-level `gaps` (the
merged gap ledger, each gap `RESOLVED`, `PARTIAL`, `MIXED`, `DEFERRED` or
`OPEN`) and `diagnostics` (warnings).

Reading guide for tech leads and PMs: [`docs/viewer-guide.md`](docs/viewer-guide.md)
(also behind the viewer's **?** button).

Open `tools/gherkin-viewer/index.html`, click **Load project** and pick the
project root folder. Besides the Scenarios and Project tabs:

- **Board tab:** lifecycle swimlanes with one card per BC (classification,
  next skill, blockers, stats, and an `n/m gates` count that turns red and
  lists the unmet gates when the current state is not backed by its gates),
  the gap ledger, and the diagnostics panel. Legends and hover tooltips
  explain every badge, state and abbreviation.
- **Gap ledger:** a panel styled by its most severe gap: red "Gaps need
  attention" for `OPEN` or `MIXED`, amber "Gaps pending" for `PARTIAL` or
  `DEFERRED`, a collapsed neutral line when all are resolved. Count chips,
  unresolved gaps first, resolved behind **Show resolved (n)**. `PARTIAL`
  (blue badge) is not drift and counts as an open gap on BC cards.
- **Drift banner:** a warning count shown at the top of every tab while any
  warning exists; it cannot be dismissed. Affected BC cards and gap rows carry
  an amber badge, and the Board opens with the drift list expanded.
- **BC details:** three change summaries at the top (since last transition,
  since previous commit, uncommitted), then a step-by-step timeline of
  transitions with their gates, signers and evidence; each step expands
  to its semantic diff (scenarios, rules, decisions, model sections, ports,
  ACLs, gates, open items). Change summaries come from `.hgate/status.json`;
  when it is missing the timeline shows transitions only, with a hint to run
  `npm run project:status`. Transitions recorded in one commit share that
  commit, and the diff appears on the last of them; without git history a
  step's changes show as "Unknown".

The JSON is derived, not a place to decide boundaries or status. Update the
owning Markdown first, then regenerate and validate it against
`docs/hgate-project.schema.json`:

```bash
npm run project:sync    # node tools/project-projection/generate.mjs --root .
npm run project:check   # same, but exits 1 on drift; use in hooks and CI
```

A project whose local `docs/hgate-project.schema.json` is still version 1 gets
an `HGP003` "projection schema upgrade required" message; copy the version 2
schema from this repository.

## Status Report

`npm run project:status` (`tools/project-status/generate.mjs`) writes the
gitignored `.hgate/status.json`. It attributes each `status.md` Transition
History row (newest-first or oldest-first) to its commit with `git blame -M`,
snapshots the BC's specification at each step, and records what changed per
step, since the last transition, since the previous commit, and in the
uncommitted working tree. `--bdd` embeds `verify:bdd` coverage. No timestamps
and no LLM calls; the same repository state gives the same file.

Limitations: it needs full history (`fetch-depth: 0` in GitHub Actions,
`clone: depth: full` in Bitbucket); without git or in a shallow clone it still
exits 0 with a warning, and step commits are `null`. A squash merge collapses
its transitions into one step; blame credits a row to the commit that last
edited it. See
[`tools/project-status/README.md`](tools/project-status/README.md).

## Specification Verifier

`tools/verify-spec/verify.mjs` is a dependency-free CLI that replaces the
mechanical `bc-refinement` Phase 6 self-checks and the `bc-implementation`
Phase 1 readiness checks (aggregate/class, event table/files, ACL docs,
glossary, scenario tags, Ports table, lifecycle). It prints failures only, with
stable `VSP###` codes and `file:line`:

```bash
node tools/verify-spec/verify.mjs --root . [--bc <name>] [--phase implementation]
```

It also checks lifecycle gate evidence (`HGS001`–`HGS007`) for every BC with a
`status.md`, including `DISCOVERED` BCs that have no spec files yet (summary:
`N BC(s) (spec X, gates Y)`), using the gate rules it shares with
`project:sync` (`tools/shared/gate-rules.mjs`), and reports gap drift. Warnings (`HGS006` legacy `status.md`, `HGW001` gap disposition drift,
`HGW002` gap only in a BC `status.md`) print last as a `WARNINGS (n)` block,
never change the exit code, and are project-wide (they ignore `--bc`);
`project:sync` and `project:check` print the same `HGW` block.

See [`tools/verify-spec/README.md`](tools/verify-spec/README.md).

## BDD Traceability Verifier

`tools/bdd-traceability/verify.mjs` deterministically checks adopted
TypeScript/Jest projects for globally unique scenario IDs, uncovered scenarios,
and test references to unknown IDs:

```bash
node tools/bdd-traceability/verify.mjs --root .
```

Add the command to the adopting project's `package.json` and required CI gates:

```json
{
  "scripts": {
    "verify:bdd": "node tools/bdd-traceability/verify.mjs --root ."
  }
}
```

See [`tools/bdd-traceability/README.md`](tools/bdd-traceability/README.md) for
the TypeScript/Jest contract, scan options, reports, and exit codes.

Implementation and behavioral enhancement close through the
[`BDD-to-TDD human sign-off loop`](tools/bdd-traceability/signoff-loop.md).
The verifier runs repository-wide, while each immutable approval record is
stored under `docs/verification/bdd-signoffs/<module-slug>/`.

## Optional Business-Logic Verification

After BDD/TDD, hGATE can optionally verify universal business invariants through
property-based Jest tests and exhaustive finite-state checks where the complete
bounded state space is practical:

```bash
node tools/business-verification/verify.mjs --root .
```

`bc-implementation` and behavioral `bc-enhancement` ask whether Goal 3 is
wanted for the current change. An opted-in BC specifies independent
`@property:<ID>` claims in `properties.md`; Jest tests reference them as
`[PROP:<ID>]`. Generated checks use `fast-check` against production code via
`hgateProperty`/`hgateFiniteModel`; a `[PROP:<ID>]` test whose body does not
execute the declared technique is not coverage (`PROP011`/`PROP012`).
Finite models state exact states, commands, inputs, and depth bounds. Every
property declares an `Oracle source` and an `Oracle independence` statement;
subject and oracle never share an implementation path, and the verifier
rejects missing sources or statements (`PROP040`/`PROP041`).

Each property also carries a `Risk` tier and risk-tiered sensitivity evidence
(mutation testing, known-bad fixture, injected defect, oracle violation, or
regression counterexample) showing it fails when its defect is present; see
`tools/business-verification/README.md`.

Goal 3 has its own traceability command, failure semantics, counterexample
contract, human approval, and immutable artifact under
`docs/verification/property-signoffs/<module-slug>/`. BDD examples and
universal claims never substitute for one another. External SMT/proof-language
support is deferred until a concrete high-consequence pilot can also address
model-to-code correspondence.

See
[`tools/business-verification/README.md`](tools/business-verification/README.md).

## Lifecycle

```text
DISCOVERED
  -> REFINING
  -> REFINED
  -> SPEC_REVIEWED              (recommended, policy-dependent)
  -> IMPLEMENTING
  -> IMPLEMENTED
  -> VERIFIED
```

Changes to an implemented BC use:

```text
IMPLEMENTED | VERIFIED
  -> CHANGING
  -> IMPLEMENTED
  -> VERIFIED
```

`BLOCKED` (with a recorded return state) and `DEPRECATED` side states also
exist; see
[`lifecycle-status.md`](skills/hgate-guide/references/lifecycle-status.md).
Every BC owns its lifecycle in `.github/skills/<bc-name>/status.md`.

### Gates

A BC enters a state only through the gates of that transition, listed in the
catalog
[`skills/hgate-guide/references/lifecycle-gates.md`](skills/hgate-guide/references/lifecycle-gates.md).
Gate kinds: **H** human approval (named signer with role: Tech lead, Technical
PM, or Product owner), **D** deterministic tool result (`verify-spec`,
`verify:bdd`, `project:check`), **R** record only (for `BLOCKED`). Every
transition requires `GATE-PROJ-SYNC`.

Each BC records results in the `## Gate Evidence` table of its `status.md`
(transition, gate, kind, result, evidence, signer, date); rows are
append-only. The Transition History table may be newest-first or oldest-first;
tools normalise it to chronological order. Write order: gate rows first, then the Transition History row, then
`lifecycle:` and Current State. `bc-review` persists its report under
`docs/verification/bc-reviews/<bc>/YYYY-MM-DD-<mode>.md` as evidence for
`SPEC_REVIEWED` and `VERIFIED`. `verify-spec` fails when the current lifecycle
lacks a passing gate.

The `status.md` Open Items table has an `ID` column: gap IDs (`G<n>`) shared
with the domain and context maps, or local `OI-<n>`. Resolving a gap updates
its disposition in every table that lists it; differences surface as `HGW001`.
A disposition such as "Resolved for X; Y to confirm" is `PARTIAL`, not drift.

## Example Prompts

### Discover a new product area

```text
Use domain-exploration. We want customers to request refunds, but we have not
identified the business capabilities or bounded contexts yet.
```

### Refine one BC

```text
Use bc-refinement for the Refund Decisions BC. Use the confirmed domain and
context maps as input. Do not design another BC in this session.
```

### Implement an approved BC

```text
Use bc-implementation for the Refund Decisions BC. Its specification is
approved. Implement it test-first in a forked context.
```

### Change existing behavior

```text
Use bc-enhancement for the Refund Decisions BC. Approved refunds now expire
after seven days. Update the specification first and remove contradictory old
behavior.
```

### Add a new capability slice to an existing BC

```text
Use bc-enhancement for the Refund Decisions BC. We now need to support partial
refunds. The initial implementation only handled full refunds. Update the
specification first, then implement the new slice.
```

### Onboard a brownfield codebase

```text
Use domain-exploration. This is an existing e-commerce platform with no hGATE
artifacts. Use the current codebase, API routes, database schema, and team
knowledge as evidence to identify the domains and bounded contexts.
```

```text
Use bc-refinement for the Order Management BC. There is no existing
specification. Read the current source code, API contracts, and database schema
as evidence and produce a first-draft specification of what the BC currently
does and is intended to do.
```

### Validate a cross-BC journey

```text
Use cross-bc-validation for the Refund Completion journey across Refund
Decisions and Payments. Validate contracts and runtime wiring without modifying
either BC.
```

## Adoption Levels

- **Lite:** domain exploration when needed, refinement, implementation, and
  enhancement
- **Standard:** Lite plus the guide, persistent maps, lifecycle tracking, and BC
  reviews
- **Enterprise:** Standard plus ADRs, required independent reviews, and
  cross-BC validation

See [the adoption guide](docs/adoption-guide.md) for new-project and
existing-codebase adoption, artifact ownership, parallel team practices, and
completion checks.

## Core Rules

1. Every session reconciles manual changes before starting new work.
2. One BC per refinement, implementation, review, or enhancement session.
3. Ask and confirm rather than silently closing requirement gaps.
4. Specifications describe current behavior, not change history.
5. Initial implementation uses tests before production behavior.
6. Existing behavior changes use `bc-enhancement`, not `bc-implementation`.
7. Cross-BC dependencies use published contracts, ports, events, and ACLs.
8. Cross-BC validation is read-only; fixes return to the owning BC.
9. Decisions and lifecycle state stay local to their owner.
10. Every BDD scenario has a stable ID referenced by meaningful executable
    tests.
11. Initial implementation and behavioral enhancement close only after explicit
    human BDD-to-TDD sign-off recorded for the owning module.
12. A trivial, no-spec-impact change may take `bc-enhancement`'s fast path only
    with explicit human confirmation; default to the full pipeline otherwise.
13. The global project projection is derived from localized authoritative
    artifacts and must be synchronized and validated after projected changes.
14. Goal 3 property/model verification is optional per BC change, separately
    specified and signed off, and never reported as unbounded proof.
15. A lifecycle transition is recorded only after its gates pass and their
    evidence is written to the BC's `status.md`.

## Why hGATE

hGATE is most valuable when:

- A project is expected to live for years
- Multiple engineers or AI agents work in parallel
- Business rules evolve frequently
- Regression costs are material

It optimizes for **time to reliable change**, not PR count. The framework reduces
forgotten decisions, contradictory requirements, duplicated business rules,
ghost behavior, context drift, and tribal knowledge.

It works equally well on greenfield and brownfield projects. On brownfield
codebases, `domain-exploration` and `bc-refinement` use the existing code,
APIs, and schemas as evidence to produce first-draft specifications; `bc-review
full` then surfaces drift between the spec and the code.

Presentation:
[Google Slides](https://docs.google.com/presentation/d/1Rlt7gmf7c9DqZFTiga4myCYpJbLtBvQvo3i-W0Aq9dw/edit?slide=id.g3f455ea9a55_0_95#slide=id.g3f455ea9a55_0_95)

Video:
[YouTube](https://www.youtube.com/watch?v=oNJZR_BFW-c)
