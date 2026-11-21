# Context Map

## Context Relationships

| Relationship ID | Provider/Owner BC ID | Consumer BC ID | Information or decision exchanged | Source of truth | Consistency expectation | Candidate interaction | Translation/ACL | Status |
|---|---|---|---|---|---|---|---|---|
| `catalog-to-ordering-product-selection` | `catalog` | `ordering` | Selected product identity | Catalog | Immediate | Request-response | No | Confirmed |

## Cross-BC Journeys

| Journey ID | Journey | Participating BC IDs | Entry point | Business outcome | Validation artifact |
|---|---|---|---|---|---|
| `place-order` | Place order | `catalog`, `ordering` | Customer browses the catalog | An order is accepted | `docs/features/place-order/validation.md` |

## Open Relationship Gaps

| ID | Relationship | Gap | Owner | Disposition |
|---|---|---|---|---|
| G14 | `catalog-to-ordering-product-selection` | Price snapshot at selection time | Product owner | Open |
| G15 | Both | Sync vs async product lookup | Product owner | Resolved for Catalog (synchronous); Ordering to confirm |
