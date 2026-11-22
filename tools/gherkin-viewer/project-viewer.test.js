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

function fakeFile(content) {
  return { text: async () => content };
}

function fakeDirectory(tree, name = "root") {
  const missing = (kind) => {
    const error = new Error(`${kind} not found`);
    error.name = "NotFoundError";
    return error;
  };
  return {
    kind: "directory",
    name,
    async getDirectoryHandle(child) {
      const value = tree[child];
      if (!value || typeof value === "string") throw missing("directory");
      return fakeDirectory(value, child);
    },
    async getFileHandle(child) {
      const value = tree[child];
      if (typeof value !== "string") throw missing("file");
      return { kind: "file", name: child, getFile: async () => fakeFile(value) };
    },
    async *entries() {
      for (const [child, value] of Object.entries(tree)) {
        yield [
          child,
          typeof value === "string"
            ? { kind: "file", name: child, getFile: async () => fakeFile(value) }
            : fakeDirectory(value, child),
        ];
      }
    },
  };
}

test("indexFiles accepts skills under .github, .claude and .agents roots", () => {
  const files = [
    "my-app/docs/domain-map.md",
    "my-app/.claude/skills/ordering/bdd-scenarios.md",
    "my-app/.agents/skills/billing/status.md",
    "my-app/.github/skills/catalog/catalog-acl.md",
    "my-app/.claude/skills/ordering/notes/extra.md",
    "my-app/node_modules/pkg/docs/domain-map.md",
    "my-app/src/index.ts",
  ].map((webkitRelativePath) => ({ webkitRelativePath, name: webkitRelativePath.split("/").pop() }));
  assert.deepEqual(Array.from(viewer.indexFiles(files).keys()).sort(), [
    ".agents/skills/billing/status.md",
    ".claude/skills/ordering/bdd-scenarios.md",
    ".github/skills/catalog/catalog-acl.md",
    "docs/domain-map.md",
  ]);
});

test("skillsRootOf prefers the root that holds bounded-context files", () => {
  const map = new Map([
    [".github/skills/bc-review/SKILL.md", fakeFile("")],
    [".claude/skills/ordering/bdd-scenarios.md", fakeFile("")],
  ]);
  assert.equal(viewer.skillsRootOf(map), ".claude/skills");
  assert.equal(viewer.skillsRootOf(new Map()), ".github/skills");
});

test("buildLegacyProject reads BC artifacts from a .claude/skills root", async () => {
  const map = new Map([
    [
      "docs/domain-map.md",
      fakeFile(`## Bounded Context Inventory

| ID | Bounded context | Domain/Subdomain | Classification | Boundary role |
|---|---|---|---|---|
| ordering | Ordering | Commerce | Core | Primary |
`),
    ],
    [".claude/skills/ordering/status.md", fakeFile("---\nlifecycle: IMPLEMENTED\n---\n")],
  ]);
  const { project } = await viewer.buildLegacyProject(map);
  assert.equal(project.boundedContexts[0].lifecycle, "IMPLEMENTED");
  assert.equal(project.boundedContexts[0].sources.status, ".claude/skills/ordering/status.md");
});

test("listScenarioSources groups BCs by domain, disables missing files and lists unmapped scenarios", () => {
  const project = {
    domains: [{ id: "commerce", name: "Commerce" }],
    boundedContexts: [
      { id: "ordering", name: "Ordering", domainId: "commerce", sources: {} },
      { id: "catalog", name: "Catalog", domainId: "commerce", sources: {} },
    ],
  };
  const map = new Map([
    [".github/skills/ordering/bdd-scenarios.md", fakeFile("")],
    [".github/skills/payments/bdd-scenarios.md", fakeFile("")],
    [".github/skills/bc-review/SKILL.md", fakeFile("")],
  ]);
  assert.deepEqual(viewer.listScenarioSources(project, map), [
    {
      label: "Commerce",
      items: [
        { id: "ordering", name: "Ordering", path: ".github/skills/ordering/bdd-scenarios.md" },
        { id: "catalog", name: "Catalog", path: null },
      ],
    },
    {
      label: "Not in domain map",
      items: [{ id: "payments", name: "payments", path: ".github/skills/payments/bdd-scenarios.md" }],
    },
  ]);
});

test("listScenarioSources works without a domain map", () => {
  const map = new Map([[".claude/skills/ordering/bdd-scenarios.md", fakeFile("")]]);
  assert.deepEqual(viewer.listScenarioSources(null, map), [
    {
      label: "Bounded contexts",
      items: [{ id: "ordering", name: "ordering", path: ".claude/skills/ordering/bdd-scenarios.md" }],
    },
  ]);
});

test("readProjectDirectory reads only docs and skills, never other folders", async () => {
  let nodeModulesOpened = false;
  const root = fakeDirectory({
    docs: { "domain-map.md": "# map", "notes.md": "ignored" },
    ".github": {
      skills: {
        ordering: { "bdd-scenarios.md": "scenarios", "SKILL.md": "skill", "draft.txt": "ignored" },
        "bc-review": { "SKILL.md": "hgate skill" },
      },
    },
    src: { "index.ts": "ignored" },
  });
  const getDirectoryHandle = root.getDirectoryHandle;
  root.getDirectoryHandle = async (name) => {
    if (name === "node_modules" || name === "src") nodeModulesOpened = true;
    return getDirectoryHandle(name);
  };
  const map = await viewer.readProjectDirectory(root);
  assert.equal(nodeModulesOpened, false);
  assert.deepEqual(Array.from(map.keys()).sort(), [
    ".github/skills/bc-review/SKILL.md",
    ".github/skills/ordering/SKILL.md",
    ".github/skills/ordering/bdd-scenarios.md",
    "docs/domain-map.md",
  ]);
  assert.equal(await map.get(".github/skills/ordering/bdd-scenarios.md").text(), "scenarios");
});

test("computeCanvasSize fills the visible area and grows to fit the layout and moved nodes", () => {
  const layout = { width: 820, height: 340 };
  const base = { layout, positions: new Map([["a", { x: 40, y: 65 }]]), nodeWidth: 180, nodeHeight: 80 };
  assert.deepEqual(
    viewer.computeCanvasSize({ ...base, visibleWidth: 1000, visibleHeight: 700, zoom: 1 }),
    { width: 1000, height: 700 },
  );
  assert.deepEqual(
    viewer.computeCanvasSize({ ...base, visibleWidth: 1000, visibleHeight: 700, zoom: 2 }),
    { width: 820, height: 350 },
  );
  assert.deepEqual(
    viewer.computeCanvasSize({
      ...base,
      positions: new Map([["a", { x: 900, y: 600 }]]),
      visibleWidth: 1000,
      visibleHeight: 700,
      zoom: 2,
    }),
    { width: 1120, height: 720 },
  );
});

// --- Board (schema v2) -------------------------------------------------------

const exampleV2 = require("../../docs/hgate-project.example.json");

function v1Project() {
  return {
    schemaVersion: 1,
    project: { name: "V1" },
    domains: [{ id: "commerce", name: "Commerce", classification: "CORE", purpose: "Sell" }],
    boundedContexts: [
      {
        id: "ordering",
        name: "Ordering",
        domainId: "commerce",
        classification: "CORE",
        role: "PRIMARY",
        lifecycle: "REFINED",
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
  };
}

test("validateProject accepts schemaVersion 1 and 2 and rejects others", () => {
  assert.deepEqual(viewer.validateProject(v1Project()), []);
  assert.deepEqual(viewer.validateProject(exampleV2), []);
  const diagnostics = viewer.validateProject({ ...v1Project(), schemaVersion: 3 });
  assert.match(diagnostics[0].message, /expected 1 or 2/);
});

test("normalizeProject gives v1 projects empty defaults for v2 fields", () => {
  const project = viewer.normalizeProject(v1Project(), "canonical");
  assert.equal(project.schemaVersion, 1);
  assert.deepEqual(project.gaps, []);
  assert.deepEqual(project.diagnostics, []);
  const [bc] = project.boundedContexts;
  assert.equal(bc.nextSkill, null);
  for (const field of ["blockers", "transitions", "gates", "openItems", "signoffs"]) {
    assert.deepEqual(bc[field], [], field);
  }
  assert.deepEqual(bc.stats, {});
});

test("buildBoardModel places v1 BCs in main columns and hides empty optional states", () => {
  const board = viewer.buildBoardModel(viewer.normalizeProject(v1Project(), "canonical"));
  assert.deepEqual(
    board.columns.map((column) => column.state),
    viewer.MAIN_LIFECYCLES,
  );
  assert.deepEqual(board.hiddenStates, ["CHANGING", "BLOCKED", "DEPRECATED"]);
  const refined = board.columns.find((column) => column.state === "REFINED");
  assert.equal(refined.cards[0].id, "ordering");
  assert.equal(refined.cards[0].gateSummary.total, 0);
  assert.equal(refined.cards[0].stats.openGaps, null);
  assert.deepEqual(board.gaps, []);
  assert.equal(board.warnings.count, 0);
  assert.equal(board.warnings.expanded, false);
});

test("buildBoardModel shows an optional column only when a BC occupies it", () => {
  const raw = v1Project();
  raw.boundedContexts[0].lifecycle = "BLOCKED";
  const board = viewer.buildBoardModel(viewer.normalizeProject(raw, "canonical"));
  const blocked = board.columns.find((column) => column.state === "BLOCKED");
  assert.equal(blocked.optional, true);
  assert.equal(blocked.cards.length, 1);
  assert.deepEqual(board.hiddenStates, ["CHANGING", "DEPRECATED"]);
});

test("buildBoardModel builds v2 cards with date, next skill, blockers, stats and sign-offs", () => {
  const board = viewer.buildBoardModel(viewer.normalizeProject(exampleV2, "canonical"));
  const verified = board.columns.find((column) => column.state === "VERIFIED");
  const catalog = verified.cards.find((card) => card.id === "catalog");
  assert.equal(catalog.lifecycleDate, "2026-11-20");
  assert.equal(catalog.nextSkill, "bc-enhancement");
  assert.equal(catalog.blocked, true);
  assert.equal(catalog.blockers.length, 2);
  assert.deepEqual(catalog.stats, { rules: 3, scenarios: 3, decisions: 2, openGaps: 4 });
  assert.equal(catalog.signoffCount, 3);
  assert.equal(catalog.gateSummary.label, "2/2 gates");
  assert.equal(catalog.gateSummary.transition, "IMPLEMENTED -> VERIFIED");
});

test("summarizeGates keeps the latest row per gate and highlights failures", () => {
  const bc = {
    lifecycle: "REFINED",
    gates: [
      { transition: "REFINING -> REFINED", gate: "GATE-REF-SPEC", result: "FAIL", date: "2026-11-09" },
      { transition: "REFINING -> REFINED", gate: "GATE-REF-SPEC", result: "PASS", date: "2026-11-10" },
      { transition: "REFINING → REFINED", gate: "GATE-REF-APPROVAL", result: "FAIL", date: "2026-11-10" },
      { transition: "REFINING -> REFINED", gate: "GATE-PROJ-SYNC", result: "N/A", date: "2026-11-10" },
      { transition: "- -> DISCOVERED", gate: "GATE-DISC-BOUNDARY", result: "PASS", date: "2026-11-01" },
    ],
  };
  const summary = viewer.summarizeGates(bc);
  assert.equal(summary.source, "gates");
  assert.equal(summary.total, 3);
  assert.equal(summary.satisfied, 1, "N/A on a gate is unmet in the fallback");
  assert.equal(summary.label, "1/3 gates");
  assert.equal(summary.hasFail, true);
  assert.equal(summary.invalid, true);
  assert.deepEqual(summary.failedGates, ["GATE-REF-APPROVAL"]);
  assert.deepEqual(summary.unmetGates, ["GATE-REF-APPROVAL (FAIL)", "GATE-PROJ-SYNC (N/A)"]);
});

test("summarizeGates fallback ignores rows dated before the current transition and the optional GATE-IMPL-PROPS", () => {
  const summary = viewer.summarizeGates({
    lifecycle: "IMPLEMENTED",
    transitions: [
      { date: "2026-10-01", from: "IMPLEMENTING", to: "IMPLEMENTED" },
      { date: "2026-10-05", from: "IMPLEMENTED", to: "CHANGING" },
      { date: "2026-11-01", from: "CHANGING", to: "IMPLEMENTED" },
    ],
    gates: [
      { transition: "CHANGING -> IMPLEMENTED", gate: "GATE-IMPL-BDD", result: "PASS", date: "2026-10-30" },
      { transition: "IMPLEMENTING -> IMPLEMENTED", gate: "GATE-IMPL-SIGNOFF", result: "PASS", date: "2026-10-01" },
      { transition: "CHANGING -> IMPLEMENTED", gate: "GATE-IMPL-SIGNOFF", result: "PASS", date: "2026-11-01" },
      { transition: "CHANGING -> IMPLEMENTED", gate: "GATE-IMPL-PROPS", result: "N/A", date: "2026-11-01" },
    ],
  });
  assert.equal(summary.label, "1/1 gates");
  assert.equal(summary.valid, true);
  assert.equal(summary.invalid, false);
});

test("summarizeGates uses projection gateStatus: missing required gates and N/A are unmet", () => {
  const summary = viewer.summarizeGates({
    lifecycle: "REFINED",
    gates: [
      { transition: "REFINING -> REFINED", gate: "GATE-REF-SPEC", result: "PASS", date: "2026-11-10" },
      { transition: "REFINING -> REFINED", gate: "GATE-PROJ-SYNC", result: "N/A", date: "2026-11-10" },
    ],
    gateStatus: {
      transition: "REFINING -> REFINED",
      required: [
        { gate: "GATE-REF-SPEC", kind: "D", result: "PASS", date: "2026-11-10", satisfied: true },
        { gate: "GATE-REF-APPROVAL", kind: "H", result: null, date: null, satisfied: false },
        { gate: "GATE-PROJ-SYNC", kind: "D", result: "N/A", date: "2026-11-10", satisfied: false },
      ],
      optional: [],
      satisfied: 1,
      total: 3,
      valid: false,
    },
  });
  assert.equal(summary.source, "gateStatus");
  assert.equal(summary.label, "1/3 gates");
  assert.equal(summary.invalid, true);
  assert.equal(summary.transition, "REFINING -> REFINED");
  assert.deepEqual(summary.unmetGates, ["GATE-REF-APPROVAL (no row)", "GATE-PROJ-SYNC (N/A)"]);
});

test("buildBoardModel reads gateStatus from the example projection", () => {
  const board = viewer.buildBoardModel(viewer.normalizeProject(exampleV2, "canonical"));
  const catalog = board.cards.find((card) => card.id === "catalog");
  assert.equal(catalog.gateSummary.source, "gateStatus");
  assert.equal(catalog.gateSummary.valid, true);
  const ordering = board.cards.find((card) => card.id === "ordering");
  assert.equal(ordering.gateSummary.label, "0/3 gates");
  assert.equal(ordering.gateSummary.invalid, true);
  assert.deepEqual(ordering.gateSummary.unmetGates, [
    "GATE-IMPL-BDD (no row)",
    "GATE-IMPL-SIGNOFF (no row)",
    "GATE-PROJ-SYNC (no row)",
  ]);
});

test("buildBoardModel badges MIXED gaps and drift warnings on gap rows and BC cards", () => {
  const board = viewer.buildBoardModel(viewer.normalizeProject(exampleV2, "canonical"));
  const g11 = board.gaps.find((gap) => gap.id === "G11");
  assert.equal(g11.mixed, true);
  assert.equal(g11.warningCount, 1);
  assert.equal(g11.sources[1].location, ".github/skills/catalog/status.md:54");
  const g3 = board.gaps.find((gap) => gap.id === "G3");
  assert.equal(g3.mixed, false);
  assert.equal(g3.warningCount, 0);
  const catalog = board.cards.find((card) => card.id === "catalog");
  assert.equal(catalog.warningCount, 3);
});

test("buildBoardModel shows PARTIAL gaps with a Partial badge, not as drift, and counts them as open", () => {
  const board = viewer.buildBoardModel(viewer.normalizeProject(exampleV2, "canonical"));
  const g15 = board.gaps.find((gap) => gap.id === "G15");
  assert.equal(g15.state, "PARTIAL");
  assert.equal(g15.partial, true);
  assert.equal(g15.mixed, false);
  assert.equal(g15.stateLabel, "Partial");
  assert.equal(g15.warningCount, 0);
  assert.equal(board.gaps.find((gap) => gap.id === "G11").stateLabel, "MIXED");

  // Without projected stats, BC cards derive open gaps and include PARTIAL.
  const raw = JSON.parse(JSON.stringify(exampleV2));
  for (const bc of raw.boundedContexts) delete bc.stats.openGaps;
  raw.gaps = [
    { id: "G1", gap: "a", affected: null, state: "PARTIAL", sources: [{ file: "s.md", line: 1, bc: "catalog", owner: "", disposition: "Resolved for Catalog; Ordering to confirm" }] },
    { id: "G2", gap: "b", affected: null, state: "RESOLVED", sources: [{ file: "s.md", line: 2, bc: "catalog", owner: "", disposition: "Resolved" }] },
  ];
  const derived = viewer.buildBoardModel(viewer.normalizeProject(raw, "canonical"));
  assert.equal(derived.cards.find((card) => card.id === "catalog").stats.openGaps, 1);
  assert.equal(viewer.isOpenGap({ state: "PARTIAL" }), true);
  assert.equal(viewer.isOpenGap({ state: "RESOLVED" }), false);
});

test("latestTransition and orderTransitions accept newest-first transitions", () => {
  const oldestFirst = [
    { date: "2026-10-14", from: "-", to: "DISCOVERED" },
    { date: "2026-10-14", from: "DISCOVERED", to: "REFINING" },
    { date: "2026-10-14", from: "REFINING", to: "REFINED" },
  ];
  const newestFirst = oldestFirst.slice().reverse();
  assert.equal(viewer.latestTransition({ transitions: newestFirst }).to, "REFINED");
  assert.equal(viewer.latestTransition({ transitions: oldestFirst }).to, "REFINED");
  assert.deepEqual(viewer.orderTransitions(newestFirst), oldestFirst);
  assert.equal(viewer.latestTransition({ transitions: [] }), null);
  const dated = [
    { date: "2026-11-20", from: "IMPLEMENTED", to: "VERIFIED" },
    { date: "2026-11-01", from: "-", to: "DISCOVERED" },
  ];
  assert.equal(viewer.latestTransition({ transitions: dated }).to, "VERIFIED");
});

test("buildBoardModel badges BC cards by diagnostic bcId and sets the banner count", () => {
  const raw = v1Project();
  raw.schemaVersion = 2;
  raw.diagnostics = [
    { code: "HGW001", severity: "warning", message: "drift", file: "x.md", line: 1, bcId: "ordering", gapId: null },
    { code: "HGW002", severity: "warning", message: "missing", file: "y.md", line: 2, bcId: null, gapId: "G9" },
  ];
  const board = viewer.buildBoardModel(viewer.normalizeProject(raw, "canonical"));
  assert.equal(board.cards[0].warningCount, 1);
  assert.equal(board.warnings.count, 2);
  assert.equal(board.warnings.expanded, true);
  assert.equal(board.warnings.message, "2 warnings in the project projection");
  assert.equal(viewer.warningBannerText(1), "1 warning in the project projection");
  assert.equal(viewer.warningBannerText(0), "");
});

test("buildBoardModel works for legacy Markdown projects", async () => {
  const files = new Map([
    [
      "docs/domain-map.md",
      fakeFile(`## Bounded Context Inventory

| ID | Bounded context | Domain/Subdomain | Classification | Boundary role | Owns | Does not own | Local status |
|---|---|---|---|---|---|---|---|
| ordering | Ordering | Commerce | Core | Primary | Orders | Payments | status.md |
`),
    ],
  ]);
  const { project } = await viewer.buildLegacyProject(files);
  const board = viewer.buildBoardModel(project);
  assert.equal(board.columns.find((column) => column.state === "DISCOVERED").cards[0].id, "ordering");
  assert.equal(board.warnings.count, 0);
});

test("loadProject keeps an optional status report and stays silent when it is missing", async () => {
  const withoutReport = new Map([["docs/hgate-project.json", fakeFile(JSON.stringify(exampleV2))]]);
  const missing = await viewer.loadProject(withoutReport);
  assert.equal(missing.statusReport, null);
  assert.equal(missing.diagnostics.length, 0);

  const withReport = new Map(withoutReport);
  withReport.set(".hgate/status.json", fakeFile(JSON.stringify({ schemaVersion: 1, bcs: [] })));
  const loaded = await viewer.loadProject(withReport);
  assert.deepEqual(loaded.statusReport, { schemaVersion: 1, bcs: [] });
  assert.equal(loaded.project.schemaVersion, 2);
});

test("readProjectDirectory and indexFiles pick up .hgate/status.json", async () => {
  const root = fakeDirectory({
    docs: { "domain-map.md": "# map" },
    ".hgate": { "status.json": "{}", "cache.json": "ignored" },
  });
  const map = await viewer.readProjectDirectory(root);
  assert.deepEqual(Array.from(map.keys()).sort(), [".hgate/status.json", "docs/domain-map.md"]);
  assert.equal(viewer.isProjectFile(".hgate/status.json"), true);
  assert.equal(viewer.isProjectFile(".hgate/cache.json"), false);
});

// --- Per-BC timeline and change view (T7b) -----------------------------------

function emptyDiff() {
  const diff = {};
  for (const id of ["features", "scenarios", "skill", "model", "ports", "decisions", "acls", "aclSections", "properties", "gates", "openItems"]) {
    diff[id] = { added: [], removed: [], modified: [] };
  }
  diff.rules = { added: [], removed: [], modified: [], moved: [] };
  diff.summary = { added: 0, removed: 0, modified: 0, moved: 0, changed: false };
  return diff;
}

const COMMIT_A = { sha: "a".repeat(40), shortSha: "aaaaaaa", date: "2026-11-10T10:00:00+00:00", subject: "docs(catalog): refine spec" };
const COMMIT_B = { sha: "b".repeat(40), shortSha: "bbbbbbb", date: "2026-11-20T10:00:00+00:00", subject: "feat(catalog): verify" };

function catalogReport() {
  const scenarioDiff = emptyDiff();
  scenarioDiff.scenarios.added = [{ key: "@scenario:CAT-BROWSE-001", label: "Browse products" }];
  scenarioDiff.rules.modified = [{ key: "h2", label: "#2: Prices are shown in cents", labelBefore: "#2: Prices are shown", previousKey: "h1", numberBefore: 2, numberAfter: 2 }];
  scenarioDiff.rules.moved = [{ key: "h3", label: "#3: Channel is required", numberBefore: 4, numberAfter: 3 }];
  scenarioDiff.lifecycle = { from: "REFINING", to: "REFINED" };
  const uncommittedDiff = emptyDiff();
  uncommittedDiff.decisions.added = [{ key: "Use cached channel token", label: "Use cached channel token" }];
  const steps = [
    ["-", "DISCOVERED", "2026-11-01", COMMIT_A, true, emptyDiff()],
    ["DISCOVERED", "REFINING", "2026-11-05", COMMIT_A, true, emptyDiff()],
    ["REFINING", "REFINED", "2026-11-10", COMMIT_A, true, scenarioDiff],
    ["REFINED", "IMPLEMENTING", "2026-11-14", COMMIT_B, false, emptyDiff()],
    ["IMPLEMENTING", "IMPLEMENTED", "2026-11-18", "uncommitted", true, emptyDiff()],
    ["IMPLEMENTED", "VERIFIED", "2026-11-20", "uncommitted", true, uncommittedDiff],
  ].map(([from, to, date, commit, sharedCommit, changes], index) => ({
    from, to, date, actor: "session", evidence: "e", line: 20 + index, commit, sharedCommit, changes,
  }));
  return {
    schemaVersion: 1,
    git: { available: true, head: COMMIT_B.sha, headSubject: COMMIT_B.subject, shallow: false, branch: "main" },
    boundedContexts: [
      {
        id: "catalog",
        dir: ".github/skills/catalog",
        lifecycle: "VERIFIED",
        steps,
        sinceLastTransition: { baseCommit: "uncommitted", changes: emptyDiff() },
        sincePreviousCommit: { baseCommit: COMMIT_A, changes: scenarioDiff },
        uncommitted: { changes: uncommittedDiff, files: ["decisions.md", "status.md"] },
      },
    ],
    coverage: { status: "ok", exitCode: 0, summary: { scenarios: 4, coveredScenarios: 3, errors: 0 }, diagnosticCodes: [], scenarioCount: 4 },
  };
}

function exampleProject() {
  return viewer.normalizeProject(exampleV2, "canonical");
}

test("summarizeChanges counts per category, keeps null as unknown and empty as no changes", () => {
  assert.deepEqual(
    { known: viewer.summarizeChanges(null).known, text: viewer.summarizeChanges(null).text },
    { known: false, text: "Unknown" },
  );
  const empty = viewer.summarizeChanges(emptyDiff());
  assert.equal(empty.known, true);
  assert.equal(empty.empty, true);
  assert.equal(empty.text, "No changes");
  assert.deepEqual(empty.categories, []);

  const summary = viewer.summarizeChanges(catalogReport().boundedContexts[0].sincePreviousCommit.changes);
  assert.equal(summary.empty, false);
  assert.deepEqual(summary.totals, { added: 1, removed: 0, modified: 1, moved: 1 });
  assert.deepEqual(summary.lifecycle, { from: "REFINING", to: "REFINED" });
  assert.equal(summary.text, "lifecycle REFINING → REFINED · 1 added · 1 modified · 1 moved");
  assert.deepEqual(summary.categories.map((category) => category.id), ["scenarios", "rules"]);
  const scenarios = summary.categories[0];
  assert.equal(scenarios.added[0].text, "@scenario:CAT-BROWSE-001 — Browse products");
  const rules = summary.categories[1];
  assert.equal(rules.modified[0].text, "#2: Prices are shown → #2: Prices are shown in cents");
  assert.equal(rules.moved[0].text, "#3: Channel is required (#4 → #3)");
});

test("matchGatesToSteps assigns gates by transition and date and keeps pending gates unmatched", () => {
  const steps = [
    { from: "REFINING", to: "REFINED", date: "2026-11-10" },
    { from: "REFINED", to: "CHANGING", date: "2026-11-12" },
    { from: "CHANGING", to: "REFINED", date: "2026-11-15" },
    { from: "CHANGING", to: "REFINED", date: "2026-11-25" },
  ];
  const gates = [
    { transition: "REFINING -> REFINED", gate: "GATE-REF-SPEC", result: "FAIL", date: "2026-11-09" },
    { transition: "REFINING → REFINED", gate: "GATE-REF-SPEC", result: "PASS", date: "2026-11-10" },
    { transition: "CHANGING -> REFINED", gate: "GATE-REF-APPROVAL", result: "PASS", date: "2026-11-15" },
    { transition: "CHANGING -> REFINED", gate: "GATE-REF-APPROVAL", result: "PASS", date: "2026-11-26" },
    { transition: "REFINED -> SPEC_REVIEWED", gate: "GATE-SPEC-REVIEW", result: "PASS", date: "2026-11-27" },
  ];
  const { assigned, unmatched } = viewer.matchGatesToSteps(steps, gates);
  assert.deepEqual(assigned[0].map((gate) => gate.result), ["FAIL", "PASS"]);
  assert.deepEqual(assigned[1], []);
  assert.deepEqual(assigned[2].map((gate) => gate.date), ["2026-11-15"]);
  assert.deepEqual(assigned[3].map((gate) => gate.date), ["2026-11-26"]);
  assert.deepEqual(unmatched.map((gate) => gate.gate), ["GATE-SPEC-REVIEW"]);
});

test("buildTimelineModel without a status report uses the projection and hints at project:status", () => {
  const model = viewer.buildTimelineModel(exampleProject(), null, "catalog");
  assert.equal(model.hasReport, false);
  assert.equal(model.hint, "Run `npm run project:status` to see what changed");
  assert.deepEqual(model.notices, []);
  assert.deepEqual(model.baselines, []);
  assert.equal(model.coverage, null);
  assert.equal(model.steps.length, 6);
  for (const step of model.steps) {
    assert.equal(step.commit, null);
    assert.equal(step.changes, null);
  }
  const refined = model.steps[2];
  assert.equal(refined.transition, "REFINING -> REFINED");
  assert.deepEqual(refined.gates.map((gate) => `${gate.gate}:${gate.result}`), [
    "GATE-REF-SPEC:FAIL",
    "GATE-REF-SPEC:PASS",
    "GATE-REF-APPROVAL:PASS",
  ]);
  assert.equal(refined.gates[2].signedBy, "A. Reviewer (Tech lead)");
  assert.deepEqual(model.steps[0].gates.map((gate) => gate.gate), ["GATE-DISC-BOUNDARY", "GATE-PROJ-SYNC"]);
  assert.deepEqual(model.unmatchedGates, []);
  assert.equal(viewer.buildTimelineModel(exampleProject(), null, "missing"), null);
});

test("buildTimelineModel orders newest-first projection transitions chronologically", () => {
  const project = exampleProject();
  const bc = project.boundedContexts.find((item) => item.id === "catalog");
  bc.transitions = bc.transitions.slice().reverse();
  const model = viewer.buildTimelineModel(project, null, "catalog");
  assert.deepEqual(model.steps.map((step) => step.transition), [
    "- -> DISCOVERED",
    "DISCOVERED -> REFINING",
    "REFINING -> REFINED",
    "REFINED -> IMPLEMENTING",
    "IMPLEMENTING -> IMPLEMENTED",
    "IMPLEMENTED -> VERIFIED",
  ]);
  assert.deepEqual(model.steps[0].gates.map((gate) => gate.gate), ["GATE-DISC-BOUNDARY", "GATE-PROJ-SYNC"]);
});

test("buildTimelineModel with a report attaches commits, baselines, coverage and shared-commit diffs", () => {
  const model = viewer.buildTimelineModel(exampleProject(), catalogReport(), "catalog");
  assert.equal(model.hasReport, true);
  assert.equal(model.hint, null);
  assert.deepEqual(model.notices, []);
  assert.equal(model.coverage, "BDD coverage (project): ok — 3/4 scenarios covered, 0 errors");

  assert.deepEqual(model.baselines.map((baseline) => baseline.title), ["Since last transition", "Since previous commit", "Uncommitted"]);
  const [sinceTransition, sincePrevious, uncommitted] = model.baselines;
  assert.equal(sinceTransition.summary.text, "No changes");
  assert.equal(sinceTransition.base, "last transition not committed yet");
  assert.equal(sincePrevious.base, "base aaaaaaa docs(catalog): refine spec");
  assert.equal(sincePrevious.summary.totals.added, 1);
  assert.deepEqual(uncommitted.files, ["decisions.md", "status.md"]);
  assert.equal(uncommitted.summary.categories[0].id, "decisions");

  const [discovered, refining, refined, implementing, implemented, verified] = model.steps;
  // Shared commit A: the group diff lives on the last step (REFINING -> REFINED).
  assert.equal(discovered.commit.text, "aaaaaaa docs(catalog): refine spec");
  assert.match(discovered.sharedNote, /same commit as the next step/);
  assert.equal(discovered.changes, null);
  assert.equal(refining.changes, null);
  assert.equal(refined.sharedNote, null);
  assert.equal(refined.sharedGroupSize, 3);
  assert.equal(refined.changes.totals.added, 1);
  // Single commit: its own diff, no note.
  assert.equal(implementing.commit.kind, "commit");
  assert.equal(implementing.sharedCommit, false);
  assert.equal(implementing.changes.text, "No changes");
  // Uncommitted rows form their own shared group.
  assert.equal(implemented.commit.kind, "uncommitted");
  assert.equal(implemented.commit.text, "uncommitted");
  assert.match(implemented.sharedNote, /same commit/);
  assert.equal(verified.sharedGroupSize, 2);
  assert.equal(verified.changes.categories[0].id, "decisions");
  assert.deepEqual(verified.gates.map((gate) => gate.gate), ["GATE-VER-REPORT", "GATE-PROJ-SYNC"]);
});

test("buildTimelineModel treats null changes as unknown and shows git notices", () => {
  const report = catalogReport();
  report.git = { available: false, head: null, headSubject: null, shallow: false, branch: null };
  const [bc] = report.boundedContexts;
  for (const step of bc.steps) {
    step.commit = null;
    step.changes = null;
    step.sharedCommit = false;
  }
  bc.sincePreviousCommit = { baseCommit: null, changes: null };
  bc.uncommitted = { changes: null, files: [] };
  const model = viewer.buildTimelineModel(exampleProject(), report, "catalog");
  assert.deepEqual(model.notices, ["Git is not available: commits and per-step changes are unknown."]);
  assert.equal(model.steps[0].commit.text, "unknown");
  assert.equal(model.steps[0].changes.known, false);
  assert.equal(model.steps[0].changes.text, "Unknown");
  assert.equal(model.steps[0].sharedNote, null);
  assert.equal(model.baselines[1].summary.text, "Unknown");
  assert.equal(model.baselines[1].base, "HEAD has no parent: compared with nothing");

  report.git = { available: true, head: COMMIT_B.sha, headSubject: "x", shallow: true, branch: "main" };
  assert.match(viewer.buildTimelineModel(exampleProject(), report, "catalog").notices[0], /^Shallow clone/);
});

test("buildTimelineModel flags BCs missing from or out of step with the report", () => {
  const missing = viewer.buildTimelineModel(exampleProject(), catalogReport(), "ordering");
  assert.equal(missing.hint, null);
  assert.match(missing.notices[0], /not in the status report/);
  assert.deepEqual(missing.baselines, []);
  assert.equal(missing.steps.length, 2);
  assert.equal(missing.steps[0].commit, null);

  const stale = catalogReport();
  stale.boundedContexts[0].steps.pop();
  const model = viewer.buildTimelineModel(exampleProject(), stale, "catalog");
  assert.match(model.notices[0], /does not match the projection/);
  assert.equal(model.steps[5].commit, null);
  assert.equal(model.steps[5].changes, null);
});

test("formatCoverage summarizes the optional verify:bdd result", () => {
  assert.equal(viewer.formatCoverage(null), null);
  assert.equal(
    viewer.formatCoverage({ status: "unavailable", summary: null, error: "tools/bdd-traceability/verify.mjs not found" }),
    "BDD coverage (project): unavailable — tools/bdd-traceability/verify.mjs not found",
  );
});

// T12: glossary, legends and the embedded viewer guide.
test("embedded viewer guide is byte-identical to docs/viewer-guide.md", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "docs", "viewer-guide.md"), "utf8");
  const { GUIDE_MARKDOWN } = require("./viewer-guide.js");
  assert.ok(
    GUIDE_MARKDOWN === source,
    "tools/gherkin-viewer/viewer-guide.js is out of sync with docs/viewer-guide.md. " +
      "Resync with: node tools/gherkin-viewer/sync-guide.mjs",
  );
  assert.equal(viewer.guideMarkdown(), source);
});

test("GLOSSARY covers every Kind, Result, gap state, lifecycle and change kind the board uses", () => {
  for (const kind of ["H", "D", "R"]) assert.ok(viewer.glossaryText("kind", kind), `kind ${kind}`);
  for (const result of ["PASS", "FAIL", "WAIVED", "N/A"]) assert.ok(viewer.glossaryText("result", result), `result ${result}`);
  for (const state of ["RESOLVED", "PARTIAL", "MIXED", "DEFERRED", "OPEN"]) {
    assert.ok(viewer.glossaryText("gapState", state), `gap state ${state}`);
  }
  for (const state of viewer.MAIN_LIFECYCLES.concat(viewer.OPTIONAL_LIFECYCLES)) {
    assert.ok(viewer.glossaryText("lifecycle", state), `lifecycle ${state}`);
  }
  for (const kind of ["added", "removed", "modified", "moved"]) assert.ok(viewer.glossaryText("changeKind", kind));
  for (const key of ["uncommitted", "unknown", "sharedCommit"]) assert.ok(viewer.glossaryText("commit", key));
  for (const key of ["drift", "partial", "gates"]) assert.ok(viewer.glossaryText("badge", key));
  assert.equal(viewer.glossaryText("kind", "H"), "Human approval — a named person signs it off");
  assert.equal(viewer.glossaryText("kind", "toString"), "");
});

test("GLOSSARY gap states match the shared gap ledger states", async () => {
  const { GAP_STATES } = await import("../shared/gaps.mjs");
  assert.deepEqual(Object.keys(viewer.GLOSSARY.gapState).sort(), [...GAP_STATES].sort());
});

test("legendText renders the gate and gap legends from GLOSSARY", () => {
  const gates = viewer.legendText("gates");
  assert.match(gates, /^Kind: H Human approval · D Deterministic check · R Record only \| Result: PASS/);
  assert.match(gates, /N\/A Does not apply/);
  const gaps = viewer.legendText("gaps");
  for (const state of Object.keys(viewer.GLOSSARY.gapState)) assert.match(gaps, new RegExp(state));
  assert.match(gaps, /Badges: Amber: drift warnings · Blue: partly resolved/);
});

test("renderMarkdown escapes HTML in text, code, headings and tables", () => {
  const html = viewer.renderMarkdown(
    "# T <img src=x onerror=alert(1)>\n\nHi <script>alert(1)</script> **b<i>** `<b>&`\n\n| A | B |\n|---|---|\n| <u>x</u> | \"q\" |\n\n- <a href=\"javascript:x\">l</a>\n",
  );
  assert.doesNotMatch(html, /<script|<img|<u>|<a |<i>|<b>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<strong>b&lt;i&gt;<\/strong>/);
  assert.match(html, /<code>&lt;b&gt;&amp;<\/code>/);
  assert.match(html, /<td>&lt;u&gt;x&lt;\/u&gt;<\/td><td>&quot;q&quot;<\/td>/);
});

test("renderMarkdown renders headings, nested lists, tables and paragraphs", () => {
  const html = viewer.renderMarkdown("# Title\n\n## Part\n\nText\nmore.\n\n1. One\n   - Sub\n2. Two\n\n| K | V |\n|---|---|\n| `H` | Human |\n", {
    headingOffset: 1,
    firstHeadingId: "helpPanelTitle",
  });
  assert.match(html, /<h2 id="helpPanelTitle">Title<\/h2>/);
  assert.match(html, /<h3>Part<\/h3>/);
  assert.match(html, /<p>Text more\.<\/p>/);
  assert.match(html, /<ol><li>One<ul><li>Sub<\/li><\/ul><\/li><li>Two<\/li><\/ol>/);
  assert.match(html, /<th scope="col">K<\/th>/);
  assert.match(html, /<td><code>H<\/code><\/td><td>Human<\/td>/);
});

// T13: adaptive gap attention panel.
test("gapPanelModel is attention with sorted unresolved gaps when any gap is MIXED or OPEN", () => {
  const model = viewer.gapPanelModel([
    { id: "G11", state: "OPEN" },
    { id: "G2", state: "OPEN" },
    { id: "G4", state: "DEFERRED" },
    { id: "G3", state: "PARTIAL" },
    { id: "G10", state: "MIXED" },
    { id: "G1", state: "RESOLVED" },
    { id: "G5", state: "RESOLVED" },
  ]);
  assert.equal(model.level, "attention");
  assert.equal(model.title, "Gaps need attention");
  assert.deepEqual(model.counts, { open: 2, partial: 1, mixed: 1, deferred: 1, resolved: 2 });
  assert.deepEqual(model.unresolved.map((gap) => gap.id), ["G10", "G2", "G11", "G3", "G4"]);
  assert.deepEqual(model.resolved.map((gap) => gap.id), ["G1", "G5"]);
  assert.equal(model.chipText, "2 open · 1 partial · 1 drift · 1 deferred · 2 resolved");
});

test("gapPanelModel is attention for a single OPEN gap and omits zero chips", () => {
  const model = viewer.gapPanelModel([{ id: "G1", state: "OPEN" }]);
  assert.equal(model.level, "attention");
  assert.equal(model.chipText, "1 open");
  assert.deepEqual(model.chips.map((chip) => chip.state), ["OPEN"]);
});

test("gapPanelModel is pending when only PARTIAL or DEFERRED gaps are unresolved", () => {
  const model = viewer.gapPanelModel([
    { id: "G3", state: "DEFERRED" },
    { id: "G2", state: "PARTIAL" },
    { id: "G1", state: "RESOLVED" },
  ]);
  assert.equal(model.level, "pending");
  assert.equal(model.title, "Gaps pending");
  assert.deepEqual(model.unresolved.map((gap) => gap.id), ["G2", "G3"]);
  assert.equal(model.chipText, "1 partial · 1 deferred · 1 resolved");
});

test("gapPanelModel is clear when every gap is RESOLVED", () => {
  const model = viewer.gapPanelModel([
    { id: "G12", state: "RESOLVED" },
    { id: "G2", state: "RESOLVED" },
  ]);
  assert.equal(model.level, "clear");
  assert.equal(model.title, "All 2 gaps resolved");
  assert.deepEqual(model.unresolved, []);
  assert.deepEqual(model.resolved.map((gap) => gap.id), ["G2", "G12"]);
  assert.equal(model.chipText, "2 resolved");
  assert.equal(viewer.gapPanelModel([{ id: "G1", state: "RESOLVED" }]).title, "All 1 gap resolved");
});

test("gapPanelModel is empty when there are no gaps", () => {
  for (const input of [[], undefined, null]) {
    const model = viewer.gapPanelModel(input);
    assert.equal(model.level, "empty");
    assert.equal(model.title, "No gaps recorded");
    assert.equal(model.chipText, "");
    assert.deepEqual(model.unresolved, []);
    assert.deepEqual(model.resolved, []);
  }
});

test("gapPanelModel works on buildBoardModel gaps and GLOSSARY explains every panel level and chip", () => {
  const board = viewer.buildBoardModel(
    viewer.normalizeProject({
      schemaVersion: 2,
      project: { name: "Demo" },
      domains: [],
      boundedContexts: [],
      relationships: [],
      journeys: [],
      gaps: [{ id: "G1", gap: "x", state: "PARTIAL", sources: [] }],
    }),
  );
  assert.equal(viewer.gapPanelModel(board.gaps).level, "pending");
  for (const level of ["attention", "pending", "clear", "empty"]) {
    assert.ok(viewer.glossaryText("gapPanel", level), `gapPanel ${level}`);
  }
  assert.ok(viewer.compareGapIds("G2", "G11") < 0);
});

// --- T14b: summary strip, lifecycle matrix, collapsed dispositions ----------

function boardCard(id, lifecycle, extra = {}) {
  return {
    id,
    name: extra.name || id,
    classification: extra.classification || "CORE",
    role: extra.role || "PRIMARY",
    lifecycle,
    baseLifecycle: extra.baseLifecycle === undefined ? (viewer.MAIN_LIFECYCLES.includes(lifecycle) ? lifecycle : null) : extra.baseLifecycle,
    lifecycleDate: extra.date || null,
    lifecycleFrom: extra.from || null,
    nextSkill: extra.nextSkill || null,
    blockers: extra.blockers || [],
    stats: { openGaps: extra.openGaps === undefined ? 0 : extra.openGaps },
    gateSummary: extra.gates || { total: 2, satisfied: 2, valid: true, unmetGates: [], transition: null },
    warningCount: extra.warningCount || 0,
  };
}

test("buildSummaryStrip counts BCs by state, valid gates, open gaps, warnings and the last change", () => {
  const board = {
    cards: [
      boardCard("a", "REFINED", { name: "Alpha", date: "2026-10-01", from: "REFINING" }),
      boardCard("b", "REFINED", { name: "Beta", date: "2026-11-02", from: "REFINING" }),
      boardCard("c", "BLOCKED", {
        name: "Gamma",
        date: "2026-10-20",
        gates: { total: 3, satisfied: 1, valid: false, unmetGates: ["GATE-X (FAIL)"], transition: null },
      }),
    ],
    gaps: [{ state: "OPEN" }, { state: "PARTIAL" }, { state: "MIXED" }, { state: "DEFERRED" }, { state: "RESOLVED" }],
    warnings: { count: 2 },
  };
  const strip = viewer.buildSummaryStrip(board);
  assert.equal(strip.total, 3);
  assert.deepEqual(strip.byState.map((entry) => [entry.state, entry.count]), [["REFINED", 2], ["BLOCKED", 1]]);
  assert.equal(strip.stateText, "2 Refined · 1 Blocked");
  assert.equal(strip.gates.text, "2/3");
  assert.equal(strip.gates.allValid, false);
  assert.deepEqual(strip.gates.invalidNames, ["Gamma"]);
  assert.equal(strip.gaps.open, 3, "open + partial + mixed; deferred is reported separately");
  assert.equal(strip.gaps.tone, "danger");
  assert.equal(strip.gaps.detail, "1 open · 1 partial · 1 drift · 1 deferred");
  assert.equal(strip.warnings.count, 2);
  assert.deepEqual(
    { date: strip.lastChange.date, bcId: strip.lastChange.bcId, from: strip.lastChange.from, to: strip.lastChange.to },
    { date: "2026-11-02", bcId: "b", from: "REFINING", to: "REFINED" },
  );
});

test("buildSummaryStrip handles an empty board", () => {
  const strip = viewer.buildSummaryStrip({ cards: [], gaps: [], warnings: { count: 0 } });
  assert.equal(strip.total, 0);
  assert.equal(strip.lastChange, null);
  assert.equal(strip.gaps.detail, "No gaps recorded");
  assert.equal(strip.gaps.tone, "neutral");
  assert.equal(strip.warnings.tone, "neutral");
});

test("buildLifecycleMatrix builds rails, markers, gate progress and hides a duplicate role", () => {
  const board = {
    cards: [
      boardCard("refined", "REFINED", { classification: "SUPPORTING", role: "SUPPORTING", openGaps: 2 }),
      boardCard("blocked", "BLOCKED", {
        baseLifecycle: "SPEC_REVIEWED",
        gates: { total: 3, satisfied: 1, valid: false, unmetGates: ["GATE-B (FAIL)"], transition: "SPEC_REVIEWED -> BLOCKED" },
      }),
      boardCard("none", "CHANGING", { baseLifecycle: null, gates: { total: 0, satisfied: 0, valid: false, unmetGates: [] } }),
    ],
    columns: [
      { state: "DISCOVERED", label: "Discovered", optional: false, cards: [] },
      { state: "REFINED", label: "Refined", optional: false, cards: [] },
    ],
  };
  board.columns[1].cards = [board.cards[0]];
  const matrix = viewer.buildLifecycleMatrix(board);
  assert.deepEqual(matrix.states.map((state) => state.state), viewer.MAIN_LIFECYCLES);
  assert.deepEqual(matrix.rows.map((row) => row.id), ["blocked", "refined", "none"], "most advanced first, unknown last");

  const refined = matrix.rows.find((row) => row.id === "refined");
  assert.equal(refined.showRole, false);
  assert.equal(refined.marker, null);
  assert.deepEqual(refined.steps.slice(0, 4).map((step) => step.status), ["done", "done", "current", "future"]);
  assert.equal(refined.gates.text, "2/2");
  assert.equal(refined.gates.tone, "success");
  assert.equal(refined.openGaps, 2);

  const blocked = matrix.rows.find((row) => row.id === "blocked");
  assert.equal(blocked.showRole, true);
  assert.deepEqual(blocked.marker, { state: "BLOCKED", label: "Blocked" });
  assert.equal(blocked.steps[3].status, "current");
  assert.equal(blocked.gates.tone, "danger");
  assert.match(blocked.gates.title, /Unmet: GATE-B \(FAIL\)/);

  const none = matrix.rows.find((row) => row.id === "none");
  assert.equal(none.position, -1);
  assert.ok(none.steps.every((step) => step.status === "future"));
  assert.equal(none.gates.text, "–");

  assert.deepEqual(matrix.columns.map((column) => [column.state, column.collapsed]), [["DISCOVERED", true], ["REFINED", false]]);
});

test("baseLifecycleOf finds the main state behind CHANGING, BLOCKED and DEPRECATED", () => {
  assert.equal(viewer.baseLifecycleOf({}, "REFINED"), "REFINED");
  const bc = {
    transitions: [
      { from: "-", to: "DISCOVERED", date: "2026-10-01" },
      { from: "DISCOVERED", to: "VERIFIED", date: "2026-10-02" },
      { from: "VERIFIED", to: "CHANGING", date: "2026-10-03" },
    ],
  };
  assert.equal(viewer.baseLifecycleOf(bc, "CHANGING"), "VERIFIED");
  assert.equal(viewer.baseLifecycleOf({ transitions: [] }, "BLOCKED"), null);
});

test("buildBoardModel cards carry lifecycleFrom and baseLifecycle", () => {
  const board = viewer.buildBoardModel(viewer.normalizeProject(exampleV2, "canonical"));
  for (const card of board.cards) {
    assert.ok("lifecycleFrom" in card && "baseLifecycle" in card, card.id);
    if (viewer.MAIN_LIFECYCLES.includes(card.lifecycle)) assert.equal(card.baseLifecycle, card.lifecycle);
  }
  const strip = viewer.buildSummaryStrip(board);
  assert.equal(strip.total, board.cards.length);
  assert.equal(viewer.buildLifecycleMatrix(board).rows.length, board.cards.length);
});

test("collapseDispositions shows identical dispositions once with n sources agree", () => {
  const model = viewer.collapseDispositions([
    { location: "a.md:1", disposition: "Deferred to ADR", owner: "PO" },
    { location: "b.md:2", disposition: "  Deferred   to ADR ", owner: "PO" },
    { location: "c.md:3", disposition: "Deferred to ADR", owner: "PO" },
  ]);
  assert.equal(model.agree, true);
  assert.equal(model.common.disposition, "Deferred to ADR");
  assert.equal(model.common.text, "3 sources agree");
  assert.deepEqual(model.common.owners, ["PO"]);
  assert.deepEqual(model.differing, []);
  assert.equal(viewer.collapseDispositions([{ disposition: "x" }]).common.text, "1 source agrees");
});

test("collapseDispositions lists only the sources that differ from the common disposition", () => {
  const sources = [
    { location: "a.md:1", disposition: "Resolved for A; B to confirm" },
    { location: "b.md:2", disposition: "Open" },
    { location: "c.md:3", disposition: "Resolved for A; B to confirm" },
  ];
  const model = viewer.collapseDispositions(sources);
  assert.equal(model.agree, false);
  assert.equal(model.groupCount, 2);
  assert.equal(model.common.text, "2 of 3 sources agree");
  assert.deepEqual(model.differing.map((item) => item.location), ["b.md:2"]);
  const empty = viewer.collapseDispositions([]);
  assert.equal(empty.common, null);
  assert.equal(empty.count, 0);
});

// --- Project diagram and Scenarios helpers (T14c) -----------------------------

function diagramProject() {
  return {
    domains: [
      { id: "commerce", name: "Commerce" },
      { id: "identity", name: "Identity" },
    ],
    boundedContexts: [
      { id: "cart", name: "Cart", domainId: "commerce" },
      { id: "ordering", name: "Ordering", domainId: "commerce" },
      { id: "catalog", name: "Catalog", domainId: "commerce" },
      { id: "auth", name: "Auth", domainId: "identity" },
    ],
    relationships: [
      { id: "r1", from: "cart", to: "ordering" },
      { id: "r2", from: "ordering", to: "cart" },
      { id: "r3", from: "auth", to: "ordering" },
      { id: "r4", from: "auth", to: "ghost" },
      { id: "r5", from: "cart", to: "cart" },
    ],
  };
}

test("layoutProject places every BC inside its domain box and boxes never overlap", () => {
  const layout = viewer.layoutProject(diagramProject());
  assert.deepEqual(layout.domains.map((box) => box.id), ["commerce", "identity"]);
  for (const [id, position] of layout.positions) {
    const box = layout.domains.find((item) => item.id === position.domainId);
    assert.ok(position.x >= box.x && position.x + layout.nodeWidth <= box.x + box.width, `${id} x inside`);
    assert.ok(position.y >= box.y && position.y + layout.nodeHeight <= box.y + box.height, `${id} y inside`);
  }
  const [a, b] = layout.domains;
  assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  assert.ok(layout.width >= Math.max(...layout.domains.map((box) => box.x + box.width)));
});

test("layoutProject wraps domain rows at maxRowWidth and domainBoxes reproduces the boxes", () => {
  const project = diagramProject();
  const wide = viewer.layoutProject(project, { maxRowWidth: 100000 });
  assert.equal(wide.domains[0].y, wide.domains[1].y);
  const narrow = viewer.layoutProject(project, { maxRowWidth: wide.domains[0].x + wide.domains[0].width + 1 });
  assert.ok(narrow.domains[1].y > narrow.domains[0].y + narrow.domains[0].height - 1);
  assert.equal(narrow.domains[1].x, narrow.domains[0].x);
  assert.deepEqual(viewer.domainBoxes(wide.columns, wide.positions), wide.domains);
});

test("chooseRowWidth wraps for a tall panel and keeps one row for a wide one", () => {
  const project = diagramProject();
  const single = viewer.layoutProject(project, { maxRowWidth: 100000 });
  assert.equal(viewer.chooseRowWidth(project, 20), single.width);
  const tall = viewer.layoutProject(project, { maxRowWidth: viewer.chooseRowWidth(project, 0.5) });
  assert.ok(tall.domains[1].y > tall.domains[0].y);
});

test("contentBounds and fitZoom size the diagram to the panel within bounds", () => {
  assert.deepEqual(
    viewer.contentBounds([
      { x: 10, y: 20, width: 100, height: 50 },
      { x: 200, y: 0, width: 10, height: 10 },
    ]),
    { x: 10, y: 0, width: 200, height: 70 },
  );
  assert.deepEqual(viewer.contentBounds([]), { x: 0, y: 0, width: 0, height: 0 });
  assert.equal(viewer.fitZoom({ visibleWidth: 1032, visibleHeight: 1000, contentWidth: 1000, contentHeight: 200 }), 100);
  assert.equal(viewer.fitZoom({ visibleWidth: 4000, visibleHeight: 4000, contentWidth: 100, contentHeight: 100 }), 125);
  assert.equal(viewer.fitZoom({ visibleWidth: 100, visibleHeight: 100, contentWidth: 5000, contentHeight: 5000 }), 35);
  assert.equal(viewer.fitZoom({ visibleWidth: 0, visibleHeight: 500, contentWidth: 100, contentHeight: 100 }), 100);
});

test("numberRelationships numbers only drawable relationships in projection order", () => {
  const numbered = viewer.numberRelationships(diagramProject());
  assert.deepEqual(
    numbered.map((relation) => [relation.id, relation.number]),
    [
      ["r1", 1],
      ["r2", 2],
      ["r3", 3],
    ],
  );
  assert.deepEqual(viewer.numberRelationships(null), []);
});

test("assignEdgeBends fans out edges between the same pair and keeps single edges straight", () => {
  const bends = viewer.assignEdgeBends(viewer.numberRelationships(diagramProject()), 56);
  assert.equal(bends[2], 0);
  assert.equal(Math.abs(bends[0]), 28);
  assert.equal(Math.abs(bends[1]), 28);
  // cart->ordering and ordering->cart: their normals point opposite ways, so
  // equal signed bends put the two curves on opposite sides of the line.
  assert.equal(bends[0], bends[1]);
});

test("edgeGeometry draws straight between nodes and detours around an obstacle", () => {
  const from = { x: 0, y: 0, width: 100, height: 50 };
  const to = { x: 400, y: 0, width: 100, height: 50 };
  const straight = viewer.edgeGeometry(from, to);
  assert.equal(straight.offset, 0);
  assert.equal(straight.mid.y, 25);
  assert.ok(Math.abs(straight.mid.x - 250) < 1);
  assert.ok(straight.start.x > 100 && straight.end.x < 400);
  const obstacle = { x: 200, y: -10, width: 100, height: 70 };
  const routed = viewer.edgeGeometry(from, to, 0, [obstacle]);
  assert.notEqual(routed.offset, 0);
  assert.equal(viewer.curveHitsRects(routed.start, routed.control, routed.end, [obstacle]), false);
  assert.match(routed.d, /^M [\d.-]+ [\d.-]+ Q [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+$/);
});

test("lifecycleTone matches the Board drawer pill tones", () => {
  assert.equal(viewer.lifecycleTone("VERIFIED"), "pill-success");
  assert.equal(viewer.lifecycleTone("BLOCKED"), "pill-danger");
  assert.equal(viewer.lifecycleTone("DEPRECATED"), "pill-neutral");
  assert.equal(viewer.lifecycleTone("REFINED"), "pill-info");
});

test("countScenarios counts scenarios and outlines inside gherkin blocks only", () => {
  const markdown = [
    "# Scenarios",
    "Scenario: outside a block is ignored",
    "```gherkin",
    "Feature: Ordering",
    "  @scenario:ORD-SUBMIT-001",
    "  Scenario: Submit",
    "  Scenario Outline: Totals",
    "```",
    "```text",
    "Scenario: not gherkin",
    "```",
    "\\`\\`\\`gherkin",
    "Scenario Template: escaped fence",
    "\\`\\`\\`",
  ].join("\n");
  assert.equal(viewer.countScenarios(markdown), 3);
  assert.equal(viewer.countScenarios(""), 0);
});

test("filterScenarioSources matches BC names, ids and group labels", () => {
  const groups = [
    { label: "Commerce", items: [{ id: "ordering", name: "Ordering" }, { id: "catalog", name: "Catalog" }] },
    { label: "Identity", items: [{ id: "auth", name: "Auth" }] },
  ];
  assert.equal(viewer.filterScenarioSources(groups, ""), groups);
  assert.deepEqual(viewer.filterScenarioSources(groups, "ORDER"), [
    { label: "Commerce", items: [{ id: "ordering", name: "Ordering" }] },
  ]);
  assert.deepEqual(viewer.filterScenarioSources(groups, "ident"), [groups[1]]);
  assert.deepEqual(viewer.filterScenarioSources(groups, "zzz"), []);
});

// T14d: diagram re-wrap, label-aware routing and panel sizing helpers.
test("chooseRowWidth can wrap a later run of domains onto a shared row", () => {
  const bc = (id, domainId) => ({ id, name: id, domainId, classification: "CORE", role: "PRIMARY" });
  const project = {
    domains: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ],
    boundedContexts: [bc("a1", "a"), bc("a2", "a"), bc("a3", "a"), bc("a4", "a"), bc("b1", "b"), bc("b2", "b"), bc("c1", "c")],
    relationships: [],
  };
  const layout = viewer.layoutProject(project, { maxRowWidth: viewer.chooseRowWidth(project, 1.43) });
  const [a, b, c] = layout.domains;
  assert.ok(b.y > a.y, "second domain wraps below the first");
  assert.equal(c.y, b.y, "third domain shares the second row");
});

test("curveHitCost weighs node hits above label hits and edgeGeometry prefers crossing a label", () => {
  const start = { x: 0, y: 0 };
  const end = { x: 100, y: 0 };
  const control = { x: 50, y: 0 };
  const node = { x: 40, y: -5, width: 20, height: 10 };
  const label = { ...node, weight: 1 };
  assert.equal(viewer.curveHitCost(start, control, end, [node]), 10);
  assert.equal(viewer.curveHitCost(start, control, end, [label]), 1);
  assert.equal(viewer.curveHitCost(start, control, end, [{ x: 0, y: 50, width: 5, height: 5 }]), 0);
  // A label blocks the straight line and a node blocks every detour: the curve
  // stays straight through the label rather than through the node.
  const from = { x: 0, y: 0, width: 100, height: 50 };
  const to = { x: 400, y: 0, width: 100, height: 50 };
  const labelInPath = { x: 230, y: 15, width: 40, height: 20, weight: 1 };
  const wall = { x: 200, y: -1000, width: 100, height: 1000 + 10 };
  const floor = { x: 200, y: 40, width: 100, height: 1000 };
  const geometry = viewer.edgeGeometry(from, to, 0, [labelInPath, wall, floor]);
  assert.equal(geometry.offset, 0);
});

test("domainLabelRect covers the label at the box's top-left within the box", () => {
  const box = { x: 100, y: 50, width: 300, height: 200 };
  assert.deepEqual(viewer.domainLabelRect(box, 120), { x: 108, y: 58, width: 144, height: 32, weight: 1 });
  assert.equal(viewer.domainLabelRect(box, 1000).width, 284);
  assert.equal(viewer.estimateLabelWidth("Commerce 4 bounded contexts"), Math.ceil(27 * 7.4));
  assert.equal(viewer.estimateLabelWidth(""), 0);
});

test("fittedPanelHeight sizes the panel to the fitted drawing within limits", () => {
  assert.equal(viewer.fittedPanelHeight(400, 50, { min: 100, max: 1000 }), 234);
  assert.equal(viewer.fittedPanelHeight(400, 50, { min: 300, max: 1000 }), 300);
  assert.equal(viewer.fittedPanelHeight(4000, 100, { min: 300, max: 700 }), 700);
  assert.equal(viewer.fittedPanelHeight(400, 50, { margin: 34 }), 270);
});
