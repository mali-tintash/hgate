(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.HgateProjectViewer = api;
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const CLASSIFICATIONS = new Set(["CORE", "SUPPORTING", "GENERIC", "UNCONFIRMED"]);
  const ROLES = new Set(["PRIMARY", "SHARED", "SUPPORTING", "UNCONFIRMED"]);
  const DIRECTIONS = new Set(["INBOUND", "OUTBOUND", "BIDIRECTIONAL", "UNKNOWN"]);
  const MIN_ZOOM = 50;
  const MAX_ZOOM = 200;
  const ZOOM_STEP = 25;
  const NODE_WIDTH = 180;
  const COLUMN_STEP = 390;
  const MAX_EDGE_LABEL_LENGTH = 26;
  const LIFECYCLES = new Set([
    "DISCOVERED",
    "REFINING",
    "REFINED",
    "SPEC_REVIEWED",
    "IMPLEMENTING",
    "IMPLEMENTED",
    "VERIFIED",
    "CHANGING",
    "BLOCKED",
    "DEPRECATED",
  ]);

  function slug(value) {
    return String(value || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unnamed";
  }

  function normalizeEnum(value, allowed, fallback) {
    const normalized = String(value || "")
      .trim()
      .replace(/\s+/g, "_")
      .toUpperCase();
    return allowed.has(normalized) ? normalized : fallback;
  }

  function normalizeClassification(value, fallback = "UNCONFIRMED") {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized.startsWith("CORE")) return "CORE";
    if (normalized.startsWith("SUPPORTING")) return "SUPPORTING";
    if (normalized.startsWith("GENERIC")) return "GENERIC";
    return fallback;
  }

  function clampZoom(value) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }

  function abbreviateEdgeLabel(value) {
    const label = String(value || "").trim();
    if (label.length <= MAX_EDGE_LABEL_LENGTH) return label;
    return `${label.slice(0, MAX_EDGE_LABEL_LENGTH - 1).trimEnd()}…`;
  }

  function splitList(value) {
    return String(value || "")
      .split(/<br\s*\/?>|;|,\s+(?=[A-Z])/i)
      .map((item) => item.replace(/^[*-]\s*/, "").trim())
      .filter(Boolean);
  }

  function stripMarkdown(value) {
    return String(value || "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .trim();
  }

  function section(markdown, heading) {
    const lines = markdown.split(/\r?\n/);
    const target = String(heading).trim().toLowerCase();
    const start = lines.findIndex((line) => {
      const match = line.match(/^(#{2,4})\s+(.+?)\s*$/);
      return match && match[2].trim().toLowerCase() === target;
    });
    if (start < 0) return "";
    const headingLevel = lines[start].match(/^#+/)[0].length;
    const body = [];
    for (const line of lines.slice(start + 1)) {
      const nextHeading = line.match(/^(#+)\s+/);
      if (nextHeading && nextHeading[1].length <= headingLevel) break;
      body.push(line);
    }
    return body.join("\n");
  }

  function parseTable(markdown, heading) {
    const body = section(markdown, heading);
    const lines = body.split(/\r?\n/);
    let headerIndex = -1;
    for (let index = 0; index < lines.length - 1; index += 1) {
      if (lines[index].includes("|") && /^\s*\|?[\s:|-]+\|/.test(lines[index + 1])) {
        headerIndex = index;
        break;
      }
    }
    if (headerIndex < 0) return [];

    const cells = (line) =>
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split(/(?<!\\)\|/)
        .map((cell) => stripMarkdown(cell.replace(/\\\|/g, "|")));
    const headers = cells(lines[headerIndex]).map((header) =>
      header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    );
    const rows = [];
    for (const line of lines.slice(headerIndex + 2)) {
      if (!line.includes("|") || !line.trim()) break;
      const values = cells(line);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });
      rows.push(row);
    }
    return rows;
  }

  function readCell(row, aliases) {
    for (const alias of aliases) {
      if (row[alias] !== undefined) return row[alias];
    }
    return "";
  }

  function parseDomainMap(markdown) {
    const diagnostics = [];
    const domains = parseTable(markdown, "Domain Inventory").map((row) => {
      const name = readCell(row, ["domain subdomain", "domain", "subdomain"]);
      return {
        id: slug(readCell(row, ["domain id", "id", "stable id"]) || name),
        name,
        classification: normalizeClassification(readCell(row, ["classification"])),
        purpose: readCell(row, ["business purpose", "purpose"]),
      };
    });

    const boundedContexts = parseTable(markdown, "Bounded Context Inventory").map((row) => {
      const name = readCell(row, ["bounded context", "bc"]);
      const domainId = slug(readCell(row, ["domain subdomain", "domain"]) || "unassigned");
      const explicitClassification = readCell(row, ["classification"]);
      const matchingDomain = domains.find((domain) => domain.id === domainId);
      const classification = explicitClassification
        ? normalizeClassification(explicitClassification)
        : matchingDomain?.classification || "UNCONFIRMED";
      const roleValue = readCell(row, ["boundary role", "role"]);
      const role = roleValue
        ? normalizeEnum(roleValue, ROLES, "UNCONFIRMED")
        : classification === "CORE"
          ? "PRIMARY"
          : classification === "SUPPORTING"
            ? "SUPPORTING"
            : "UNCONFIRMED";
      if (!roleValue) {
        diagnostics.push({
          severity: "info",
          message: `${name || "A bounded context"} has no explicit boundary role; ${role} was inferred.`,
        });
      }
      return {
        id: slug(readCell(row, ["bc id", "id", "stable id"]) || name),
        name,
        domainId,
        classification,
        role,
        lifecycle: "DISCOVERED",
        purpose: "",
        owns: splitList(readCell(row, ["owns"])),
        doesNotOwn: splitList(readCell(row, ["does not own"])),
        capabilities: [],
        ports: [],
        acls: [],
        sources: {
          domainMap: "docs/domain-map.md",
          status: readCell(row, ["local status"]),
        },
        inferred: true,
      };
    });

    for (const row of parseTable(markdown, "Business Capabilities")) {
      const ownerName = readCell(row, ["owning bc", "owner", "bounded context"]);
      const owner = boundedContexts.find(
        (bc) => slug(bc.name) === slug(ownerName) || bc.id === slug(ownerName),
      );
      if (!owner) continue;
      owner.capabilities.push({
        name: readCell(row, ["capability"]),
        trigger: readCell(row, ["trigger"]),
        outcome: readCell(row, ["outcome"]),
        status: normalizeEnum(
          readCell(row, ["status"]),
          new Set(["CONFIRMED", "PROVISIONAL"]),
          "PROVISIONAL",
        ),
      });
    }

    return { domains, boundedContexts, diagnostics };
  }

  function parseContextMap(markdown, boundedContexts) {
    const diagnostics = [];
    const findBcId = (name) => {
      const found = boundedContexts.find(
        (bc) => slug(bc.name) === slug(name) || bc.id === slug(name),
      );
      return found ? found.id : slug(name);
    };
    const relationships = parseTable(markdown, "Context Relationships").map((row) => {
      const fromName = readCell(row, [
        "provider owner bc id",
        "provider owner bc",
        "provider bc",
        "provider",
        "from",
      ]);
      const toName = readCell(row, ["consumer bc id", "consumer bc", "consumer", "to"]);
      const information = readCell(row, [
        "information or decision exchanged",
        "information",
        "decision exchanged",
      ]);
      return {
        id: slug(
          readCell(row, ["relationship id", "id", "stable id"]) ||
            `${fromName}-${toName}-${information}`,
        ),
        from: findBcId(fromName),
        to: findBcId(toName),
        information,
        sourceOfTruth: readCell(row, ["source of truth"]),
        consistency: readCell(row, ["consistency expectation", "consistency"]),
        interaction: readCell(row, ["candidate interaction", "interaction"]),
        translationAcl: readCell(row, ["translation acl", "translation", "acl"]),
        status: readCell(row, ["status"]) || "Provisional",
        inferred: true,
      };
    });

    const journeys = parseTable(markdown, "Cross-BC Journeys").map((row) => {
      const name = readCell(row, ["journey"]);
      const names = splitList(
        readCell(row, ["participating bc ids", "participating bcs", "bounded contexts"]),
      );
      return {
        id: slug(readCell(row, ["journey id", "id", "stable id"]) || name),
        name,
        boundedContextIds: names.map(findBcId),
        entryPoint: readCell(row, ["entry point"]),
        outcome: readCell(row, ["business outcome", "outcome"]),
        validationArtifact: readCell(row, ["validation artifact"]),
        inferred: true,
      };
    });
    return { relationships, journeys, diagnostics };
  }

  function parseFrontmatter(markdown) {
    const match = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return {};
    const result = {};
    for (const line of match[1].split(/\r?\n/)) {
      const separator = line.indexOf(":");
      if (separator < 0) continue;
      result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
    return result;
  }

  function parsePorts(markdown) {
    const rows = parseTable(markdown, "Ports");
    if (rows.length > 0) {
      return rows.map((row) => ({
        name: readCell(row, ["port", "name"]),
        direction: normalizeEnum(
          readCell(row, ["direction"]),
          DIRECTIONS,
          "UNKNOWN",
        ),
        purpose: readCell(row, ["purpose"]),
        contract: readCell(row, ["contract status", "contract", "status"]),
        inferred: true,
      }));
    }
    const names = new Set();
    const regex = /\b(?:interface|class)\s+([A-Z][A-Za-z0-9]*(?:Port|Repository))\b/g;
    let match;
    while ((match = regex.exec(markdown)) !== null) names.add(match[1]);
    const repositoryFile = /\b([a-z][a-z0-9-]+)\.repository\.ts\b/g;
    while ((match = repositoryFile.exec(markdown)) !== null) {
      const name = match[1]
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
      names.add(`${name}Repository`);
    }
    return Array.from(names).map((name) => ({
      name,
      direction: name.endsWith("Repository") ? "OUTBOUND" : "UNKNOWN",
      purpose: "",
      contract: "domain-model.md",
      inferred: true,
    }));
  }

  function parseAcl(markdown, path) {
    const title = markdown.match(/^#\s+(.+)$/m);
    const purpose = section(markdown, "Purpose").trim().split(/\n\n/)[0] || "";
    const filename = path.split("/").pop().replace(/\.md$/i, "");
    return {
      name: stripMarkdown(title ? title[1] : filename),
      system: filename.replace(/-acl$/i, "").replace(/-/g, " "),
      direction: "OUTBOUND",
      purpose: stripMarkdown(purpose),
      file: path,
      inferred: true,
    };
  }

  function normalizePath(path) {
    return String(path || "").replaceAll("\\", "/").replace(/^\/+/, "");
  }

  function relativeProjectPath(path) {
    const normalized = normalizePath(path);
    const markers = ["docs/", ".github/skills/"];
    for (const marker of markers) {
      const index = normalized.indexOf(marker);
      if (index >= 0) return normalized.slice(index);
    }
    return normalized.split("/").slice(1).join("/");
  }

  function validateProject(raw) {
    const diagnostics = [];
    const error = (message) => diagnostics.push({ severity: "error", message });
    const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
    const isString = (value) => typeof value === "string";
    const validId = (value) => isString(value) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
    const validateStringArray = (value, field) => {
      if (!Array.isArray(value) || value.some((item) => !isString(item))) {
        error(`${field} must be an array of strings.`);
        return false;
      }
      return true;
    };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return [{ severity: "error", message: "Project manifest must be a JSON object." }];
    }
    if (raw.schemaVersion !== SCHEMA_VERSION) {
      diagnostics.push({
        severity: "error",
        message: `Unsupported schemaVersion ${String(raw.schemaVersion)}; expected ${SCHEMA_VERSION}.`,
      });
    }
    for (const field of ["domains", "boundedContexts", "relationships", "journeys"]) {
      if (!Array.isArray(raw[field])) {
        error(`${field} must be an array.`);
      }
    }
    if (!isObject(raw.project) || !isString(raw.project.name) || !raw.project.name.trim()) {
      error("project.name is required.");
    }
    const domainIds = new Set();
    for (const domain of Array.isArray(raw.domains) ? raw.domains : []) {
      if (!isObject(domain) || !validId(domain.id) || !isString(domain.name)) {
        error("Every domain requires a kebab-case id and name.");
        continue;
      }
      if (domainIds.has(domain.id)) error(`Duplicate domain id: ${domain.id}.`);
      domainIds.add(domain.id);
      if (!CLASSIFICATIONS.has(domain.classification)) {
        error(`${domain.id} has invalid classification ${String(domain.classification)}.`);
      }
      if (!isString(domain.purpose)) error(`${domain.id}.purpose must be a string.`);
    }
    const contexts = Array.isArray(raw.boundedContexts) ? raw.boundedContexts : [];
    const ids = new Set();
    for (const bc of contexts) {
      if (!isObject(bc) || !validId(bc.id) || !isString(bc.name)) {
        error("Every bounded context requires a kebab-case id and name.");
        continue;
      }
      if (ids.has(bc.id)) {
        error(`Duplicate bounded context id: ${bc.id}.`);
      }
      ids.add(bc.id);
      if (!domainIds.has(bc.domainId)) error(`${bc.id} references unknown domain ${bc.domainId}.`);
      if (!CLASSIFICATIONS.has(bc.classification)) {
        error(`${bc.id} has invalid classification ${String(bc.classification)}.`);
      }
      if (!ROLES.has(bc.role)) {
        error(`${bc.id} has invalid role ${String(bc.role)}.`);
      }
      if (!LIFECYCLES.has(bc.lifecycle)) {
        error(`${bc.id} has invalid lifecycle ${String(bc.lifecycle)}.`);
      }
      for (const field of ["owns", "doesNotOwn"]) validateStringArray(bc[field], `${bc.id}.${field}`);
      if (!Array.isArray(bc.capabilities)) {
        error(`${bc.id}.capabilities must be an array.`);
      } else {
        for (const capability of bc.capabilities) {
          if (
            !isObject(capability) ||
            !isString(capability.name) ||
            !["CONFIRMED", "PROVISIONAL"].includes(capability.status)
          ) {
            error(`${bc.id} has an invalid capability.`);
          }
        }
      }
      if (!Array.isArray(bc.ports)) {
        error(`${bc.id}.ports must be an array.`);
      } else {
        for (const port of bc.ports) {
          if (
            !isObject(port) ||
            !isString(port.name) ||
            !DIRECTIONS.has(port.direction) ||
            !isString(port.purpose) ||
            !isString(port.contract)
          ) {
            error(`${bc.id} has an invalid port.`);
          }
        }
      }
      if (!Array.isArray(bc.acls)) {
        error(`${bc.id}.acls must be an array.`);
      } else {
        for (const acl of bc.acls) {
          if (
            !isObject(acl) ||
            !isString(acl.name) ||
            !isString(acl.system) ||
            !DIRECTIONS.has(acl.direction) ||
            !isString(acl.file)
          ) {
            error(`${bc.id} has an invalid ACL.`);
          }
        }
      }
      if (!isObject(bc.sources) || Object.values(bc.sources).some((value) => !isString(value))) {
        error(`${bc.id}.sources must be an object of path strings.`);
      }
    }
    const relationshipIds = new Set();
    for (const relation of Array.isArray(raw.relationships) ? raw.relationships : []) {
      if (!isObject(relation) || !validId(relation.id) || !isString(relation.information)) {
        error("Every relationship requires a kebab-case id and information string.");
        continue;
      }
      if (relationshipIds.has(relation.id)) error(`Duplicate relationship id: ${relation.id}.`);
      relationshipIds.add(relation.id);
      if (!ids.has(relation.from) || !ids.has(relation.to)) {
        error(`Relationship ${relation.id} references an unknown BC.`);
      }
      if (!isString(relation.status)) error(`${relation.id}.status must be a string.`);
    }
    const journeyIds = new Set();
    for (const journey of Array.isArray(raw.journeys) ? raw.journeys : []) {
      if (!isObject(journey) || !validId(journey.id) || !isString(journey.name)) {
        error("Every journey requires a kebab-case id and name.");
        continue;
      }
      if (journeyIds.has(journey.id)) error(`Duplicate journey id: ${journey.id}.`);
      journeyIds.add(journey.id);
      if (
        !Array.isArray(journey.boundedContextIds) ||
        journey.boundedContextIds.some((id) => !ids.has(id))
      ) {
        error(`Journey ${journey.id} references an unknown BC.`);
      }
    }
    return diagnostics;
  }

  function normalizeProject(raw, sourceMode) {
    return {
      schemaVersion: SCHEMA_VERSION,
      project: raw.project || { name: "hGATE project", description: "" },
      domains: raw.domains || [],
      boundedContexts: (raw.boundedContexts || []).map((bc) => ({
        purpose: "",
        owns: [],
        doesNotOwn: [],
        capabilities: [],
        ports: [],
        acls: [],
        sources: {},
        lifecycle: "DISCOVERED",
        inferred: sourceMode === "legacy",
        ...bc,
      })),
      relationships: raw.relationships || [],
      journeys: raw.journeys || [],
      sourceMode,
    };
  }

  async function buildLegacyProject(fileMap) {
    const diagnostics = [];
    const domainFile = fileMap.get("docs/domain-map.md");
    const contextFile = fileMap.get("docs/context-map.md");
    if (!domainFile) {
      return {
        project: normalizeProject({}, "legacy"),
        diagnostics: [{ severity: "error", message: "docs/domain-map.md was not found." }],
      };
    }
    const domainMarkdown = await domainFile.text();
    const domain = parseDomainMap(domainMarkdown);
    diagnostics.push(...domain.diagnostics);
    const context = contextFile
      ? parseContextMap(await contextFile.text(), domain.boundedContexts)
      : { relationships: [], journeys: [], diagnostics: [] };
    diagnostics.push(...context.diagnostics);
    if (!contextFile) {
      diagnostics.push({ severity: "warning", message: "docs/context-map.md was not found." });
    }

    for (const bc of domain.boundedContexts) {
      const prefix = `.github/skills/${bc.id}/`;
      const statusFile = fileMap.get(`${prefix}status.md`);
      const skillFile = fileMap.get(`${prefix}SKILL.md`);
      const modelFile = fileMap.get(`${prefix}domain-model.md`);
      if (statusFile) {
        const statusMarkdown = await statusFile.text();
        const frontmatter = parseFrontmatter(statusMarkdown);
        bc.lifecycle = normalizeEnum(frontmatter.lifecycle, LIFECYCLES, bc.lifecycle);
        bc.classification = normalizeClassification(frontmatter.classification, bc.classification);
        bc.sources.status = `${prefix}status.md`;
      }
      if (skillFile) {
        const skillMarkdown = await skillFile.text();
        const purpose = section(skillMarkdown, "Purpose").trim().split(/\n\n/)[0];
        if (purpose) bc.purpose = stripMarkdown(purpose);
        bc.ports.push(...parsePorts(skillMarkdown));
        bc.sources.skill = `${prefix}SKILL.md`;
      }
      if (modelFile) {
        bc.ports.push(...parsePorts(await modelFile.text()));
        bc.ports = bc.ports.filter(
          (port, index, ports) => ports.findIndex((candidate) => candidate.name === port.name) === index,
        );
        bc.sources.domainModel = `${prefix}domain-model.md`;
      }
      for (const [path, file] of fileMap.entries()) {
        if (path.startsWith(prefix) && /-acl\.md$/i.test(path)) {
          bc.acls.push(parseAcl(await file.text(), path));
        }
      }
    }

    const project = normalizeProject(
      {
        project: { name: "Legacy hGATE project", description: "Derived from Markdown artifacts" },
        domains: domain.domains,
        boundedContexts: domain.boundedContexts,
        relationships: context.relationships,
        journeys: context.journeys,
      },
      "legacy",
    );
    diagnostics.push({
      severity: "warning",
      message: "Using legacy Markdown extraction. Inferred fields are marked in the detail view.",
    });
    return { project, diagnostics };
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function appendList(parent, title, items, formatter) {
    const sectionElement = createElement("section", "project-detail-section");
    sectionElement.append(createElement("h3", "", title));
    if (!items || items.length === 0) {
      sectionElement.append(createElement("p", "muted", "Not documented."));
    } else {
      const list = createElement("ul");
      for (const item of items) list.append(createElement("li", "", formatter(item)));
      sectionElement.append(list);
    }
    parent.append(sectionElement);
  }

  function renderSummary(project, container) {
    container.replaceChildren();
    const entries = [
      [project.domains.length, "domain"],
      [project.boundedContexts.length, "bounded context"],
      [project.relationships.length, "relationship"],
      [project.journeys.length, "journey"],
    ];
    for (const [count, label] of entries) {
      container.append(
        createElement("span", "summary-pill", `${count} ${label}${count === 1 ? "" : "s"}`),
      );
    }
    container.append(
      createElement(
        "span",
        `source-badge ${project.sourceMode}`,
        project.sourceMode === "canonical" ? "Canonical JSON" : "Legacy Markdown",
      ),
    );
  }

  function renderDiagnostics(diagnostics, container) {
    container.replaceChildren();
    for (const diagnostic of diagnostics) {
      container.append(
        createElement(
          "div",
          `diagnostic ${diagnostic.severity || "info"}`,
          diagnostic.message,
        ),
      );
    }
    container.hidden = diagnostics.length === 0;
  }

  function layoutProject(project) {
    const groups = new Map();
    for (const bc of [...project.boundedContexts].sort((a, b) => a.name.localeCompare(b.name))) {
      const key = bc.domainId || "unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(bc);
    }
    const columns = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
    const positions = new Map();
    columns.forEach(([domainId, contexts], columnIndex) => {
      contexts.forEach((bc, rowIndex) => {
        positions.set(bc.id, {
          x: 40 + columnIndex * COLUMN_STEP,
          y: 65 + rowIndex * 130,
          domainId,
        });
      });
    });
    const maxRows = Math.max(1, ...columns.map(([, contexts]) => contexts.length));
    return {
      columns,
      positions,
      width: Math.max(520, columns.length * COLUMN_STEP + 40),
      height: Math.max(280, maxRows * 130 + 80),
    };
  }

  function svgElement(tag, attributes) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes || {})) {
      element.setAttribute(name, String(value));
    }
    return element;
  }

  function renderTopology(project, container, onSelect) {
    container.replaceChildren();
    const layout = layoutProject(project);
    const svg = svgElement("svg", {
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      role: "img",
      "aria-label": "Bounded context topology",
    });
    const defs = svgElement("defs");
    const marker = svgElement("marker", {
      id: "project-arrow",
      viewBox: "0 0 10 10",
      refX: "9",
      refY: "5",
      markerWidth: "7",
      markerHeight: "7",
      orient: "auto-start-reverse",
    });
    marker.append(svgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "graph-arrow" }));
    defs.append(marker);
    svg.append(defs);

    for (const [domainId] of layout.columns) {
      const first = Array.from(layout.positions.values()).find((position) => position.domainId === domainId);
      if (!first) continue;
      const label = svgElement("text", { x: first.x, y: 30, class: "graph-domain-label" });
      const domain = project.domains.find((item) => item.id === domainId);
      label.textContent = domain ? domain.name : domainId;
      svg.append(label);
    }

    for (const relation of project.relationships) {
      const from = layout.positions.get(relation.from);
      const to = layout.positions.get(relation.to);
      if (!from || !to) continue;
      const line = svgElement("line", {
        x1: from.x + NODE_WIDTH,
        y1: from.y + 40,
        x2: to.x,
        y2: to.y + 40,
        class: "graph-edge",
        "marker-end": "url(#project-arrow)",
      });
      svg.append(line);
      const fullLabel = relation.information || relation.interaction || "";
      const displayLabel = abbreviateEdgeLabel(fullLabel);
      const labelX = (from.x + NODE_WIDTH + to.x) / 2;
      const labelY = (from.y + to.y) / 2 + 19;
      const labelWidth = Math.min(178, Math.max(54, displayLabel.length * 6.2 + 14));
      const labelBackground = svgElement("rect", {
        x: labelX - labelWidth / 2,
        y: labelY - 14,
        width: labelWidth,
        height: 19,
        rx: 7,
        class: "graph-edge-label-background",
      });
      const edgeLabel = svgElement("text", {
        x: labelX,
        y: labelY,
        class: "graph-edge-label",
      });
      edgeLabel.textContent = displayLabel;
      const title = svgElement("title");
      title.textContent = fullLabel;
      edgeLabel.append(title);
      svg.append(labelBackground, edgeLabel);
    }

    for (const bc of project.boundedContexts) {
      const position = layout.positions.get(bc.id);
      if (!position) continue;
      const group = svgElement("g", {
        class: `graph-node classification-${bc.classification.toLowerCase()} role-${bc.role.toLowerCase()}${bc.inferred ? " inferred" : ""}`,
        tabindex: "0",
        role: "button",
        "aria-label": `${bc.name}, ${bc.classification}, ${bc.role}`,
      });
      group.append(
        svgElement("rect", {
          x: position.x,
          y: position.y,
          width: NODE_WIDTH,
          height: 80,
          rx: 12,
        }),
      );
      const title = svgElement("text", { x: position.x + 12, y: position.y + 28, class: "graph-node-title" });
      title.textContent = bc.name;
      const meta = svgElement("text", { x: position.x + 12, y: position.y + 52, class: "graph-node-meta" });
      meta.textContent = `${bc.classification} · ${bc.role}`;
      const lifecycle = svgElement("text", { x: position.x + 12, y: position.y + 69, class: "graph-node-lifecycle" });
      lifecycle.textContent = bc.lifecycle || "Unconfirmed";
      group.append(title, meta, lifecycle);
      const select = () => onSelect(bc.id);
      group.addEventListener("click", select);
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      });
      svg.append(group);
    }
    container.append(svg);
  }

  function renderDetails(project, bcId, container) {
    container.replaceChildren();
    const bc = project.boundedContexts.find((item) => item.id === bcId);
    if (!bc) {
      container.append(createElement("p", "muted", "Select a bounded context to inspect it."));
      return;
    }
    const heading = createElement("div", "project-detail-heading");
    heading.append(createElement("h2", "", bc.name));
    if (bc.inferred) heading.append(createElement("span", "inferred-badge", "Inferred"));
    container.append(heading);
    container.append(
      createElement(
        "p",
        "project-meta",
        `${bc.classification} · ${bc.role} · ${bc.lifecycle || "UNCONFIRMED"}`,
      ),
    );
    if (bc.purpose) container.append(createElement("p", "", bc.purpose));
    appendList(container, "Owns", bc.owns, String);
    appendList(container, "Does not own", bc.doesNotOwn, String);
    appendList(
      container,
      "Capabilities",
      bc.capabilities,
      (item) => `${item.name}${item.outcome ? ` — ${item.outcome}` : ""}`,
    );
    appendList(
      container,
      "Ports",
      bc.ports,
      (item) => `${item.name} (${item.direction || "UNKNOWN"})${item.purpose ? ` — ${item.purpose}` : ""}`,
    );
    appendList(
      container,
      "ACLs",
      bc.acls,
      (item) => `${item.name}${item.system ? ` — ${item.system}` : ""}`,
    );
    appendList(
      container,
      "Inbound relationships",
      project.relationships.filter((relation) => relation.to === bc.id),
      (item) => `${item.from} → ${item.information}`,
    );
    appendList(
      container,
      "Outbound relationships",
      project.relationships.filter((relation) => relation.from === bc.id),
      (item) => `${item.to} → ${item.information}`,
    );
    appendList(
      container,
      "Journeys",
      project.journeys.filter((journey) => journey.boundedContextIds.includes(bc.id)),
      (item) => item.name,
    );
  }

  function indexFiles(files) {
    const map = new Map();
    for (const file of Array.from(files || [])) {
      const path = relativeProjectPath(file.webkitRelativePath || file.name);
      if (
        path === "docs/hgate-project.json" ||
        path === "docs/domain-map.md" ||
        path === "docs/context-map.md" ||
        /^\.github\/skills\/[^/]+\/(?:SKILL|domain-model|status|[^/]+-acl)\.md$/i.test(path)
      ) {
        map.set(path, file);
      }
    }
    return map;
  }

  async function loadProject(fileMap) {
    const manifest = fileMap.get("docs/hgate-project.json");
    if (manifest) {
      try {
        const raw = JSON.parse(await manifest.text());
        const diagnostics = validateProject(raw);
        if (!diagnostics.some((item) => item.severity === "error")) {
          return { project: normalizeProject(raw, "canonical"), diagnostics };
        }
        const fallback = await buildLegacyProject(fileMap);
        return {
          project: fallback.project,
          diagnostics: [
            ...diagnostics,
            {
              severity: "warning",
              message: "The canonical manifest is invalid; displaying legacy Markdown fallback.",
            },
            ...fallback.diagnostics,
          ],
        };
      } catch (error) {
        const fallback = await buildLegacyProject(fileMap);
        return {
          project: fallback.project,
          diagnostics: [
            { severity: "error", message: `Could not parse docs/hgate-project.json: ${error.message}` },
            {
              severity: "warning",
              message: "Displaying legacy Markdown fallback.",
            },
            ...fallback.diagnostics,
          ],
        };
      }
    }
    return buildLegacyProject(fileMap);
  }

  function init() {
    const scenarioTab = document.getElementById("scenarioTab");
    const projectTab = document.getElementById("projectTab");
    const scenarioPanel = document.getElementById("scenarioPanel");
    const projectPanel = document.getElementById("projectPanel");
    const selectButton = document.getElementById("selectProjectBtn");
    const folderInput = document.getElementById("projectFolderInput");
    const summary = document.getElementById("projectSummary");
    const diagnostics = document.getElementById("projectDiagnostics");
    const graph = document.getElementById("projectGraph");
    const details = document.getElementById("projectDetails");
    const zoomOutButton = document.getElementById("zoomOutBtn");
    const zoomInButton = document.getElementById("zoomInBtn");
    const fitDiagramButton = document.getElementById("fitDiagramBtn");
    const zoomLevel = document.getElementById("zoomLevel");
    if (!scenarioTab || !projectTab || !folderInput) return;
    let diagramZoom = 100;

    const updateZoom = (nextZoom) => {
      diagramZoom = clampZoom(nextZoom);
      const svg = graph.querySelector("svg");
      if (svg) svg.style.width = `${diagramZoom}%`;
      zoomLevel.value = `${diagramZoom}%`;
      zoomLevel.textContent = `${diagramZoom}%`;
      zoomOutButton.disabled = !svg || diagramZoom <= MIN_ZOOM;
      zoomInButton.disabled = !svg || diagramZoom >= MAX_ZOOM;
      fitDiagramButton.disabled = !svg || diagramZoom === 100;
    };

    const activate = (tab) => {
      const projectActive = tab === "project";
      scenarioPanel.hidden = projectActive;
      projectPanel.hidden = !projectActive;
      scenarioTab.setAttribute("aria-selected", String(!projectActive));
      projectTab.setAttribute("aria-selected", String(projectActive));
    };
    scenarioTab.addEventListener("click", () => activate("scenario"));
    projectTab.addEventListener("click", () => activate("project"));
    selectButton.addEventListener("click", () => folderInput.click());
    zoomOutButton.addEventListener("click", () => updateZoom(diagramZoom - ZOOM_STEP));
    zoomInButton.addEventListener("click", () => updateZoom(diagramZoom + ZOOM_STEP));
    fitDiagramButton.addEventListener("click", () => updateZoom(100));
    folderInput.addEventListener("change", async () => {
      diagnostics.hidden = true;
      details.replaceChildren(createElement("p", "muted", "Loading project artifacts..."));
      try {
        const fileMap = indexFiles(folderInput.files);
        const loaded = await loadProject(fileMap);
        renderSummary(loaded.project, summary);
        renderDiagnostics(loaded.diagnostics, diagnostics);
        const select = (bcId) => renderDetails(loaded.project, bcId, details);
        renderTopology(loaded.project, graph, select);
        updateZoom(100);
        select(loaded.project.boundedContexts[0] && loaded.project.boundedContexts[0].id);
      } catch (error) {
        renderDiagnostics(
          [{ severity: "error", message: `Could not load project: ${error.message}` }],
          diagnostics,
        );
      }
    });
    activate("scenario");
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  return {
    SCHEMA_VERSION,
    slug,
    parseTable,
    parseDomainMap,
    parseContextMap,
    parseFrontmatter,
    parsePorts,
    parseAcl,
    validateProject,
    normalizeProject,
    buildLegacyProject,
    indexFiles,
    loadProject,
    layoutProject,
    clampZoom,
    abbreviateEdgeLabel,
  };
});
