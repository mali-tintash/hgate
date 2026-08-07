# Domain Exploration Decisions

## Keep hGATE workflow progression user-driven

**Asked:** Should hGATE automate orchestration, and how should users discover
domains and bounded contexts before BC refinement?

**Findings:** Automatic orchestration would hide important business decisions.
The existing BC refinement and enhancement skills can define cross-BC ports and
events when each affected BC is handled in a separate context. A preceding
discovery step was missing.

**Decision/Action:** Keep workflow progression user-driven. Use
`domain-exploration` as an interactive, confirmation-gated process for
understanding the problem, discovering capabilities, and identifying one or
multiple bounded contexts. Use `architecture-decision-exploration` only for
unresolved technical or cross-system architecture decisions.
