Reference for the "Phase 3 — Skill File Sync" section of `SKILL.md`. Loaded on demand; the section heading lives in `SKILL.md`.

Update the skill files to reflect the new behaviour **before writing any source code**.
The updated skill becomes the specification the implementation must match.

Files that commonly need updates:

| Changed | Update |
|---|---|
| A new endpoint added or removed | `SKILL.md` → API Endpoints table; `bdd-scenarios.md` → add scenario(s) for the new endpoint |
| A lifecycle step changed | `SKILL.md` → lifecycle section; `bdd-scenarios.md` → affected scenario |
| A business rule changed | `SKILL.md` → Core Business Rules (renumber if needed); `bdd-scenarios.md` → affected scenario |
| A new DB column or table | `domain-model.md` → Sequelize model section; `docs/schema/hGATE-portal.dbml` → affected table block |
| An aggregate field added/removed | `domain-model.md` → aggregate block; `bdd-scenarios.md` → any scenario that creates or reads this aggregate must assert the new field |
| A request/response field added/removed | `bdd-scenarios.md` → update `When` steps that supply the field and `Then` steps that assert what is stored or returned |
| An external API call moved or added | relevant `*-acl.md` |
| A port method added/removed | `domain-model.md` → port interface block |
| A port added/removed or its purpose/contract changes | `domain-model.md` → structured Ports table |
| A business or architectural choice is concluded | `decisions.md` → add one Asked / Findings / Decision/Action entry |
| Goal 3 is selected | `properties.md` → add or update stable universal claims, generators/models (including adequacy fields), oracles (with `Oracle source` and `Oracle independence`), and bounds |
| Goal 3 is declined | `decisions.md` → record scoped decline and rationale; create no property artifact |

Scenario ID rules during enhancement:

- New scenarios receive a new repository-unique `@scenario:<ID>`.
- Unchanged behavior retains its existing ID, even when wording is clarified.
- A materially changed business outcome receives a new ID.
- Removed scenarios are deleted from the current specification; record the
  retired ID and replacement, if any, in `decisions.md`.
- Remove or update every test reference to a retired ID.
- Never renumber or reuse IDs to make the sequence look contiguous.

### Skill files are specs, not changelogs

Every skill file (`SKILL.md`, `domain-model.md`, `bdd-scenarios.md`, `*-acl.md`) describes the
BC's **current** behaviour. A future reader — human or AI — has no memory of what the design
used to be, and Phase 0 of this very skill treats these files as ground truth for "what the code
does now." Writing them as a diff against the old design corrupts that ground truth and teaches
the same bad habit forward into the next enhancement.

**Do not:**
- Narrate the transition: "previously X", "used to be Y", "no longer Z", "the old
  `denominations[]` shape", "before this change". If a reader needs that history, it's in
  `git log` and the PR description — do not duplicate it into a file that's supposed to be
  timeless.
- Write a scenario or rule whose entire content is an absence: "the response has no `currency`
  field", "there is no root-level `X`". An absence proves nothing about what to do — it's a
  leftover from diffing old-spec against new-spec in your head instead of describing the new
  spec on its own terms. If X is gone, delete every scenario about X and write scenarios only
  for what replaces it.
- Add a rule to a "Core Business Rules" list that only exists to announce a removal (e.g. "field
  Y was removed"). If the removal leaves behind a genuine current fact (e.g. "discount lives in
  `offers[].fees`"), write *that* fact as the rule — the removal is implied by its absence from
  the rest of the document and doesn't need its own line.

**Do:**
- State where the data/behaviour lives now, in positive terms, and stop there.
- Keep a negative statement only when the absence is itself a permanent, load-bearing invariant
  a reader would otherwise get wrong — e.g. "`product_activations.metadata` is an immutable
  snapshot, so rows approved under an older shape permanently lack `variants`/`offers`" is a
  standing architectural fact, not a diff note, because it stays true indefinitely and explains
  defensive code a reader might otherwise assume is dead.
- Apply this to source-code comments too, not just skill files — the same rot applies to a
  comment that says "X is no longer a flattened array" in the implementation.

**Litmus test:** could someone who has never seen the old design understand and act on this
sentence on its own? If it only makes sense by contrast to something that no longer exists,
rewrite it in terms of current behaviour only.

**Exception — this does not apply to test files.** A unit test asserting
`expect(x).not.toHaveProperty('y')` is a regression guard, not documentation; asserting an
absence there is normal test design.

If the skill files are already correct (the enhancement was driven by a skill update done
separately), state that explicitly:

```
Skill files: already up to date — this change implements the design already documented.
```

**Do not proceed to Phase 4 until skill files match the new design.**

Keep decisions local to this BC's `decisions.md`. If a decision affects multiple
BCs, create one standalone ADR under `docs/adr/` and link to it from each
affected BC. Do not use a global append-only decisions file.

---
