# Cart Domain Model

## Cart (Aggregate Root)

```typescript
export class Cart {
  id: string;
  ownerId: string;
  status: CartStatus;
}
```

## Ports

| Name | Direction | Purpose | Contract |
|---|---|---|---|
| `PaymentPort` | OUTBOUND | Authorize payment for a submitted cart | `PaymentPort` interface in `payment-acl.md` |
| `CartSubmittedPublisher` | OUTBOUND | Tell Orders a cart was submitted | `CartSubmitted` event |

## Sequelize Models (Table Definitions)

⚠️ Tenant schema.

| column | type | constraints |
|---|---|---|
| id | UUID | PK |
