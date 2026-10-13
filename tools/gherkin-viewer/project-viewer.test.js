const test = require("node:test");
const assert = require("node:assert/strict");
const viewer = require("./project-viewer.js");

test("parseDomainMap extracts BC roles and capabilities", () => {
  const markdown = `# Domain Map

## Domain Inventory

| Domain/Subdomain | Classification | Business purpose | Owner | Status |
|---|---|---|---|---|
| Commerce | Core | Sell products | Commerce | Confirmed |

## Bounded Context Inventory

| ID | Bounded context | Domain/Subdomain | Classification | Boundary role | Owns | Does not own | Local status |
|---|---|---|---|---|---|---|---|
| ordering | Ordering | Commerce | Core | Primary | Orders | Payments | status.md |

## Business Capabilities

| Capability | Owning BC | Trigger | Outcome | Status |
|---|---|---|---|---|
| Submit order | Ordering | Cart submitted | Order created | Confirmed |
`;
  const parsed = viewer.parseDomainMap(markdown);
  assert.equal(parsed.boundedContexts[0].id, "ordering");
  assert.equal(parsed.boundedContexts[0].role, "PRIMARY");
  assert.equal(parsed.boundedContexts[0].capabilities[0].name, "Submit order");
});

test("parseContextMap preserves relationship direction", () => {
  const contexts = [
    { id: "catalog", name: "Catalog" },
    { id: "ordering", name: "Ordering" },
  ];
  const markdown = `# Context Map

## Context Relationships

| ID | Provider/Owner BC | Consumer BC | Information or decision exchanged | Source of truth | Consistency expectation | Candidate interaction | Translation/ACL | Status |
|---|---|---|---|---|---|---|---|---|
| catalog-ordering | Catalog | Ordering | Product selection | Catalog | Immediate | Request-response | No | Confirmed |
`;
  const parsed = viewer.parseContextMap(markdown, contexts);
  assert.equal(parsed.relationships[0].from, "catalog");
  assert.equal(parsed.relationships[0].to, "ordering");
});

test("legacy parsers recognize the stable ID template headers", () => {
  const domain = viewer.parseDomainMap(`## Domain Inventory

| Domain ID | Domain/Subdomain | Classification | Business purpose | Owner | Status |
|---|---|---|---|---|---|
| customer-commerce | Commerce | Core | Sell products | Team | Confirmed |

## Bounded Context Inventory

| BC ID | Bounded context | Domain/Subdomain | Classification | Boundary role | Owns | Does not own | Local status | Source artifacts |
|---|---|---|---|---|---|---|---|---|
| order-management | Orders | Commerce | CORE | PRIMARY | Orders | Products | status.md | SKILL.md |
`);
  assert.equal(domain.domains[0].id, "customer-commerce");
  assert.equal(domain.boundedContexts[0].id, "order-management");

  const context = viewer.parseContextMap(
    `## Context Relationships

| Relationship ID | Provider/Owner BC ID | Consumer BC ID | Information or decision exchanged | Source of truth | Consistency expectation | Candidate interaction | Translation/ACL | Status |
|---|---|---|---|---|---|---|---|---|
| catalog-to-orders | product-catalog | order-management | Product | Catalog | Immediate | Request-response | None | Confirmed |

## Cross-BC Journeys

| Journey ID | Journey | Participating BC IDs | Entry point | Business outcome | Validation artifact |
|---|---|---|---|---|---|
| place-order | Place order | product-catalog, order-management | Browse | Ordered | validation.md |
`,
    [
      { id: "product-catalog", name: "Catalog" },
      { id: "order-management", name: "Orders" },
    ],
  );
  assert.equal(context.relationships[0].id, "catalog-to-orders");
  assert.equal(context.relationships[0].from, "product-catalog");
  assert.deepEqual(context.journeys[0].boundedContextIds, [
    "product-catalog",
    "order-management",
  ]);
});

test("validateProject rejects dangling relationships", () => {
  const diagnostics = viewer.validateProject({
    schemaVersion: 1,
    project: { name: "Invalid relation" },
    domains: [
      { id: "commerce", name: "Commerce", classification: "CORE", purpose: "Sell" },
    ],
    boundedContexts: [
      {
        id: "ordering",
        name: "Ordering",
        domainId: "commerce",
        classification: "CORE",
        role: "PRIMARY",
        lifecycle: "IMPLEMENTED",
        owns: [],
        doesNotOwn: [],
        capabilities: [],
        ports: [],
        acls: [],
        sources: {},
      },
    ],
    relationships: [
      {
        id: "missing",
        from: "ordering",
        to: "payments",
        information: "Payment",
        status: "Confirmed",
      },
    ],
    journeys: [],
  });
  assert.ok(diagnostics.some((item) => item.message.includes("unknown BC")));
});

test("validateProject rejects incomplete canonical BCs and journeys", () => {
  const diagnostics = viewer.validateProject({
    schemaVersion: 1,
    project: { name: "Invalid" },
    domains: [],
    boundedContexts: [
      {
        id: "ordering",
        name: "Ordering",
        classification: "CORE",
        role: "PRIMARY",
      },
    ],
    relationships: [],
    journeys: [{ id: "place-order", name: "Place order" }],
  });
  assert.ok(diagnostics.some((item) => item.message.includes("unknown domain")));
  assert.ok(diagnostics.some((item) => item.message.includes("invalid lifecycle")));
  assert.ok(diagnostics.some((item) => item.message.includes("Journey place-order")));
});

test("validateProject accepts DEPRECATED lifecycle", () => {
  const diagnostics = viewer.validateProject({
    schemaVersion: 1,
    project: { name: "Valid" },
    domains: [
      { id: "commerce", name: "Commerce", classification: "CORE", purpose: "Sell" },
    ],
    boundedContexts: [
      {
        id: "legacy-ordering",
        name: "Legacy Ordering",
        domainId: "commerce",
        classification: "CORE",
        role: "PRIMARY",
        lifecycle: "DEPRECATED",
        owns: [],
        doesNotOwn: [],
        capabilities: [],
        ports: [],
        acls: [],
        sources: {},
      },
    ],
    relationships: [],
    journeys: [],
  });
  assert.deepEqual(diagnostics, []);
});

test("parsePorts supports the structured ports table", () => {
  const ports = viewer.parsePorts(`## Ports

| Port | Direction | Purpose | Contract/status |
|---|---|---|---|
| OmsPort | Outbound | Create orders | Approved |
`);
  assert.deepEqual(ports[0], {
    name: "OmsPort",
    direction: "OUTBOUND",
    purpose: "Create orders",
    contract: "Approved",
    inferred: true,
  });
});

test("layoutProject is deterministic", () => {
  const project = {
    boundedContexts: [
      { id: "b", name: "B", domainId: "two" },
      { id: "a", name: "A", domainId: "one" },
    ],
  };
  const first = viewer.layoutProject(project);
  const second = viewer.layoutProject(project);
  assert.deepEqual(Array.from(first.positions.entries()), Array.from(second.positions.entries()));
});

test("clampZoom enforces diagram zoom limits", () => {
  assert.equal(viewer.clampZoom(25), 50);
  assert.equal(viewer.clampZoom(125), 125);
  assert.equal(viewer.clampZoom(250), 200);
});

test("abbreviateEdgeLabel bounds graph text while preserving short labels", () => {
  assert.equal(viewer.abbreviateEdgeLabel("Base1Passed"), "Base1Passed");
  assert.equal(
    viewer.abbreviateEdgeLabel("A long relationship decision that cannot fit between nodes"),
    "A long relationship decis…",
  );
});
