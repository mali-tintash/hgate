Reference for the "Phase 6 — Validation" section of `SKILL.md`. Loaded on demand; the section heading lives in `SKILL.md`.

After updating all files, self-check:

1. Every aggregate in `SKILL.md` has a corresponding class in `domain-model.md`.
2. Every domain event in the SKILL.md event table has a matching `.event.ts` in the module tree.
3. Every business rule in `SKILL.md` has at least one BDD scenario that tests it.
4. Every external integration mentioned in `SKILL.md` has a corresponding `*-acl.md` file.
5. No VO Discipline violations remain (string wrappers as VO classes).
6. All ubiquitous language terms in `bdd-scenarios.md` match the glossary in `SKILL.md`.
7. **BC Isolation check**: Does any port, method, service, or aggregate in this BC exist solely to serve an adjacent BC? If yes, flag as cross-BC contamination and move to the Deferred Items log.
8. **YAGNI check**: Does any port, method, or concept only make sense once a BC that does not yet exist is built? If yes, flag as YAGNI contamination and move to the Deferred Items log.
9. Every concluded BC decision from the session is recorded in this BC's
   `decisions.md`; cross-cutting decisions link to standalone ADRs.
10. The BC-local `status.md` reflects `REFINED` only after user approval and all
    validation checks pass.
11. Every Scenario/Scenario Outline has one valid, repository-unique
    `@scenario:<ID>` tag; no ID is duplicated or reused.
12. `domain-model.md` contains the structured Ports table and every port has a
    name, direction, purpose, and contract.
13. If the refined authoritative artifacts changed projected information, run
    `npm run project:sync` (`node tools/project-projection/generate.mjs --root .`)
    and then `npm run project:check`. Never hand-edit `docs/hgate-project.json`.
    Ensure each `*-acl.md` has `acl`/`system`/`direction` frontmatter, the
    `domain-model.md` Ports table is complete, and `docs/domain-map.md` has the
    `**Project:**` line and inventory rows the generator reads. The generator
    validates against `docs/hgate-project.schema.json`; fix the Markdown if it
    reports problems.
14. If Goal 3 was explicitly selected, every property declaration has complete
    metadata and one valid, repository-unique `@property:<ID>`; no property
    merely restates one named BDD example.

Report any violations to the user after completing the update.

The projection is derived and cannot introduce a decision absent from the
Markdown artifacts. If required projected information is unconfirmed, record
the schema's `UNCONFIRMED` value or return to the authoritative artifact rather
than deciding it in JSON. A refinement is not complete when projected
authoritative information changed and the projection is stale or invalid.

---
