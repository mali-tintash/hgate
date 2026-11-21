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
  assert.equal(summary.total, 3);
  assert.equal(summary.satisfied, 2);
  assert.equal(summary.label, "2/3 gates");
  assert.equal(summary.hasFail, true);
  assert.deepEqual(summary.failedGates, ["GATE-REF-APPROVAL"]);
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
