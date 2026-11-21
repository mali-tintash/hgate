# Domain Map

**Project:** Example commerce project
**Description:** Illustrates the hGATE machine-readable project projection.

## Domain Inventory

| Domain ID | Domain/Subdomain | Classification | Business purpose | Owner | Status |
|---|---|---|---|---|---|
| `commerce` | Commerce | Core | Turn an approved customer selection into a fulfilled order. | Product | Confirmed |

## Bounded Context Inventory

| BC ID | Bounded context | Domain/Subdomain | Classification | Boundary role | Owns | Does not own | Local status | Source artifacts |
|---|---|---|---|---|---|---|---|---|
| `catalog` | Catalog | Commerce | SUPPORTING | SHARED | Product browsing | Order submission | `.github/skills/catalog/status.md` | `.github/skills/catalog/SKILL.md` |
| `ordering` | Ordering | Commerce | CORE | PRIMARY | Order submission | Product catalog | `.github/skills/orders/status.md` | `.github/skills/orders/SKILL.md` |

## Business Capabilities

| Capability | Owning BC | Trigger | Outcome | Status |
|---|---|---|---|---|
| Browse products | `catalog` | Customer opens the catalog | Available products are returned | Confirmed |
| Create order | `ordering` | Customer submits an approved cart | OMS accepts the order | Confirmed |

## Open Boundary Gaps

| ID | Gap | Affected BCs | Owner | Disposition |
|---|---|---|---|---|
| G3 | Channel fallback when the tenant channel is missing | Catalog | Tech lead | Deferred |
| G11 | Product taxonomy and starter assortment | Both | Product owner | Deferred to bc-refinement |
| G12 | Catalog cache size and eviction limits | Catalog | Product owner | Deferred to bc-refinement |
| G13 | Search provider and cost controls | Catalog | Product owner | Deferred to architecture-decision-exploration |

## Related Artifacts

- Context map: `docs/context-map.md`
