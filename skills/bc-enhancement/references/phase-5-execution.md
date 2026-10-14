Reference for the "Phase 5 — Execution (Whole-File Awareness)" section of `SKILL.md`. Loaded on demand; the section heading lives in `SKILL.md`.

Apply changes according to the approved plan.

### The editing rule

For every file you open to make a change:
1. Read the method(s) you plan to change and their immediate callers
2. After editing, grep for any identifiers you renamed or deleted to surface stale references:
   ```bash
   grep -rn "oldMethodName\|RenamedType" src/<bc-name>/
   ```
3. Fix any stale references in the same edit session — do not defer

### Execution order

Make changes in this order to avoid broken intermediate states:

1. **Domain ports** — add/remove port methods first so services compile against the correct interface
2. **Domain aggregates/entities** — update fields, enums, status transitions
3. **Application services** — update business logic; remove calls to deleted port methods; add calls to new ones
4. **Infrastructure repositories** — add/remove repository methods to match updated ports
5. **Infrastructure ACL adapters** — update if external API interaction changed
6. **Presentation controllers** — update to call updated service methods; remove calls to deleted methods
7. **DTOs** — add/remove/rename fields to match updated contracts
8. **Tests** — update existing tests first (remove assertions for old behaviour), then add new ones

### No orphan code rule

When you delete a method from a service, immediately check:
- Does any controller still call it? → delete or update the controller call
- Does it still appear in any test mock? → remove from mock

When you add a method to a service, immediately check:
- Does the port interface declare it? → add if missing
- Does at least one controller call it? → add call if missing
- Does the test file mock it? → add to mock

---
