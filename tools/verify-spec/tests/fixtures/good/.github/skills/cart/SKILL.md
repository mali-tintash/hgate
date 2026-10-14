# Cart BC

## Purpose
Owns the shopper's cart until it is submitted for ordering.

## Classification
Core Domain.

## NestJS Module

```text
src/cart/
  domain/
    cart.aggregate.ts
    events/
      cart-submitted.event.ts   # emitted when a cart is submitted
  infrastructure/
    acl/
      payment.client.ts
```

## Key Aggregates
- **Cart**: owner, items, status; lifecycle DRAFT -> SUBMITTED.

## External Integrations
- Payment Gateway — see `payment-acl.md` (contract defined).

## Domain Events Emitted
| Event | Payload | Consumed By |
|---|---|---|
| `CartSubmitted` | `{ cartId, ownerId, submittedAt }` | Orders |

## Core Business Rules
1. A submitted cart cannot be modified.

## Ubiquitous Language
| Term | Meaning | NOT: |
|---|---|---|
| Cart | The shopper's pending purchase | basket, trolley |
| Submit | Hand a cart over for ordering | checkout |

## Related Context Files
- `domain-model.md` — implementation contract
