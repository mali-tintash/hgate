Reference for the "Phase 2 — Change Analysis" section of `SKILL.md`. Loaded on demand; the section heading lives in `SKILL.md`.

Describe the enhancement in structured terms:

```
## Change Summary

### What triggered this change
[One sentence — requirement change, PR feedback, design decision, etc.]

### New behaviour (being introduced)
[Numbered list of what the code should do after the change]
```

### Phase 2a — Consequence Interview (mandatory)

Before identifying ripple effects yourself, **ask the user explicit consequence questions**
based on the new behaviour. The AI cannot always know which old behaviours should survive
and which should be replaced — only the user knows the full business intent.

For every significant new behaviour introduced, ask the corresponding "does the old way
still apply?" question. Ask all questions at once as a numbered list — do not ask one at
a time.

**Question template:**

```
Before I plan the implementation, I need to confirm how the new behaviour affects
existing flows. Please answer each question:

1. Now that [new behaviour X] exists, should [old behaviour Y] still happen, or is [X]
   its replacement?

2. Now that [new endpoint / flow Z] handles [outcome], should any existing code path
   that previously produced the same outcome be removed?

3. [Any other "does this survive?" question for each old flow touched by the change]
```

**Example (the incident that prompted this skill):**

> New behaviour: a `close` endpoint is added that creates `ProductActivation` records
> for all approved items at close time.
>
> Consequence question the AI must ask:
> *"Now that the close endpoint creates ProductActivations, should individual item
> approval still create a ProductActivation immediately, or is that behaviour fully
> replaced by the close endpoint?"*
>
> Without asking this, the AI would add the close endpoint correctly but leave the
> per-item creation in place — producing ghost behavior where both paths run.

**Do not proceed to Phase 2b until the user has answered all consequence questions.**

### Phase 2a.1 - Optional Goal 3 decision

For every behavioral enhancement, ask:

> Do you want Goal 3 business-logic verification for this BC change?

This choice is optional at every adoption level and applies only to the current
change scope.

If declined, record the scope and supplied rationale as a concluded
**Asked -> Findings -> Decision/Action** entry in the BC's `decisions.md`. Do
not create a skipped property sign-off artifact. Continue with the normal
BDD-to-TDD path.

If accepted, Phase 3 must create or update `properties.md` from
`bc-refinement/assets/properties-template.md`, and update
`property-discovery.md` (from `bc-refinement/assets/property-discovery-template.md`)
by re-running the discovery procedure in `bc-refinement` section 5e for every
changed or new rule across all candidate families. Keep universal property
claims separate from concrete BDD examples.
Each new or changed property needs `Risk` and `Sensitivity`; changed production logic or a changed claim invalidates old `Sensitivity-Evidence`, so re-observe the failure and re-record it.

### Phase 2b — Ripple Effect Analysis

Using the user's answers from Phase 2a, produce:

```
### Old behaviour confirmed REMOVED (user confirmed)
- [behaviour] in [file] — will be deleted

### Old behaviour confirmed SURVIVING (user confirmed)
- [behaviour] in [file] — will NOT be touched

### Additional ripple effects
- [Every other file/method that must change as a consequence]
```

If the ripple scope is larger than the user expected, flag it before proceeding:

```
⚠️ This change has wider scope than the initial request.
In addition to [requested change], implementing this correctly also requires:
  - [ripple effect 1]
  - [ripple effect 2]

Proceed with full scope? [yes / no — or describe narrower scope]
```

---
