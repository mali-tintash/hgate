# Cart Domain Model

## Cart (Aggregate Root)

```typescript
// ## not a heading
export class Cart {
  id: string;
}
```

## Ports

| Name | Direction | Purpose | Contract |
|---|---|---|---|
| `PaymentPort` | OUTBOUND | Authorize payment for a submitted cart | `payment-acl.md` |
| `CartSubmittedPublisher` | OUTBOUND | Tell Orders a cart was submitted | `CartSubmitted` event |
| [PortName] | [...] | [...] | [...] |
