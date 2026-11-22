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

  // Latest projection schema; the viewer reads every supported version.
  const SCHEMA_VERSION = 2;
  const SUPPORTED_SCHEMA_VERSIONS = [1, 2];
  const CLASSIFICATIONS = new Set(["CORE", "SUPPORTING", "GENERIC", "UNCONFIRMED"]);
  const ROLES = new Set(["PRIMARY", "SHARED", "SUPPORTING", "UNCONFIRMED"]);
  const DIRECTIONS = new Set(["INBOUND", "OUTBOUND", "BIDIRECTIONAL", "UNKNOWN"]);
  const MIN_ZOOM = 50;
  const MAX_ZOOM = 200;
  const ZOOM_STEP = 25;
  const NODE_WIDTH = 180;
  const COLUMN_STEP = 390;
  const MAX_EDGE_LABEL_LENGTH = 26;
  // Agent-specific skill folders, in lookup order: GitHub Copilot, Claude Code, Codex/agents.
  const SKILLS_ROOTS = [".github/skills", ".claude/skills", ".agents/skills", ".codex/skills"];
  const PROJECT_DOCS = ["hgate-project.json", "domain-map.md", "context-map.md"];
  const SKILL_FILE_PATTERN = /^(?:SKILL|domain-model|status|bdd-scenarios|[^/]+-acl)\.md$/i;
  // Files that mark a skill folder as a bounded context rather than an hGATE workflow skill.
  const BC_MARKER_PATTERN = /^(?:domain-model|status|bdd-scenarios)\.md$/i;
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

  // webkitRelativePath always starts with the selected folder's name; drop it.
  function relativeProjectPath(path) {
    const normalized = normalizePath(path);
    const slash = normalized.indexOf("/");
    return slash >= 0 ? normalized.slice(slash + 1) : normalized;
  }

  function skillPathParts(path) {
    for (const root of SKILLS_ROOTS) {
      const prefix = `${root}/`;
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length).split("/");
      if (rest.length === 2 && rest[0] && SKILL_FILE_PATTERN.test(rest[1])) {
        return { root, skillId: rest[0], file: rest[1] };
      }
    }
    return null;
  }

  function isProjectFile(path) {
    return (
      PROJECT_DOCS.some((name) => path === `docs/${name}`) ||
      path === STATUS_REPORT_PATH ||
      skillPathParts(path) !== null
    );
  }

  function skillsRootOf(fileMap) {
    const parts = Array.from(fileMap.keys()).map(skillPathParts).filter(Boolean);
    const withBc = SKILLS_ROOTS.find((root) =>
      parts.some((part) => part.root === root && BC_MARKER_PATTERN.test(part.file)),
    );
    if (withBc) return withBc;
    const any = SKILLS_ROOTS.find((root) => parts.some((part) => part.root === root));
    return any || SKILLS_ROOTS[0];
  }

  function findScenarioPath(bc, fileMap) {
    if (!bc) return null;
    const candidates = [
      ...Object.values(bc.sources || {}).filter((path) => /bdd-scenarios\.md$/i.test(String(path))),
      ...SKILLS_ROOTS.map((root) => `${root}/${bc.id}/bdd-scenarios.md`),
    ];
    return candidates.map(normalizePath).find((path) => fileMap.has(path)) || null;
  }

  function listScenarioSources(project, fileMap) {
    const contexts = (project && project.boundedContexts) || [];
    const domains = (project && project.domains) || [];
    const groups = new Map();
    for (const bc of contexts) {
      const key = bc.domainId || "unassigned";
      if (!groups.has(key)) {
        const domain = domains.find((item) => item.id === key);
        groups.set(key, { label: domain ? domain.name : bc.domainId || "Unassigned", items: [] });
      }
      groups.get(key).items.push({ id: bc.id, name: bc.name || bc.id, path: findScenarioPath(bc, fileMap) });
    }
    const known = new Set(contexts.map((bc) => bc.id));
    const unmapped = new Map();
    for (const path of fileMap.keys()) {
      const part = skillPathParts(path);
      if (!part || !/^bdd-scenarios\.md$/i.test(part.file) || known.has(part.skillId)) continue;
      if (!unmapped.has(part.skillId)) unmapped.set(part.skillId, { id: part.skillId, name: part.skillId, path });
    }
    const result = Array.from(groups.values());
    if (unmapped.size > 0) {
      result.push({
        label: contexts.length > 0 ? "Not in domain map" : "Bounded contexts",
        items: Array.from(unmapped.values()).sort((a, b) => a.id.localeCompare(b.id)),
      });
    }
    return result;
  }

  async function childDirectory(handle, segments) {
    let current = handle;
    for (const segment of segments) {
      try {
        current = await current.getDirectoryHandle(segment);
      } catch (error) {
        if (error && (error.name === "NotFoundError" || error.name === "TypeMismatchError")) return null;
        throw error;
      }
    }
    return current;
  }

  // Reads only docs/ and the known skills folders from a File System Access API
  // directory handle, so large folders such as node_modules are never walked.
  async function readProjectDirectory(rootHandle) {
    const map = new Map();
    const docs = await childDirectory(rootHandle, ["docs"]);
    if (docs) {
      for (const name of PROJECT_DOCS) {
        try {
          const fileHandle = await docs.getFileHandle(name);
          map.set(`docs/${name}`, await fileHandle.getFile());
        } catch (error) {
          if (!error || (error.name !== "NotFoundError" && error.name !== "TypeMismatchError")) throw error;
        }
      }
    }
    const hgateDir = await childDirectory(rootHandle, [".hgate"]);
    if (hgateDir) {
      try {
        const fileHandle = await hgateDir.getFileHandle("status.json");
        map.set(STATUS_REPORT_PATH, await fileHandle.getFile());
      } catch (error) {
        if (!error || (error.name !== "NotFoundError" && error.name !== "TypeMismatchError")) throw error;
      }
    }
    for (const root of SKILLS_ROOTS) {
      const skillsDir = await childDirectory(rootHandle, root.split("/"));
      if (!skillsDir) continue;
      for await (const [skillId, skillHandle] of skillsDir.entries()) {
        if (skillHandle.kind !== "directory") continue;
        for await (const [fileName, fileHandle] of skillHandle.entries()) {
          if (fileHandle.kind === "file" && SKILL_FILE_PATTERN.test(fileName)) {
            map.set(`${root}/${skillId}/${fileName}`, await fileHandle.getFile());
          }
        }
      }
    }
    return map;
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
    if (!SUPPORTED_SCHEMA_VERSIONS.includes(raw.schemaVersion)) {
      diagnostics.push({
        severity: "error",
        message:
          `Unsupported schemaVersion ${String(raw.schemaVersion)}; ` +
          `expected ${SUPPORTED_SCHEMA_VERSIONS.join(" or ")}.`,
      });
    }
    // Schema v2 additions are optional for the viewer; when present they must be arrays.
    for (const field of ["gaps", "diagnostics"]) {
      if (raw[field] !== undefined && !Array.isArray(raw[field])) error(`${field} must be an array.`);
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
      for (const field of ["blockers", "transitions", "gates", "openItems", "signoffs"]) {
        if (bc[field] !== undefined && !Array.isArray(bc[field])) error(`${bc.id}.${field} must be an array.`);
      }
      if (bc.stats !== undefined && !isObject(bc.stats)) error(`${bc.id}.stats must be an object.`);
      if (bc.gateStatus !== undefined && bc.gateStatus !== null && !isObject(bc.gateStatus)) {
        error(`${bc.id}.gateStatus must be an object or null.`);
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

  // v1 and legacy-Markdown projects get empty defaults for the schema v2 fields.
  function normalizeProject(raw, sourceMode) {
    return {
      schemaVersion: SUPPORTED_SCHEMA_VERSIONS.includes(raw.schemaVersion) ? raw.schemaVersion : 1,
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
        nextSkill: null,
        blockers: [],
        transitions: [],
        gates: [],
        openItems: [],
        stats: {},
        signoffs: [],
        ...bc,
      })),
      relationships: raw.relationships || [],
      journeys: raw.journeys || [],
      gaps: Array.isArray(raw.gaps) ? raw.gaps : [],
      diagnostics: Array.isArray(raw.diagnostics) ? raw.diagnostics : [],
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

    const skillsRoot = skillsRootOf(fileMap);
    for (const bc of domain.boundedContexts) {
      const prefix = `${skillsRoot}/${bc.id}/`;
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

  // ---------------------------------------------------------------------------
  // Board model (schema v2). Pure functions so they can be unit tested in Node.
  // ---------------------------------------------------------------------------

  const STATUS_REPORT_PATH = ".hgate/status.json";
  const MAIN_LIFECYCLES = [
    "DISCOVERED",
    "REFINING",
    "REFINED",
    "SPEC_REVIEWED",
    "IMPLEMENTING",
    "IMPLEMENTED",
    "VERIFIED",
  ];
  // Shown only when at least one BC is in the state.
  const OPTIONAL_LIFECYCLES = ["CHANGING", "BLOCKED", "DEPRECATED"];
  const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  // Optional in lifecycle-gates.md (Rule 5); the fallback summary skips it.
  const FALLBACK_OPTIONAL_GATES = new Set(["GATE-IMPL-PROPS"]);

  function lifecycleLabel(state) {
    return String(state || "")
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function transitionKey(value) {
    return String(value || "")
      .replace(/→/g, "->")
      .replace(/\s+/g, " ")
      .trim();
  }

  function transitionTarget(value) {
    const parts = transitionKey(value).split("->");
    return parts.length > 1 ? parts[parts.length - 1].trim() : "";
  }

  // Copy of tools/shared/transitions.mjs (the viewer runs without imports).
  // Projections emit transitions chronologically; this is defensive for older
  // projections built from newest-first Transition History tables.
  const TRANSITION_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const cleanCell = (value) => String(value == null ? "" : value).replace(/`/g, "").trim();

  function orderTransitions(rows) {
    const list = Array.isArray(rows) ? rows.filter((row) => row) : [];
    if (list.length < 2) return list.slice();
    const first = list[0];
    const last = list[list.length - 1];
    const newestFirst =
      cleanCell(first.date) >= cleanCell(last.date) && cleanCell(last.from) === "-" && cleanCell(first.from) !== "-";
    const base = newestFirst ? list.slice().reverse() : list.slice();
    if (!base.every((row) => TRANSITION_DATE.test(cleanCell(row.date)))) return base;
    const sorted = base
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const da = cleanCell(a.row.date);
        const db = cleanCell(b.row.date);
        return da < db ? -1 : da > db ? 1 : a.index - b.index;
      })
      .map((entry) => entry.row);
    const result = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && cleanCell(sorted[j + 1].date) === cleanCell(sorted[i].date)) j += 1;
      const pending = sorted.slice(i, j + 1);
      let previousTo = result.length ? cleanCell(result[result.length - 1].to) : null;
      while (pending.length) {
        let pick = pending.findIndex((row) => cleanCell(row.from) === "-");
        if (pick === -1 && previousTo !== null) pick = pending.findIndex((row) => cleanCell(row.from) === previousTo);
        if (pick === -1) {
          pick = pending.findIndex(
            (row) => !pending.some((other) => other !== row && cleanCell(other.to) === cleanCell(row.from)),
          );
        }
        if (pick === -1) pick = 0;
        const picked = pending.splice(pick, 1)[0];
        result.push(picked);
        previousTo = cleanCell(picked.to);
      }
      i = j + 1;
    }
    return result;
  }

  // Latest transition in chronological order (either file order is accepted).
  function latestTransition(bc) {
    const ordered = orderTransitions((bc && bc.transitions) || []);
    return ordered.length ? ordered[ordered.length - 1] : null;
  }

  // Summarizes the gates of the transition into the BC's current lifecycle.
  // Projections carry bc.gateStatus, computed by tools/shared/gate-rules.mjs
  // with the Validity Rules of lifecycle-gates.md (required gates from the
  // catalog, N/A unmet on required gates, rows dated before the transition
  // ignored); the card shows it as-is. Without gateStatus (older projections,
  // legacy Markdown) a best-effort fallback reads bc.gates: only the latest
  // row per gate counts (FAIL → PASS counts as PASS), N/A is unmet, rows dated
  // before the current transition are ignored, and the optional
  // GATE-IMPL-PROPS is left out. The fallback cannot see required gates that
  // have no row, so it never reports a missing gate.
  function summarizeGates(bc) {
    if (bc && isPlainObject(bc.gateStatus)) return summarizeGateStatus(bc.gateStatus);
    const target = bc && bc.lifecycle;
    const current = latestTransitionInto(bc, target);
    const currentKey = current ? transitionKey(`${cleanCell(current.from)} -> ${cleanCell(current.to)}`) : null;
    const currentDate = current && TRANSITION_DATE.test(cleanCell(current.date)) ? cleanCell(current.date) : null;
    const latest = new Map();
    ((bc && bc.gates) || []).forEach((row, index) => {
      if (!row || transitionTarget(row.transition) !== target) return;
      if (FALLBACK_OPTIONAL_GATES.has(row.gate)) return;
      if (currentKey && transitionKey(row.transition) !== currentKey) return;
      const date = String(row.date || "");
      if (currentDate && TRANSITION_DATE.test(date) && date < currentDate) return;
      const previous = latest.get(row.gate);
      if (!previous || date >= String(previous.row.date || "")) {
        latest.set(row.gate, { row, index });
      }
    });
    const rows = Array.from(latest.values())
      .sort((a, b) => a.index - b.index)
      .map((entry) => entry.row);
    const count = (predicate) => rows.filter(predicate).length;
    const failedGates = rows.filter((row) => row.result === "FAIL").map((row) => row.gate);
    const unmet = rows.filter((row) => !fallbackSatisfied(row));
    const satisfied = rows.length - unmet.length;
    const invalid = unmet.length > 0;
    return {
      source: "gates",
      transition: rows.length ? transitionKey(rows[rows.length - 1].transition) : null,
      total: rows.length,
      satisfied,
      passed: count((row) => row.result === "PASS"),
      notApplicable: count((row) => row.result === "N/A"),
      failed: failedGates.length,
      pending: Math.max(0, unmet.length - failedGates.length),
      failedGates,
      unmetGates: unmet.map((row) => `${row.gate} (${row.result || "no result"})`),
      hasFail: failedGates.length > 0,
      valid: rows.length > 0 && !invalid,
      invalid,
      label: rows.length ? `${satisfied}/${rows.length} gates` : "No gates recorded",
    };
  }

  // Projection gateStatus (schema v2, optional field) → card summary.
  function summarizeGateStatus(status) {
    const required = Array.isArray(status.required) ? status.required.filter(isPlainObject) : [];
    const optional = Array.isArray(status.optional) ? status.optional.filter(isPlainObject) : [];
    const all = required.concat(optional);
    const total = numberOrNull(status.total) !== null ? status.total : required.length;
    const satisfied =
      numberOrNull(status.satisfied) !== null ? status.satisfied : required.filter((g) => g.satisfied).length;
    const failedGates = all.filter((g) => g.result === "FAIL").map((g) => g.gate);
    const unmet = all.filter((g) => !g.satisfied);
    const valid = status.valid === true;
    return {
      source: "gateStatus",
      transition: typeof status.transition === "string" ? status.transition : null,
      total,
      satisfied,
      passed: required.filter((g) => g.result === "PASS").length,
      notApplicable: required.filter((g) => g.result === "N/A").length,
      failed: failedGates.length,
      pending: Math.max(0, total - satisfied - required.filter((g) => g.result === "FAIL").length),
      failedGates,
      unmetGates: unmet.map((g) => `${g.gate} (${g.result || "no row"})`),
      hasFail: failedGates.length > 0,
      valid,
      invalid: !valid,
      label: total ? `${satisfied}/${total} gates` : "No gates required",
    };
  }

  function latestTransitionInto(bc, target) {
    const ordered = orderTransitions((bc && bc.transitions) || []).filter((row) => cleanCell(row.to) === target);
    return ordered.length ? ordered[ordered.length - 1] : null;
  }

  // Fallback: PASS, or WAIVED signed by a Tech lead with a reason (Rule 3).
  function fallbackSatisfied(row) {
    if (row.result === "PASS") return true;
    return (
      row.result === "WAIVED" &&
      /\(\s*tech lead\s*\)\s*$/i.test(String(row.signedBy || "")) &&
      String(row.evidence || "").trim() !== ""
    );
  }

  function numberOrNull(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function warningBannerText(count) {
    if (!count) return "";
    return `${count} warning${count === 1 ? "" : "s"} in the project projection`;
  }

  // PARTIAL (scoped resolution, still open) reads as "Partial"; other states as-is.
  function gapStateLabel(state) {
    return state === "PARTIAL" ? "Partial" : state;
  }

  // Open gaps: every state except RESOLVED (PARTIAL counts as open).
  function isOpenGap(gap) {
    return Boolean(gap) && gap.state !== "RESOLVED";
  }

  // T13: adaptive gap attention panel. Severity order for unresolved gaps.
  const GAP_SEVERITY = ["MIXED", "OPEN", "PARTIAL", "DEFERRED"];

  // Chip order and wording in the panel header ("2 open · 3 partial · 1 drift").
  const GAP_PANEL_CHIPS = [
    { key: "open", state: "OPEN", word: "open" },
    { key: "partial", state: "PARTIAL", word: "partial" },
    { key: "mixed", state: "MIXED", word: "drift" },
    { key: "deferred", state: "DEFERRED", word: "deferred" },
    { key: "resolved", state: "RESOLVED", word: "resolved" },
  ];

  // Natural order for gap IDs: G2 before G11.
  function compareGapIds(left, right) {
    return String(left || "").localeCompare(String(right || ""), "en", { numeric: true, sensitivity: "base" });
  }

  // Pure panel model: level follows the most severe gap state present.
  function gapPanelModel(gaps) {
    const list = Array.isArray(gaps) ? gaps.filter(Boolean) : [];
    const stateOf = (gap) => gap.state || "OPEN";
    const counts = { open: 0, partial: 0, mixed: 0, deferred: 0, resolved: 0 };
    for (const gap of list) {
      const chip = GAP_PANEL_CHIPS.find((item) => item.state === stateOf(gap));
      counts[chip ? chip.key : "open"] += 1;
    }
    const rank = (gap) => {
      const index = GAP_SEVERITY.indexOf(stateOf(gap));
      return index === -1 ? 1 : index; // unknown states rank as OPEN
    };
    const unresolved = list
      .filter((gap) => stateOf(gap) !== "RESOLVED")
      .sort((left, right) => rank(left) - rank(right) || compareGapIds(left.id, right.id));
    const resolved = list
      .filter((gap) => stateOf(gap) === "RESOLVED")
      .sort((left, right) => compareGapIds(left.id, right.id));
    let level;
    let title;
    if (list.length === 0) {
      level = "empty";
      title = "No gaps recorded";
    } else if (counts.mixed || counts.open) {
      level = "attention";
      title = "Gaps need attention";
    } else if (counts.partial || counts.deferred) {
      level = "pending";
      title = "Gaps pending";
    } else {
      level = "clear";
      title = `All ${list.length} gap${list.length === 1 ? "" : "s"} resolved`;
    }
    const chips = GAP_PANEL_CHIPS.filter((item) => counts[item.key] > 0).map((item) => ({
      key: item.key,
      state: item.state,
      count: counts[item.key],
      text: `${counts[item.key]} ${item.word}`,
    }));
    return {
      level,
      title,
      counts,
      chips,
      chipText: chips.map((chip) => chip.text).join(" · "),
      unresolved,
      resolved,
    };
  }

  // --- Board redesign models (T14b) -----------------------------------------
  // Pure helpers behind the summary strip, the lifecycle matrix / kanban and the
  // collapsed gap dispositions. DOM renderers below only draw these models.

  // Main lifecycle state a BC sits at. Main states map to themselves; for
  // CHANGING / BLOCKED / DEPRECATED the latest main state found walking the
  // transitions backwards (to, then from); -1 position when none is known.
  function baseLifecycleOf(bc, lifecycle) {
    if (MAIN_LIFECYCLES.includes(lifecycle)) return lifecycle;
    const ordered = orderTransitions((bc && bc.transitions) || []);
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const to = cleanCell(ordered[index].to);
      const from = cleanCell(ordered[index].from);
      if (MAIN_LIFECYCLES.includes(to)) return to;
      if (MAIN_LIFECYCLES.includes(from)) return from;
    }
    return null;
  }

  const plural = (count, word, many) => `${count} ${count === 1 ? word : many || `${word}s`}`;

  // Summary strip: BCs by state, gates met, open gaps, warnings, last change.
  function buildSummaryStrip(board) {
    const cards = (board && board.cards) || [];
    const gaps = (board && board.gaps) || [];
    const states = MAIN_LIFECYCLES.concat(OPTIONAL_LIFECYCLES);
    const byState = states
      .map((state) => ({
        state,
        label: lifecycleLabel(state),
        optional: OPTIONAL_LIFECYCLES.includes(state),
        count: cards.filter((card) => card.lifecycle === state).length,
      }))
      .filter((entry) => entry.count > 0);
    const gated = cards.filter((card) => card.gateSummary && card.gateSummary.total > 0);
    const valid = cards.filter((card) => card.gateSummary && card.gateSummary.valid).length;
    const counts = gapPanelModel(gaps).counts;
    const openGaps = counts.open + counts.partial + counts.mixed;
    const gapParts = [
      counts.open ? `${counts.open} open` : "",
      counts.partial ? `${counts.partial} partial` : "",
      counts.mixed ? `${counts.mixed} drift` : "",
      counts.deferred ? `${counts.deferred} deferred` : "",
    ].filter(Boolean);
    const dated = cards
      .filter((card) => card.lifecycleDate && TRANSITION_DATE.test(card.lifecycleDate))
      .sort((a, b) => (a.lifecycleDate < b.lifecycleDate ? 1 : a.lifecycleDate > b.lifecycleDate ? -1 : a.name.localeCompare(b.name)));
    const latest = dated[0] || null;
    const warningCount = board && board.warnings ? board.warnings.count : 0;
    return {
      total: cards.length,
      byState,
      stateText: byState.map((entry) => `${entry.count} ${entry.label}`).join(" · ") || "No bounded contexts",
      gates: {
        valid,
        total: cards.length,
        gated: gated.length,
        allValid: cards.length > 0 && valid === cards.length,
        text: `${valid}/${cards.length}`,
        detail: cards.length ? `${plural(valid, "BC")} with valid gates` : "No bounded contexts",
        invalidNames: cards.filter((card) => card.gateSummary && !card.gateSummary.valid).map((card) => card.name),
      },
      gaps: {
        open: openGaps,
        deferred: counts.deferred,
        resolved: counts.resolved,
        total: gaps.length,
        tone: counts.open || counts.mixed ? "danger" : counts.partial || counts.deferred ? "warning" : "neutral",
        detail: gapParts.length ? gapParts.join(" · ") : gaps.length ? `All ${gaps.length} resolved` : "No gaps recorded",
      },
      warnings: {
        count: warningCount,
        tone: warningCount ? "warning" : "neutral",
        detail: warningCount ? "Projection drift; see diagnostics" : "No projection warnings",
      },
      lastChange: latest
        ? {
            date: latest.lifecycleDate,
            bcId: latest.id,
            bcName: latest.name,
            from: latest.lifecycleFrom,
            to: latest.lifecycle,
            text: `${latest.name} → ${lifecycleLabel(latest.lifecycle)}`,
          }
        : null,
    };
  }

  // One matrix row per BC; also the content of a kanban card.
  function matrixRow(card) {
    const base = card.baseLifecycle || (MAIN_LIFECYCLES.includes(card.lifecycle) ? card.lifecycle : null);
    const position = base ? MAIN_LIFECYCLES.indexOf(base) : -1;
    const optional = OPTIONAL_LIFECYCLES.includes(card.lifecycle);
    const gate = card.gateSummary || { satisfied: 0, total: 0, valid: false, unmetGates: [], transition: null };
    const gateTitle = [
      gate.total ? `${gate.satisfied} of ${gate.total} required gates satisfied` : "No gates required or recorded",
      gate.transition ? `Current transition: ${gate.transition}` : "",
      gate.unmetGates && gate.unmetGates.length ? `Unmet: ${gate.unmetGates.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      id: card.id,
      name: card.name,
      classification: card.classification,
      role: card.role,
      showRole: Boolean(card.role) && card.role !== card.classification && card.role !== "UNCONFIRMED",
      inferred: Boolean(card.inferred),
      lifecycle: card.lifecycle,
      lifecycleLabel: lifecycleLabel(card.lifecycle),
      lifecycleDate: card.lifecycleDate,
      position,
      marker: optional ? { state: card.lifecycle, label: lifecycleLabel(card.lifecycle) } : null,
      steps: MAIN_LIFECYCLES.map((state, index) => ({
        state,
        label: lifecycleLabel(state),
        status: position < 0 || index > position ? "future" : index === position ? "current" : "done",
      })),
      gates: {
        satisfied: gate.satisfied,
        total: gate.total,
        valid: Boolean(gate.valid),
        ratio: gate.total ? Math.min(1, gate.satisfied / gate.total) : 0,
        text: gate.total ? `${gate.satisfied}/${gate.total}` : "–",
        tone: !gate.total ? "neutral" : gate.valid ? "success" : "danger",
        title: gateTitle,
        unmet: gate.unmetGates || [],
      },
      openGaps: card.stats ? card.stats.openGaps : null,
      warningCount: card.warningCount || 0,
      blockers: card.blockers || [],
      nextSkill: card.nextSkill || null,
    };
  }

  // Matrix rows (main-state order, then name) plus kanban columns; empty
  // kanban columns collapse into narrow rails.
  function buildLifecycleMatrix(board) {
    const cards = (board && board.cards) || [];
    // Most advanced first; BCs without a known main state (position -1) last.
    const rows = cards.map(matrixRow).sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));
    const columns = ((board && board.columns) || []).map((column) => ({
      state: column.state,
      label: column.label,
      optional: column.optional,
      collapsed: column.cards.length === 0,
      count: column.cards.length,
      rows: column.cards.map(matrixRow),
    }));
    return {
      states: MAIN_LIFECYCLES.map((state) => ({ state, label: lifecycleLabel(state) })),
      rows,
      columns,
    };
  }

  // Collapses identical dispositions across a gap's sources. Text is compared
  // after trimming and whitespace folding. The largest group (first on a tie)
  // is the common disposition; other sources are listed as differing.
  function collapseDispositions(sources) {
    const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
    const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const groups = [];
    for (const item of list) {
      const key = norm(item.disposition);
      let group = groups.find((entry) => entry.key === key);
      if (!group) {
        group = { key, disposition: key, sources: [] };
        groups.push(group);
      }
      group.sources.push(item);
    }
    let common = null;
    for (const group of groups) if (!common || group.sources.length > common.sources.length) common = group;
    const ownersOf = (items) => Array.from(new Set(items.map((item) => norm(item.owner)).filter(Boolean)));
    const differing = common ? list.filter((item) => !common.sources.includes(item)) : [];
    return {
      count: list.length,
      agree: groups.length <= 1,
      common: common
        ? {
            disposition: common.disposition,
            owners: ownersOf(common.sources),
            sources: common.sources,
            count: common.sources.length,
            text: groups.length <= 1
              ? `${plural(common.sources.length, "source")} agree${common.sources.length === 1 ? "s" : ""}`
              : `${common.sources.length} of ${list.length} sources agree`,
          }
        : null,
      differing,
      groupCount: groups.length,
    };
  }

  // Plain-language definitions shared by tooltips, legends and the guide (T12).
  // Each entry: `label` (short, used in legends) and `text` (full tooltip).
  const GLOSSARY = {
    kind: {
      H: { label: "Human approval", text: "Human approval — a named person signs it off" },
      D: { label: "Deterministic check", text: "Deterministic check — a tool run with a pass/fail result" },
      R: { label: "Record only", text: "Record only — written down, nothing to approve" },
    },
    result: {
      PASS: { label: "Met", text: "Pass — the gate is met" },
      FAIL: {
        label: "Not met",
        text: "Fail — checked and not met; the row stays as history and the transition is not valid",
      },
      WAIVED: {
        label: "Skipped on purpose",
        text: "Waived — skipped on purpose; needs a Tech lead signer and a reason in Evidence",
      },
      "N/A": { label: "Does not apply", text: "Not applicable — satisfies optional gates only, never a required one" },
    },
    gapState: {
      RESOLVED: { label: "Resolved", text: "Resolved — every source file says the gap is resolved" },
      PARTIAL: {
        label: "Partly resolved",
        text: "Partial — resolved for part of its scope; the rest is still open (counts as open, not drift)",
      },
      MIXED: {
        label: "Sources disagree",
        text: "Mixed — the source files record different dispositions for this gap (drift warning)",
      },
      DEFERRED: { label: "Postponed", text: "Deferred — postponed on purpose" },
      OPEN: { label: "Not addressed", text: "Open — not addressed yet" },
    },
    badge: {
      drift: {
        label: "Amber: drift warnings",
        text:
          "Amber badge — drift warnings: a gap's dispositions disagree across domain-map.md, " +
          "context-map.md and status.md, or a gap is missing from the maps; see Diagnostics",
      },
      partial: {
        label: "Blue: partly resolved",
        text: "Blue Partial badge — gap resolved for part of its scope; still open, not drift",
      },
      gates: {
        label: "n/m gates",
        text:
          "n/m gates — n of the m gates required for the current transition are satisfied " +
          "(PASS, or WAIVED by a Tech lead); red when any is unmet",
      },
    },
    gapPanel: {
      attention: {
        label: "Gaps need attention",
        text: "Gaps need attention — at least one gap is Open (not addressed) or Mixed (sources disagree); red panel",
      },
      pending: {
        label: "Gaps pending",
        text: "Gaps pending — no Open or Mixed gaps, but some are Partial or Deferred and still need an owner; amber panel",
      },
      clear: { label: "All gaps resolved", text: "All gaps resolved — every source file says each gap is resolved; collapsed" },
      empty: { label: "No gaps recorded", text: "No gaps recorded — the projection carries no gap ledger (schema v1 or legacy)" },
    },
    lifecycle: {
      DISCOVERED: { label: "Discovered", text: "Boundary and purpose confirmed; detailed specification not approved" },
      REFINING: { label: "Refining", text: "Specification is being discussed or updated" },
      REFINED: { label: "Refined", text: "Specification is complete and user-approved" },
      SPEC_REVIEWED: {
        label: "Spec Reviewed",
        text: "Independent specification review done, no unresolved blocking findings",
      },
      IMPLEMENTING: { label: "Implementing", text: "Initial implementation in progress from approved specifications" },
      IMPLEMENTED: {
        label: "Implemented",
        text: "Implementation or enhancement complete; independent verification may be pending",
      },
      VERIFIED: {
        label: "Verified",
        text: "Independent full review found the implementation conformant, no blocking findings",
      },
      CHANGING: { label: "Changing", text: "Approved behaviour or implementation is being enhanced" },
      BLOCKED: { label: "Blocked", text: "Progress cannot continue; blocker and return state are recorded" },
      DEPRECATED: { label: "Deprecated", text: "Intentionally retired; replacement or migration is recorded" },
    },
    changeKind: {
      added: { label: "Added", text: "Added — new since the baseline" },
      removed: { label: "Removed", text: "Removed — present at the baseline, gone now" },
      modified: { label: "Modified", text: "Modified — same item, changed content" },
      moved: { label: "Moved", text: "Moved — renumbered or relocated, content unchanged" },
    },
    commit: {
      uncommitted: {
        label: "Uncommitted",
        text: "Uncommitted — changes in the working tree that are not in any commit yet",
      },
      unknown: {
        label: "Unknown",
        text: "Unknown — no git history for this (no git, shallow clone or no status report); not the same as no changes",
      },
      sharedCommit: {
        label: "Shared commit",
        text: "Shared commit — several transitions were recorded in one commit; the diff is shown on the last of them",
      },
    },
  };

  function glossaryEntry(group, key) {
    const entries = GLOSSARY[group];
    if (!entries || key === null || key === undefined) return null;
    return Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null;
  }

  function glossaryText(group, key) {
    const entry = glossaryEntry(group, key);
    return entry ? entry.text : "";
  }

  // Legend groups rendered under the gate evidence table and the gap ledger.
  const LEGENDS = {
    gates: [
      { group: "kind", title: "Kind" },
      { group: "result", title: "Result" },
    ],
    gaps: [
      { group: "gapState", title: "State" },
      { group: "badge", title: "Badges", keys: ["drift", "partial"] },
    ],
  };

  // Plain-text form of a legend: "Kind: H Human approval · D ... | Result: ...".
  function legendItems(name) {
    return (LEGENDS[name] || []).map((part) => ({
      group: part.group,
      title: part.title,
      entries: (part.keys || Object.keys(GLOSSARY[part.group])).map((key) => ({
        key,
        label: GLOSSARY[part.group][key].label,
        text: GLOSSARY[part.group][key].text,
      })),
    }));
  }

  function legendText(name) {
    return legendItems(name)
      .map((part) => `${part.title}: ${part.entries.map((entry) => `${part.group === "badge" ? "" : `${entry.key} `}${entry.label}`).join(" · ")}`)
      .join(" | ");
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Inline Markdown: `code` and **bold**; everything else is escaped text.
  function renderInlineMarkdown(text) {
    return String(text || "")
      .split(/(`[^`]+`)/)
      .map((part) => {
        if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
          return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
        }
        return escapeHtml(part).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      })
      .join("");
  }

  function renderMarkdownList(items) {
    let index = 0;
    const parse = () => {
      const { indent, ordered } = items[index];
      const tag = ordered ? "ol" : "ul";
      let html = `<${tag}>`;
      let openItem = false;
      while (index < items.length && items[index].indent >= indent) {
        const item = items[index];
        if (item.indent > indent) {
          html += parse();
          continue;
        }
        if (item.ordered !== ordered) break;
        if (openItem) html += "</li>";
        html += `<li>${renderInlineMarkdown(item.text)}`;
        openItem = true;
        index += 1;
      }
      if (openItem) html += "</li>";
      return `${html}</${tag}>`;
    };
    let html = "";
    while (index < items.length) html += parse();
    return html;
  }

  // Minimal, safe Markdown → HTML for the embedded guide: headings, paragraphs,
  // (nested) lists, simple pipe tables, fenced code, **bold** and `code`. All
  // source text is HTML-escaped; no raw HTML, links or images are passed through.
  function renderMarkdown(markdown, options = {}) {
    const offset = Number.isInteger(options.headingOffset) ? options.headingOffset : 0;
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let paragraph = [];
    let firstHeading = true;
    const flush = () => {
      if (paragraph.length) out.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    };
    const listItem = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
    const tableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
    const tableSeparator = (line) => /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(line);
    const cells = (line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*$/.test(line)) {
        flush();
        i += 1;
        continue;
      }
      if (/^\s*```/.test(line)) {
        flush();
        const body = [];
        i += 1;
        while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
        i += 1;
        out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
        continue;
      }
      const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (heading) {
        flush();
        const level = Math.min(6, heading[1].length + offset);
        const id = firstHeading && options.firstHeadingId ? ` id="${escapeHtml(options.firstHeadingId)}"` : "";
        firstHeading = false;
        out.push(`<h${level}${id}>${renderInlineMarkdown(heading[2])}</h${level}>`);
        i += 1;
        continue;
      }
      if (tableRow(line) && i + 1 < lines.length && tableSeparator(lines[i + 1])) {
        flush();
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && tableRow(lines[i])) rows.push(cells(lines[i++]));
        const th = head.map((cell) => `<th scope="col">${renderInlineMarkdown(cell)}</th>`).join("");
        const body = rows
          .map((row) => `<tr>${head.map((_, c) => `<td>${renderInlineMarkdown(row[c] || "")}</td>`).join("")}</tr>`)
          .join("");
        out.push(`<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`);
        continue;
      }
      if (listItem.test(line)) {
        flush();
        const items = [];
        while (i < lines.length) {
          const match = listItem.exec(lines[i]);
          if (match) {
            items.push({ indent: match[1].length, ordered: /\d/.test(match[2]), text: match[3] });
          } else if (/^\s+\S/.test(lines[i]) && items.length) {
            items[items.length - 1].text += ` ${lines[i].trim()}`;
          } else {
            break;
          }
          i += 1;
        }
        out.push(renderMarkdownList(items));
        continue;
      }
      paragraph.push(line.trim());
      i += 1;
    }
    flush();
    return out.join("\n");
  }

  // Embedded copy of docs/viewer-guide.md (viewer-guide.js, generated).
  function guideMarkdown() {
    if (typeof window !== "undefined" && window.HgateViewerGuide) return window.HgateViewerGuide.GUIDE_MARKDOWN;
    if (typeof require === "function") {
      try {
        return require("./viewer-guide.js").GUIDE_MARKDOWN;
      } catch (error) {
        return "";
      }
    }
    return "";
  }

  function buildBoardModel(project) {
    const source = project || {};
    const contexts = source.boundedContexts || [];
    const diagnostics = Array.isArray(source.diagnostics) ? source.diagnostics : [];
    const rawGaps = Array.isArray(source.gaps) ? source.gaps : [];

    const gapBcIds = new Map();
    for (const gap of rawGaps) {
      const ids = new Set();
      for (const item of gap.sources || []) if (item && item.bc) ids.add(item.bc);
      gapBcIds.set(gap.id, ids);
    }
    const warningsForBc = (bcId) =>
      diagnostics.filter(
        (diagnostic) =>
          diagnostic.bcId === bcId ||
          (diagnostic.gapId && gapBcIds.has(diagnostic.gapId) && gapBcIds.get(diagnostic.gapId).has(bcId)),
      );

    const cards = contexts.map((bc) => {
      const stats = bc.stats || {};
      const blockers = Array.isArray(bc.blockers) ? bc.blockers : [];
      const transition = latestTransition(bc);
      const derivedOpenGaps = rawGaps.length
        ? rawGaps.filter(
            (gap) => isOpenGap(gap) && gapBcIds.get(gap.id) && gapBcIds.get(gap.id).has(bc.id),
          ).length
        : null;
      const warnings = warningsForBc(bc.id);
      const lifecycle = LIFECYCLES.has(bc.lifecycle) ? bc.lifecycle : "DISCOVERED";
      return {
        id: bc.id,
        name: bc.name || bc.id,
        classification: bc.classification || "UNCONFIRMED",
        role: bc.role || "UNCONFIRMED",
        lifecycle,
        lifecycleDate: transition && transition.date ? transition.date : null,
        lifecycleFrom: transition ? cleanCell(transition.from) || null : null,
        baseLifecycle: baseLifecycleOf(bc, lifecycle),
        nextSkill: bc.nextSkill || null,
        blockers,
        blocked: blockers.length > 0,
        stats: {
          rules: numberOrNull(stats.rules),
          scenarios: numberOrNull(stats.scenarios),
          decisions: numberOrNull(stats.decisions),
          openGaps: numberOrNull(stats.openGaps) !== null ? stats.openGaps : derivedOpenGaps,
        },
        gateSummary: summarizeGates({ ...bc, lifecycle }),
        signoffCount: Array.isArray(bc.signoffs) ? bc.signoffs.length : 0,
        warnings,
        warningCount: warnings.length,
        inferred: Boolean(bc.inferred),
      };
    });

    const byState = (state) =>
      cards.filter((card) => card.lifecycle === state).sort((a, b) => a.name.localeCompare(b.name));
    const columns = [];
    const hiddenStates = [];
    for (const state of MAIN_LIFECYCLES) {
      columns.push({ state, label: lifecycleLabel(state), optional: false, cards: byState(state) });
    }
    for (const state of OPTIONAL_LIFECYCLES) {
      const stateCards = byState(state);
      if (stateCards.length) {
        columns.push({ state, label: lifecycleLabel(state), optional: true, cards: stateCards });
      } else {
        hiddenStates.push(state);
      }
    }

    const gaps = rawGaps.map((gap) => {
      const warnings = diagnostics.filter((diagnostic) => diagnostic.gapId === gap.id);
      return {
        id: gap.id,
        gap: gap.gap || "",
        affected: gap.affected || "",
        state: gap.state || "OPEN",
        mixed: gap.state === "MIXED",
        partial: gap.state === "PARTIAL",
        stateLabel: gapStateLabel(gap.state || "OPEN"),
        sources: (gap.sources || []).map((item) => ({
          file: item.file || "",
          line: item.line === undefined ? null : item.line,
          location: item.line ? `${item.file}:${item.line}` : item.file || "",
          bc: item.bc || null,
          owner: item.owner || "",
          disposition: item.disposition || "",
        })),
        warnings,
        warningCount: warnings.length,
      };
    });

    return {
      columns,
      hiddenStates,
      cards,
      gaps,
      diagnostics,
      warnings: {
        count: diagnostics.length,
        expanded: diagnostics.length > 0,
        message: warningBannerText(diagnostics.length),
      },
    };
  }

  // Optional git-derived status report written by `project:status`. Missing → null, silently.
  async function readStatusReport(fileMap) {
    const file = fileMap && fileMap.get(STATUS_REPORT_PATH);
    if (!file) return { statusReport: null, diagnostics: [] };
    try {
      return { statusReport: JSON.parse(await file.text()), diagnostics: [] };
    } catch (error) {
      return {
        statusReport: null,
        diagnostics: [
          { severity: "warning", message: `Ignoring ${STATUS_REPORT_PATH}: ${error.message}` },
        ],
      };
    }
  }


  // --- Per-BC timeline and change view (T7b) ---------------------------------
  // Pure model builders over the projection and the optional status report
  // (.hgate/status.json, see tools/project-status/README.md).

  const STATUS_COMMAND = "npm run project:status";
  const CHANGE_CATEGORIES = [
    ["features", "Features"],
    ["scenarios", "Scenarios"],
    ["rules", "Business rules"],
    ["skill", "SKILL.md sections"],
    ["model", "Domain model sections"],
    ["ports", "Ports"],
    ["decisions", "Decisions"],
    ["acls", "ACL files"],
    ["aclSections", "ACL sections"],
    ["properties", "Properties"],
    ["gates", "Gate evidence"],
    ["openItems", "Open items"],
  ];
  const CHANGE_KINDS = ["added", "removed", "modified", "moved"];

  function changeItemText(category, kind, item) {
    const key = item && item.key !== undefined && item.key !== null ? String(item.key) : "";
    const label = item && item.label ? String(item.label) : "";
    // Rule keys are content hashes; their label ("#n: text") is the readable part.
    let text = category === "rules" ? label || key : label && label !== key ? `${key} — ${label}` : key || label;
    if (category === "rules" && kind === "modified" && item.labelBefore && item.labelBefore !== label) {
      text = `${item.labelBefore} → ${label}`;
    }
    if (kind === "moved" && item.numberBefore !== undefined && item.numberAfter !== undefined) {
      text = `${text} (#${item.numberBefore} → #${item.numberAfter})`;
    }
    return text;
  }

  function changeCountsText(totals) {
    const parts = CHANGE_KINDS.filter((kind) => totals[kind]).map((kind) => `${totals[kind]} ${kind}`);
    return parts.join(" · ");
  }

  // Flattens one diffSnapshots result. `changes: null` means "unknown" (no git,
  // shallow clone, or no report) and is kept distinct from "no changes".
  function summarizeChanges(changes) {
    const totals = { added: 0, removed: 0, modified: 0, moved: 0 };
    if (!changes || typeof changes !== "object") {
      return { known: false, empty: false, total: 0, totals, lifecycle: null, categories: [], text: "Unknown" };
    }
    const categories = [];
    for (const [id, label] of CHANGE_CATEGORIES) {
      const raw = changes[id];
      if (!raw || typeof raw !== "object") continue;
      const entry = { id, label, count: 0 };
      for (const kind of CHANGE_KINDS) {
        const items = Array.isArray(raw[kind]) ? raw[kind] : [];
        entry[kind] = items.map((item) => ({
          key: item && item.key !== undefined ? item.key : null,
          label: (item && item.label) || null,
          text: changeItemText(id, kind, item || {}),
        }));
        entry.count += items.length;
        totals[kind] += items.length;
      }
      if (entry.count) categories.push(entry);
    }
    const lifecycle =
      changes.lifecycle && typeof changes.lifecycle === "object"
        ? { from: changes.lifecycle.from ?? null, to: changes.lifecycle.to ?? null }
        : null;
    const total = totals.added + totals.removed + totals.modified + totals.moved;
    const parts = [];
    if (lifecycle) parts.push(`lifecycle ${lifecycle.from || "–"} → ${lifecycle.to || "–"}`);
    if (total) parts.push(changeCountsText(totals));
    const empty = total === 0 && !lifecycle;
    return { known: true, empty, total, totals, lifecycle, categories, text: empty ? "No changes" : parts.join(" · ") };
  }

  function describeCommit(commit) {
    if (commit && typeof commit === "object") {
      return {
        kind: "commit",
        sha: commit.sha || null,
        shortSha: commit.shortSha || (commit.sha ? String(commit.sha).slice(0, 7) : null),
        subject: commit.subject || "",
        date: commit.date || null,
        text: `${commit.shortSha || String(commit.sha || "").slice(0, 7)}${commit.subject ? ` ${commit.subject}` : ""}`,
      };
    }
    if (commit === "uncommitted") return { kind: "uncommitted", sha: null, shortSha: null, subject: "", date: null, text: "uncommitted" };
    return { kind: "unknown", sha: null, shortSha: null, subject: "", date: null, text: "unknown" };
  }

  function commitIdentity(commit) {
    if (commit && typeof commit === "object") return `sha:${commit.sha || commit.shortSha}`;
    return commit === "uncommitted" ? "uncommitted" : null;
  }

  function stepTransition(step) {
    return transitionKey(`${(step && step.from) || "-"} -> ${(step && step.to) || ""}`);
  }

  // Assigns each gate row to one transition occurrence with the same "FROM -> TO":
  // the latest occurrence dated on or before the gate; a gate recorded before
  // every occurrence (a FAIL run ahead of the transition) goes to the first one.
  // Gates for a transition that has not happened yet stay unmatched.
  function matchGatesToSteps(steps, gates) {
    const assigned = steps.map(() => []);
    const unmatched = [];
    (gates || []).forEach((gate) => {
      if (!gate) return;
      const key = transitionKey(gate.transition);
      const candidates = [];
      steps.forEach((step, index) => {
        if (stepTransition(step) === key) candidates.push(index);
      });
      if (candidates.length === 0) {
        unmatched.push(gate);
        return;
      }
      const date = String(gate.date || "");
      let chosen = null;
      for (const index of candidates) {
        if (String(steps[index].date || "") <= date) chosen = index;
      }
      if (chosen === null) chosen = candidates[0];
      assigned[chosen].push(gate);
    });
    return { assigned, unmatched };
  }

  // Pairs projection transitions with report steps (same from, to and date, in order).
  function pairSteps(transitions, reportSteps) {
    const used = new Set();
    const pairs = transitions.map((transition) => {
      const index = reportSteps.findIndex(
        (step, i) =>
          !used.has(i) &&
          stepTransition(step) === stepTransition(transition) &&
          String(step.date || "") === String(transition.date || ""),
      );
      if (index === -1) return { transition, step: null };
      used.add(index);
      return { transition, step: reportSteps[index] };
    });
    return { pairs, unusedReportSteps: reportSteps.length - used.size };
  }

  function formatCoverage(coverage) {
    if (!coverage || typeof coverage !== "object") return null;
    const summary = coverage.summary;
    let detail = "";
    if (summary && typeof summary === "object" && summary.scenarios !== undefined) {
      detail = ` — ${summary.coveredScenarios ?? "?"}/${summary.scenarios} scenarios covered`;
      if (summary.errors !== undefined) detail += `, ${summary.errors} error${summary.errors === 1 ? "" : "s"}`;
    } else if (coverage.error) {
      detail = ` — ${coverage.error}`;
    }
    return `BDD coverage (project): ${coverage.status || "unknown"}${detail}`;
  }

  function baselineFrom(id, title, entry, describeBase) {
    const value = entry && typeof entry === "object" ? entry : {};
    return {
      id,
      title,
      base: describeBase(value.baseCommit),
      summary: summarizeChanges(value.changes),
      files: Array.isArray(value.files) ? value.files.slice() : null,
    };
  }

  // Builds everything the BC timeline renders. statusReport may be null: the
  // timeline then comes from the projection alone with a hint to run the report.
  function buildTimelineModel(project, statusReport, bcId) {
    const bc = project && (project.boundedContexts || []).find((item) => item.id === bcId);
    if (!bc) return null;
    const report = statusReport && typeof statusReport === "object" ? statusReport : null;
    const reportBc = report && Array.isArray(report.boundedContexts)
      ? report.boundedContexts.find((item) => item && item.id === bcId) || null
      : null;
    const git = (report && report.git) || null;
    const notices = [];
    let hint = null;
    if (!report) {
      hint = `Run \`${STATUS_COMMAND}\` to see what changed`;
    } else {
      if (git && git.available === false) {
        notices.push("Git is not available: commits and per-step changes are unknown.");
      } else if (git && git.shallow) {
        notices.push("Shallow clone: history is incomplete, so per-step commits and changes are unknown (fetch full history).");
      }
      if (!reportBc) notices.push(`This BC is not in the status report. Run \`${STATUS_COMMAND}\` again.`);
    }

    const transitions = orderTransitions(Array.isArray(bc.transitions) ? bc.transitions : []);
    const reportSteps = reportBc && Array.isArray(reportBc.steps) ? reportBc.steps : [];
    let pairs;
    if (transitions.length) {
      const paired = pairSteps(transitions, reportSteps);
      pairs = paired.pairs;
      if (reportBc && (paired.unusedReportSteps || pairs.some((pair) => !pair.step))) {
        notices.push(`The status report does not match the projection's transitions. Run \`${STATUS_COMMAND}\` again.`);
      }
    } else {
      pairs = reportSteps.map((step) => ({ transition: step, step }));
    }

    const baseSteps = pairs.map((pair) => ({
      from: pair.transition.from || "-",
      to: pair.transition.to || "",
      date: pair.transition.date || "",
      actor: pair.transition.actor || "",
      evidence: pair.transition.evidence || "",
    }));
    const { assigned, unmatched } = matchGatesToSteps(baseSteps, bc.gates || []);

    const steps = pairs.map((pair, index) => {
      const step = pair.step;
      const next = pairs[index + 1] && pairs[index + 1].step;
      const shared = Boolean(step && step.sharedCommit);
      const groupContinues =
        shared && next && next.sharedCommit && commitIdentity(next.commit) !== null &&
        commitIdentity(next.commit) === commitIdentity(step.commit);
      let groupSize = 1;
      if (shared && !groupContinues) {
        for (let back = index - 1; back >= 0; back -= 1) {
          const previous = pairs[back].step;
          if (!previous || !previous.sharedCommit || commitIdentity(previous.commit) !== commitIdentity(step.commit)) break;
          groupSize += 1;
        }
      }
      const base = baseSteps[index];
      return {
        index,
        ...base,
        transition: stepTransition(base),
        line: step && step.line !== undefined ? step.line : null,
        commit: step ? describeCommit(step.commit) : null,
        sharedCommit: shared,
        sharedNote: groupContinues ? "Recorded in the same commit as the next step; its changes are shown there." : null,
        sharedGroupSize: groupSize,
        // Earlier steps of a shared group carry an empty diff; the group's diff is on its last step.
        changes: step && !groupContinues ? summarizeChanges(step.changes) : null,
        gates: assigned[index].map((gate) => ({
          gate: gate.gate,
          kind: gate.kind || null,
          result: gate.result || null,
          evidence: gate.evidence || "",
          signedBy: gate.signedBy || null,
          date: gate.date || "",
        })),
      };
    });

    const baselines = reportBc
      ? [
          baselineFrom("sinceLastTransition", "Since last transition", reportBc.sinceLastTransition, (base) => {
            if (base === "uncommitted") return "last transition not committed yet";
            if (base && typeof base === "object") return `base ${describeCommit(base).text}`;
            return "no transitions: compared with nothing";
          }),
          baselineFrom("sincePreviousCommit", "Since previous commit", reportBc.sincePreviousCommit, (base) => {
            if (base && typeof base === "object") return `base ${describeCommit(base).text}`;
            return "HEAD has no parent: compared with nothing";
          }),
          baselineFrom("uncommitted", "Uncommitted", reportBc.uncommitted, () => "working tree vs HEAD"),
        ]
      : [];

    return {
      bcId,
      hasReport: Boolean(report),
      hint,
      notices,
      coverage: report ? formatCoverage(report.coverage) : null,
      head: git && git.head ? { shortSha: String(git.head).slice(0, 7), subject: git.headSubject || "" } : null,
      baselines,
      steps,
      unmatchedGates: unmatched.map((gate) => ({
        transition: transitionKey(gate.transition),
        gate: gate.gate,
        kind: gate.kind || null,
        result: gate.result || null,
        evidence: gate.evidence || "",
        signedBy: gate.signedBy || null,
        date: gate.date || "",
      })),
    };
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

  const CANVAS_MARGIN = 40;

  // Logical (viewBox) canvas size: at least the visible area at this zoom, and
  // large enough to hold the layout and every node where it currently sits.
  function computeCanvasSize({ visibleWidth, visibleHeight, zoom, layout, positions, nodeWidth, nodeHeight }) {
    let contentWidth = layout.width;
    let contentHeight = layout.height;
    for (const position of positions.values()) {
      contentWidth = Math.max(contentWidth, position.x + nodeWidth + CANVAS_MARGIN);
      contentHeight = Math.max(contentHeight, position.y + nodeHeight + CANVAS_MARGIN);
    }
    return {
      width: Math.max(visibleWidth / zoom, contentWidth),
      height: Math.max(visibleHeight / zoom, contentHeight),
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
    const NODE_HEIGHT = 80;
    const view = { width: layout.width, height: layout.height, zoom: 1 };
    if (container._topologyObserver) container._topologyObserver.disconnect();
    const svg = svgElement("svg", {
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

    const positions = new Map();
    for (const [id, position] of layout.positions) positions.set(id, { x: position.x, y: position.y });

    for (const [domainId] of layout.columns) {
      const first = Array.from(layout.positions.values()).find((position) => position.domainId === domainId);
      if (!first) continue;
      const label = svgElement("text", { x: first.x, y: 30, class: "graph-domain-label" });
      const domain = project.domains.find((item) => item.id === domainId);
      label.textContent = domain ? domain.name : domainId;
      svg.append(label);
    }

    const pairCounts = new Map();
    const edges = [];
    const edgeLayer = svgElement("g");
    const labelLayer = svgElement("g");
    const nodeLayer = svgElement("g");
    svg.append(edgeLayer, nodeLayer, labelLayer);

    for (const relation of project.relationships) {
      if (!positions.has(relation.from) || !positions.has(relation.to) || relation.from === relation.to) continue;
      const pairKey = [relation.from, relation.to].sort().join("|");
      const index = pairCounts.get(pairKey) || 0;
      pairCounts.set(pairKey, index + 1);
      const fullLabel = relation.information || relation.interaction || "";
      const displayLabel = abbreviateEdgeLabel(fullLabel);
      const labelWidth = Math.min(178, Math.max(54, displayLabel.length * 6.2 + 14));
      const path = svgElement("path", { class: "graph-edge", "marker-end": "url(#project-arrow)", fill: "none" });
      const labelBackground = svgElement("rect", {
        width: labelWidth,
        height: 19,
        rx: 7,
        class: "graph-edge-label-background",
      });
      const edgeLabel = svgElement("text", { class: "graph-edge-label", "text-anchor": "middle" });
      edgeLabel.textContent = displayLabel;
      const title = svgElement("title");
      title.textContent = fullLabel;
      edgeLabel.append(title);
      edgeLayer.append(path);
      labelLayer.append(labelBackground, edgeLabel);
      edges.push({ relation, index, pairKey, path, labelBackground, edgeLabel, labelWidth });
    }

    const borderPoint = (position, toward) => {
      const cx = position.x + NODE_WIDTH / 2;
      const cy = position.y + NODE_HEIGHT / 2;
      const dx = toward.x - cx;
      const dy = toward.y - cy;
      if (dx === 0 && dy === 0) return { x: cx, y: cy };
      const scale = 1 / Math.max(Math.abs(dx) / (NODE_WIDTH / 2 + 4), Math.abs(dy) / (NODE_HEIGHT / 2 + 4));
      return { x: cx + dx * scale, y: cy + dy * scale };
    };

    const updateEdges = () => {
      for (const edge of edges) {
        const from = positions.get(edge.relation.from);
        const to = positions.get(edge.relation.to);
        const fromCenter = { x: from.x + NODE_WIDTH / 2, y: from.y + NODE_HEIGHT / 2 };
        const toCenter = { x: to.x + NODE_WIDTH / 2, y: to.y + NODE_HEIGHT / 2 };
        const start = borderPoint(from, toCenter);
        const end = borderPoint(to, fromCenter);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy) || 1;
        // Normal is oriented by canonical pair order so opposite edges curve apart.
        const sign = edge.relation.from < edge.relation.to ? 1 : -1;
        const bend = edge.index === 0 ? 0 : (edge.index % 2 === 1 ? 1 : -1) * Math.ceil(edge.index / 2) * 36;
        const offset = bend * sign;
        const nx = (-dy / length) * offset;
        const ny = (dx / length) * offset;
        const cx = (start.x + end.x) / 2 + nx * 2;
        const cy = (start.y + end.y) / 2 + ny * 2;
        edge.path.setAttribute("d", `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`);
        const mx = 0.25 * start.x + 0.5 * cx + 0.25 * end.x;
        const my = 0.25 * start.y + 0.5 * cy + 0.25 * end.y;
        edge.labelBackground.setAttribute("x", mx - edge.labelWidth / 2);
        edge.labelBackground.setAttribute("y", my - 10);
        edge.edgeLabel.setAttribute("x", mx);
        edge.edgeLabel.setAttribute("y", my + 4);
      }
    };

    // The SVG is absolutely positioned, so it never drives the container's size;
    // the container is sized by the grid row and the canvas fills (or overflows) it.
    const applyView = () => {
      const style = getComputedStyle(container);
      const visibleWidth =
        container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const visibleHeight =
        container.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      // A hidden tab reports 0; keep the last size until the ResizeObserver fires on show.
      if (visibleWidth <= 0 || visibleHeight <= 0) return;
      const size = computeCanvasSize({
        visibleWidth,
        visibleHeight,
        zoom: view.zoom,
        layout,
        positions,
        nodeWidth: NODE_WIDTH,
        nodeHeight: NODE_HEIGHT,
      });
      view.width = size.width;
      view.height = size.height;
      svg.setAttribute("viewBox", `0 0 ${view.width} ${view.height}`);
      svg.style.width = `${view.width * view.zoom}px`;
      svg.style.height = `${view.height * view.zoom}px`;
    };
    const setZoom = (percent) => {
      view.zoom = percent / 100;
      applyView();
    };

    const toSvgPoint = (event) => {
      const matrix = svg.getScreenCTM();
      if (!matrix) return { x: event.clientX, y: event.clientY };
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      return { x: point.x, y: point.y };
    };

    for (const bc of project.boundedContexts) {
      const position = positions.get(bc.id);
      if (!position) continue;
      const group = svgElement("g", {
        class: `graph-node classification-${bc.classification.toLowerCase()} role-${bc.role.toLowerCase()}${bc.inferred ? " inferred" : ""}`,
        tabindex: "0",
        role: "button",
        "aria-label": `${bc.name}, ${bc.classification}, ${bc.role}`,
        style: "cursor: grab; touch-action: none",
      });
      group.append(svgElement("rect", { x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT, rx: 12 }));
      const title = svgElement("text", { x: 12, y: 28, class: "graph-node-title" });
      title.textContent = bc.name;
      const meta = svgElement("text", { x: 12, y: 52, class: "graph-node-meta" });
      meta.textContent = `${bc.classification} · ${bc.role}`;
      const lifecycle = svgElement("text", { x: 12, y: 69, class: "graph-node-lifecycle" });
      lifecycle.textContent = bc.lifecycle || "Unconfirmed";
      group.append(title, meta, lifecycle);
      const place = () => group.setAttribute("transform", `translate(${position.x} ${position.y})`);
      place();

      const select = () => onSelect(bc.id);
      let drag = null;
      group.addEventListener("pointerdown", (event) => {
        const pointer = toSvgPoint(event);
        drag = { dx: pointer.x - position.x, dy: pointer.y - position.y, startX: event.clientX, startY: event.clientY, moved: false };
        group.setPointerCapture(event.pointerId);
        group.style.cursor = "grabbing";
        nodeLayer.append(group);
      });
      group.addEventListener("pointermove", (event) => {
        if (!drag) return;
        if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
        drag.moved = true;
        const pointer = toSvgPoint(event);
        position.x = Math.max(0, Math.min(Math.max(0, view.width - NODE_WIDTH), pointer.x - drag.dx));
        position.y = Math.max(0, Math.min(Math.max(0, view.height - NODE_HEIGHT), pointer.y - drag.dy));
        place();
        updateEdges();
      });
      const end = (event) => {
        if (!drag) return;
        const wasClick = !drag.moved;
        drag = null;
        group.style.cursor = "grab";
        if (group.hasPointerCapture(event.pointerId)) group.releasePointerCapture(event.pointerId);
        if (wasClick) select();
      };
      group.addEventListener("pointerup", end);
      group.addEventListener("pointercancel", () => {
        drag = null;
        group.style.cursor = "grab";
      });
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      });
      nodeLayer.append(group);
    }
    updateEdges();
    container.append(svg);
    applyView();
    if (typeof ResizeObserver === "function") {
      // Re-fit when the tab is shown, the window resizes, or the details panel changes height.
      container._topologyObserver = new ResizeObserver(() => applyView());
      container._topologyObserver.observe(container);
    }
    return { setZoom };
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

  function appendTable(parent, title, headers, rows, options = {}) {
    const sectionElement = createElement("section", `project-detail-section ${options.className || ""}`.trim());
    if (title) sectionElement.append(createElement("h3", "", title));
    if (!rows || rows.length === 0) {
      sectionElement.append(createElement("p", "muted", options.empty || "None recorded."));
      parent.append(sectionElement);
      return sectionElement;
    }
    const wrapper = createElement("div", "board-table-wrap");
    const table = createElement("table", "board-table table");
    if (title) table.append(createElement("caption", "visually-hidden", title));
    const head = createElement("thead");
    const headRow = createElement("tr");
    for (const header of headers) {
      const cell = createElement("th", "", header);
      cell.scope = "col";
      headRow.append(cell);
    }
    head.append(headRow);
    const body = createElement("tbody");
    for (const row of rows) {
      const tr = createElement("tr", row.className || "");
      for (const value of row.cells) {
        const cell = createElement("td");
        if (value instanceof Node) cell.append(value);
        else if (typeof value === "string" && /^[\w.@-]*(\/[\w.@-]+)+\.\w+(:\d+)?$/.test(value)) {
          // Bare repository paths: monospace, truncated, full path on hover (T14a .cell-path).
          const pathElement = createElement("span", "cell-path", value);
          pathElement.title = value;
          cell.append(pathElement);
        } else cell.textContent = value === null || value === undefined || value === "" ? "–" : String(value);
        // ISO dates never wrap (T14a .cell-date).
        if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) cell.className = "cell-date";
        tr.append(cell);
      }
      body.append(tr);
    }
    table.append(head, body);
    wrapper.append(table);
    sectionElement.append(wrapper);
    parent.append(sectionElement);
    return sectionElement;
  }

  // Hover text (title) plus screen-reader text. `hidden: false` keeps only the
  // title, for elements inside buttons whose accessible name must stay short.
  function withTooltip(element, group, key, options = {}) {
    const text = glossaryText(group, key);
    if (!text) return element;
    element.title = options.prefix ? `${options.prefix} — ${text}` : text;
    element.classList.add("has-tooltip");
    if (options.hidden !== false) element.append(createElement("span", "visually-hidden", ` (${text})`));
    return element;
  }

  function kindAbbr(kind) {
    const entry = glossaryEntry("kind", kind);
    if (!entry) return createElement("span", "", kind || "–");
    const abbr = createElement("abbr", "kind-abbr", kind);
    abbr.title = entry.text;
    abbr.append(createElement("span", "visually-hidden", ` (${entry.label})`));
    return abbr;
  }

  function renderLegend(name) {
    const legend = createElement("p", `legend legend-${name}`);
    legend.setAttribute("role", "note");
    legend.setAttribute("aria-label", "Legend");
    legendItems(name).forEach((part, partIndex) => {
      if (partIndex) legend.append(createElement("span", "legend-separator", " | "));
      legend.append(createElement("strong", "", `${part.title}: `));
      part.entries.forEach((entry, entryIndex) => {
        if (entryIndex) legend.append(document.createTextNode(" · "));
        const item = createElement("span", "legend-item");
        item.title = entry.text;
        if (part.group === "kind") item.append(createElement("code", "", entry.key), document.createTextNode(" "));
        else if (part.group === "result") item.append(createElement("span", `result-badge result-${slug(entry.key)}`, entry.key), document.createTextNode(" "));
        else if (part.group === "gapState") item.append(createElement("span", `gap-state gap-state-${slug(entry.key)}`, gapStateLabel(entry.key)), document.createTextNode(" "));
        else if (entry.key === "drift") item.append(createElement("span", "warning-badge", "n warnings"), document.createTextNode(" "));
        else if (entry.key === "partial") item.append(createElement("span", "gap-state gap-state-partial", "Partial"), document.createTextNode(" "));
        item.append(document.createTextNode(entry.label.replace(/^(Amber|Blue): /, "")));
        legend.append(item);
      });
    });
    return legend;
  }

  function resultBadge(result) {
    const value = result || "–";
    return withTooltip(createElement("span", `result-badge result-${slug(value) || "none"}`, value), "result", result);
  }

  function warningBadge(count, options = {}) {
    return withTooltip(createElement("span", "warning-badge", `${count} warning${count === 1 ? "" : "s"}`), "badge", "drift", options);
  }

  // App-bar warning count (T14a): persistent and not dismissible (plan §3.1).
  // Shows "n warnings"; the full message is the hover text of the indicator.
  function renderWarningBanner(board, banner, textElement) {
    const count = board ? board.warnings.count : 0;
    banner.hidden = count === 0;
    banner.title = board && count ? `${board.warnings.message}. Click to open the diagnostics.` : "";
    if (textElement) textElement.textContent = count ? `${count} warning${count === 1 ? "" : "s"}` : "";
  }

  // --- Board rendering (T14b): summary strip, lifecycle matrix, kanban -------

  function pill(text, className, title) {
    const element = createElement("span", `pill ${className || ""}`.trim(), text);
    if (title) {
      element.title = title;
      element.classList.add("has-tooltip");
    }
    return element;
  }

  // Classification pill; role only when it adds information (never "SUPPORTING · SUPPORTING").
  function classificationPills(row) {
    const wrap = createElement("span", "bc-pills");
    wrap.append(pill(row.classification, `pill-class pill-class-${slug(row.classification)}`, `Classification: ${row.classification}`));
    if (row.showRole) wrap.append(pill(row.role, "pill-role", `Boundary role: ${row.role}`));
    if (row.inferred) wrap.append(pill("Inferred", "pill-warning", "Inferred from legacy Markdown, not confirmed in the domain map"));
    return wrap;
  }

  function markerPill(row) {
    if (row.marker) {
      const tone = row.marker.state === "BLOCKED" ? "pill-danger" : row.marker.state === "CHANGING" ? "pill-info" : "pill-neutral";
      return pill(row.marker.label, `${tone} pill-marker`, glossaryText("lifecycle", row.marker.state));
    }
    if (row.blockers.length) {
      return pill(plural(row.blockers.length, "blocker"), "pill-danger pill-marker", row.blockers.join("\n"));
    }
    return null;
  }

  // Ring + "n/m"; red when the current transition's gates are not valid, unmet list on hover.
  function gateProgress(gates) {
    const wrap = createElement("span", `gate-progress gate-progress-${gates.tone}`);
    wrap.title = gates.title;
    wrap.classList.add("has-tooltip");
    const radius = 7;
    const circumference = 2 * Math.PI * radius;
    const svg = svgElement("svg", { viewBox: "0 0 18 18", class: "gate-ring", "aria-hidden": "true", focusable: "false" });
    svg.append(svgElement("circle", { cx: 9, cy: 9, r: radius, class: "gate-ring-track" }));
    if (gates.total) {
      svg.append(
        svgElement("circle", {
          cx: 9,
          cy: 9,
          r: radius,
          class: "gate-ring-value",
          "stroke-dasharray": `${(circumference * gates.ratio).toFixed(2)} ${circumference.toFixed(2)}`,
          transform: "rotate(-90 9 9)",
        }),
      );
    }
    wrap.append(svg, createElement("span", "gate-progress-text tnum", gates.text));
    wrap.append(createElement("span", "visually-hidden", ` gates. ${gates.title.replace(/\n/g, ". ")}`));
    return wrap;
  }

  function gapCount(value) {
    if (value === null || value === undefined) return createElement("span", "gap-count muted", "–");
    const element = createElement("span", `gap-count tnum${value ? " gap-count-open" : ""}`, String(value));
    element.title = `${plural(value, "open gap")} (open, partial, drift or deferred) involving this BC`;
    element.append(createElement("span", "visually-hidden", ` open gap${value === 1 ? "" : "s"}`));
    return element;
  }

  // Progress rail: passed states filled, current emphasised, future hollow.
  function lifecycleRail(row, className) {
    const rail = createElement("span", `rail ${className || ""}`.trim());
    rail.setAttribute("aria-hidden", "true");
    rail.style.setProperty("--progress", String(row.position > 0 ? row.position / (row.steps.length - 1) : 0));
    if (row.marker) rail.classList.add(`rail-marker-${slug(row.marker.state)}`);
    row.steps.forEach((step) => {
      const cell = createElement("span", `rail-step rail-${step.status}`);
      cell.title = `${step.label}${step.status === "current" ? (row.marker ? ` (now ${row.marker.label})` : " (current)") : ""}`;
      cell.append(createElement("span", "rail-dot"));
      rail.append(cell);
    });
    return rail;
  }

  function railText(row) {
    if (row.position < 0) return `Lifecycle: ${row.lifecycleLabel}`;
    return `Lifecycle: ${row.lifecycleLabel}${row.marker ? `, from ${row.steps[row.position].label}` : ""}, step ${row.position + 1} of ${row.steps.length}`;
  }

  function nextSkillLine(row) {
    const line = createElement("span", "next-skill truncate");
    line.append(createElement("span", "next-skill-label", "Next "));
    line.append(document.createTextNode(row.nextSkill || "–"));
    if (row.nextSkill) line.title = `Next skill: ${row.nextSkill}`;
    return line;
  }

  function bcTitleLine(row) {
    const line = createElement("span", "bc-title-line");
    line.append(createElement("span", "bc-name truncate", row.name));
    const marker = markerPill(row);
    if (marker) line.append(marker);
    if (row.warningCount) line.append(warningBadge(row.warningCount, { hidden: false }));
    return line;
  }

  function renderMatrixRow(row, selected, onSelect) {
    const button = createElement("button", "matrix-row");
    button.type = "button";
    button.dataset.bcId = row.id;
    button.setAttribute("aria-pressed", String(selected));
    if (!row.gates.valid && row.gates.total) button.classList.add("is-gate-invalid");
    const main = createElement("span", "matrix-cell matrix-bc");
    main.append(bcTitleLine(row));
    const meta = createElement("span", "bc-meta");
    meta.append(classificationPills(row), nextSkillLine(row));
    main.append(meta);
    const railCell = createElement("span", "matrix-cell matrix-rail");
    railCell.append(lifecycleRail(row), createElement("span", "visually-hidden", railText(row)));
    const mobileState = createElement("span", "matrix-state-label", row.lifecycleLabel);
    railCell.append(mobileState);
    const gates = createElement("span", "matrix-cell matrix-gates");
    gates.append(gateProgress(row.gates));
    const gaps = createElement("span", "matrix-cell matrix-gaps");
    gaps.append(gapCount(row.openGaps));
    button.append(main, railCell, gates, gaps);
    button.addEventListener("click", () => onSelect(row.id, button));
    return button;
  }

  function renderMatrix(matrix, container, selectedBcId, onSelect) {
    const wrap = createElement("div", "matrix");
    const head = createElement("div", "matrix-head");
    head.setAttribute("aria-hidden", "true");
    head.append(createElement("span", "matrix-cell matrix-bc", "Bounded context"));
    const states = createElement("span", "matrix-cell matrix-rail matrix-states");
    for (const state of matrix.states) {
      // Soft hyphens let long state names wrap in narrow columns.
      const label = createElement("span", "matrix-state", state.label.replace(/^Implement/, "Imple\u00adment"));
      const text = glossaryText("lifecycle", state.state);
      if (text) {
        label.title = text;
        label.classList.add("has-tooltip");
      }
      states.append(label);
    }
    head.append(states);
    const gatesHead = createElement("span", "matrix-cell matrix-gates", "Gates");
    gatesHead.title = glossaryText("badge", "gates") || "";
    head.append(gatesHead, createElement("span", "matrix-cell matrix-gaps", "Gaps"));
    wrap.append(head);
    const list = createElement("div", "matrix-body");
    list.setAttribute("role", "list");
    list.setAttribute("aria-label", "Bounded contexts by lifecycle");
    if (!matrix.rows.length) list.append(createElement("p", "muted board-empty", "No bounded contexts in the projection."));
    for (const row of matrix.rows) {
      const item = createElement("div", "matrix-item");
      item.setAttribute("role", "listitem");
      item.append(renderMatrixRow(row, row.id === selectedBcId, onSelect));
      list.append(item);
    }
    wrap.append(list);
    container.append(wrap);
  }

  function renderKanbanCard(row, selected, onSelect) {
    const button = createElement("button", "kanban-card");
    button.type = "button";
    button.dataset.bcId = row.id;
    button.setAttribute("aria-pressed", String(selected));
    if (!row.gates.valid && row.gates.total) button.classList.add("is-gate-invalid");
    button.append(bcTitleLine(row), classificationPills(row));
    const footer = createElement("span", "kanban-card-footer");
    footer.append(gateProgress(row.gates));
    const gaps = createElement("span", "kanban-gaps");
    gaps.append(gapCount(row.openGaps), createElement("span", "muted", " gaps"));
    footer.append(gaps);
    button.append(footer, nextSkillLine(row));
    button.addEventListener("click", () => onSelect(row.id, button));
    return button;
  }

  function renderKanban(matrix, container, selectedBcId, onSelect) {
    const wrap = createElement("div", "kanban");
    for (const column of matrix.columns) {
      const columnElement = createElement("section", `kanban-col${column.collapsed ? " is-collapsed" : ""}${column.optional ? " is-optional" : ""}`);
      const headingId = `board-column-${slug(column.state)}`;
      columnElement.setAttribute("aria-labelledby", headingId);
      const heading = createElement("h3", "kanban-col-title");
      heading.id = headingId;
      const text = glossaryText("lifecycle", column.state);
      heading.title = `${column.label}: ${column.count} BC${column.count === 1 ? "" : "s"}${text ? ` — ${text}` : ""}`;
      heading.append(createElement("span", "kanban-col-label", column.label), createElement("span", "kanban-col-count tnum", String(column.count)));
      columnElement.append(heading);
      for (const row of column.rows) columnElement.append(renderKanbanCard(row, row.id === selectedBcId, onSelect));
      wrap.append(columnElement);
    }
    container.append(wrap);
  }

  // Matrix (default) or kanban view of the board. onSelect(bcId, triggerElement).
  function renderBoardLanes(board, container, selectedBcId, onSelect, view = "matrix") {
    container.replaceChildren();
    container.dataset.view = view;
    const matrix = buildLifecycleMatrix(board);
    if (view === "kanban") renderKanban(matrix, container, selectedBcId, onSelect);
    else renderMatrix(matrix, container, selectedBcId, onSelect);
  }

  function summaryTile({ key, label, value, detail, tone, title, onClick, extra }) {
    const tile = createElement(onClick ? "button" : "div", `stat-tile stat-tile-${key} stat-${tone || "neutral"}`);
    if (onClick) {
      tile.type = "button";
      tile.addEventListener("click", onClick);
    }
    if (title) tile.title = title;
    tile.append(createElement("span", "stat-label", label));
    tile.append(createElement("span", "stat-value tnum", value));
    if (extra) tile.append(extra);
    tile.append(createElement("span", "stat-detail truncate", detail));
    return tile;
  }

  // Summary strip: BCs by state, gates met, open gaps, warnings, last change.
  function renderSummaryStrip(board, container, handlers = {}) {
    container.replaceChildren();
    const model = buildSummaryStrip(board);
    const bar = createElement("span", "state-bar");
    bar.setAttribute("aria-hidden", "true");
    for (const entry of model.byState) {
      const segment = createElement("span", `state-bar-seg state-seg-${slug(entry.state)}`);
      segment.style.flexGrow = String(entry.count);
      segment.title = `${entry.count} ${entry.label}`;
      bar.append(segment);
    }
    container.append(
      summaryTile({
        key: "states",
        label: "Bounded contexts",
        value: String(model.total),
        detail: model.stateText,
        title: model.stateText,
        extra: bar,
      }),
      summaryTile({
        key: "gates",
        label: "Gates met",
        value: model.gates.text,
        detail: model.gates.invalidNames.length ? `Not valid: ${model.gates.invalidNames.join(", ")}` : model.gates.detail,
        tone: model.total === 0 ? "neutral" : model.gates.allValid ? "success" : "danger",
        title: `${model.gates.detail} for their current transition`,
      }),
      summaryTile({
        key: "gaps",
        label: "Open gaps",
        value: String(model.gaps.open),
        detail: model.gaps.detail,
        tone: model.gaps.tone,
        title: "Open + partial + drift gaps. Click to go to the gap ledger.",
        onClick: handlers.onGaps,
      }),
      summaryTile({
        key: "warnings",
        label: "Warnings",
        value: String(model.warnings.count),
        detail: model.warnings.detail,
        tone: model.warnings.tone,
        title: "Projection warnings. Click to open the diagnostics.",
        onClick: handlers.onWarnings,
      }),
      summaryTile({
        key: "last",
        label: "Last change",
        value: model.lastChange ? model.lastChange.date : "–",
        detail: model.lastChange ? model.lastChange.text : "No dated transitions",
        title: model.lastChange
          ? `${model.lastChange.bcName}: ${model.lastChange.from || "–"} → ${model.lastChange.to}. Click for details.`
          : "",
        onClick: model.lastChange && handlers.onBc ? (event) => handlers.onBc(model.lastChange.bcId, event.currentTarget) : null,
      }),
    );
    return model;
  }

  const GAP_PANEL_ICONS = {
    attention: { icon: "\u26a0", text: "Warning:" },
    pending: { icon: "\u26a0", text: "Pending:" },
    clear: { icon: "\u2713", text: "All clear:" },
    empty: { icon: "\u2013", text: "Empty:" },
  };

  // Header line: icon (aria-hidden, with screen-reader text), title, count chips.
  function gapPanelHeader(model, tag) {
    const header = createElement(tag, "gap-panel-header");
    header.id = "gapLedgerTitle";
    const icon = GAP_PANEL_ICONS[model.level];
    const iconElement = createElement("span", "gap-panel-icon", icon.icon);
    iconElement.setAttribute("aria-hidden", "true");
    header.append(iconElement, createElement("span", "visually-hidden", `${icon.text} `));
    const title = createElement("span", "gap-panel-title", `Gap ledger: ${model.title}`);
    withTooltip(title, "gapPanel", model.level, { hidden: false });
    header.append(title);
    if (model.chips.length) {
      const chips = createElement("span", "gap-panel-chips");
      model.chips.forEach((chip, index) => {
        if (index) chips.append(createElement("span", "gap-panel-chip-sep", " · "));
        const chipElement = createElement("span", `gap-panel-chip gap-panel-chip-${chip.key}`, chip.text);
        withTooltip(chipElement, "gapState", chip.state, { hidden: false });
        chips.append(chipElement);
      });
      header.append(chips);
    }
    return header;
  }

  // One gap: ID, state, title and dispositions. Identical dispositions collapse
  // to one line with "n sources agree" (expand for the file:line list); sources
  // that differ are listed one by one and highlighted (T14b).
  function renderGapItem(gap) {
    const stateValue = gap.state || "OPEN";
    const item = createElement("li", `gap-item gap-item-${slug(stateValue)}`);
    item.dataset.gapId = gap.id;
    const head = createElement("div", "gap-item-head");
    head.append(createElement("code", "gap-id", gap.id));
    head.append(
      withTooltip(
        createElement("span", `gap-state gap-state-${slug(stateValue)}`, gap.stateLabel || gapStateLabel(stateValue)),
        "gapState",
        stateValue,
      ),
    );
    if (gap.warningCount) head.append(warningBadge(gap.warningCount));
    item.append(head);
    if (gap.gap) item.append(createElement("p", "gap-item-title", gap.gap));
    const model = collapseDispositions(gap.sources);
    if (!model.common) {
      item.append(createElement("p", "muted gap-disp-text", "No sources recorded."));
      return item;
    }
    const common = createElement("div", "gap-disp");
    const text = createElement("p", "gap-disp-text");
    appendRichText(text, model.common.disposition || "–");
    if (model.common.owners.length) text.append(createElement("span", "gap-owner", ` — ${model.common.owners.join(", ")}`));
    common.append(text);
    const details = createElement("details", "gap-agree");
    const summary = createElement("summary", model.agree ? "" : "gap-agree-partial", model.common.text);
    details.append(summary);
    const list = createElement("ul", "gap-source-list");
    for (const source of model.common.sources) {
      const li = createElement("li");
      const code = createElement("code", "cell-path", source.location || "–");
      code.title = source.location || "";
      li.append(code);
      list.append(li);
    }
    details.append(list);
    common.append(details);
    item.append(common);
    if (model.differing.length) {
      const differ = createElement("ul", "gap-differ");
      differ.setAttribute("aria-label", "Sources with a different disposition");
      for (const source of model.differing) {
        const li = createElement("li", "gap-differ-item");
        const code = createElement("code", "cell-path", source.location || "–");
        code.title = source.location || "";
        li.append(createElement("span", "gap-differ-flag", "Differs"), code);
        const body = createElement("p", "gap-disp-text");
        appendRichText(body, source.disposition || "–");
        if (source.owner) body.append(createElement("span", "gap-owner", ` — ${source.owner}`));
        li.append(body);
        differ.append(li);
      }
      item.append(differ);
    }
    return item;
  }

  function renderGapList(gaps, parent, empty) {
    if (!gaps.length) {
      parent.append(createElement("p", "muted", empty || "None recorded."));
      return;
    }
    const list = createElement("ul", "gap-list");
    for (const gap of gaps) list.append(renderGapItem(gap));
    parent.append(list);
  }

  function renderGapLedger(board, container) {
    const model = gapPanelModel(board ? board.gaps : []);
    container.replaceChildren();
    container.className = `gap-panel gap-panel-${model.level}`;
    container.dataset.level = model.level;
    if (!container.hasAttribute("tabindex")) container.tabIndex = -1;

    if (model.level === "clear" || model.level === "empty") {
      const details = createElement("details", "gap-panel-collapsed");
      const summary = createElement("summary");
      summary.append(gapPanelHeader(model, "span"));
      details.append(summary);
      renderGapList(model.resolved, details, "No gaps in the projection (schema v1 and legacy projects carry none).");
      if (model.level === "clear") details.append(renderLegend("gaps"));
      container.append(details);
      return;
    }

    container.append(gapPanelHeader(model, "h2"));
    renderGapList(model.unresolved, container);
    if (model.resolved.length) {
      const toggle = createElement("button", "btn btn-sm btn-ghost gap-panel-toggle", `Show resolved (${model.resolved.length})`);
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", "false");
      const resolvedWrap = createElement("div", "gap-panel-resolved");
      resolvedWrap.id = "gapLedgerResolved";
      resolvedWrap.hidden = true;
      toggle.setAttribute("aria-controls", resolvedWrap.id);
      renderGapList(model.resolved, resolvedWrap);
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        toggle.textContent = `${expanded ? "Show" : "Hide"} resolved (${model.resolved.length})`;
        resolvedWrap.hidden = expanded;
      });
      container.append(toggle, resolvedWrap);
    }
    container.append(renderLegend("gaps"));
  }

  function renderBoardDiagnostics(board, details, list, countElement) {
    list.replaceChildren();
    countElement.textContent = String(board.diagnostics.length);
    if (board.diagnostics.length === 0) {
      list.append(createElement("p", "muted", "No diagnostics."));
    }
    for (const diagnostic of board.diagnostics) {
      const item = createElement("div", `diagnostic ${diagnostic.severity || "warning"}`);
      const location = diagnostic.file ? `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ""}` : "";
      if (diagnostic.code) item.append(createElement("strong", "", `${diagnostic.code} `));
      item.append(document.createTextNode(diagnostic.message || ""));
      if (location) {
        item.append(document.createTextNode(" "));
        item.append(createElement("code", "", location));
      }
      list.append(item);
    }
    details.open = board.warnings.expanded;
  }


  // Text with `backtick` segments rendered as <code>.
  function appendRichText(parent, text) {
    String(text || "").split(/(`[^`]+`)/).forEach((part) => {
      if (!part) return;
      if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) parent.append(createElement("code", "", part.slice(1, -1)));
      else parent.append(document.createTextNode(part));
    });
    return parent;
  }

  function renderChangeLists(summary, container) {
    for (const category of summary.categories) {
      const block = createElement("div", "change-category");
      block.append(createElement("h5", "", `${category.label} (${category.count})`));
      const list = createElement("ul", "change-list");
      for (const kind of CHANGE_KINDS) {
        for (const item of category[kind]) {
          const li = createElement("li", `change-${kind}`);
          li.append(withTooltip(createElement("span", `change-kind change-kind-${kind}`, kind), "changeKind", kind));
          li.append(document.createTextNode(" "));
          li.append(createElement("span", "change-text", item.text));
          list.append(li);
        }
      }
      block.append(list);
      container.append(block);
    }
  }

  // Collapsible change summary; "No changes" / "Unknown" render as plain text.
  function renderChangeSummary(title, summary, extra) {
    const hasBody = summary.known && (!summary.empty || (extra && extra.files && extra.files.length));
    const wrapper = createElement(hasBody ? "details" : "div", "change-summary");
    const head = createElement(hasBody ? "summary" : "p", "change-summary-head");
    if (title) {
      const titleElement = createElement("strong", "", `${title}: `);
      if (extra && extra.id === "uncommitted") withTooltip(titleElement, "commit", "uncommitted", { hidden: false });
      head.append(titleElement);
    }
    const text = createElement("span", summary.empty ? "muted" : summary.known ? "" : "muted", summary.text);
    if (!summary.known) withTooltip(text, "commit", "unknown");
    head.append(text);
    if (extra && extra.base) head.append(createElement("span", "change-base", ` (${extra.base})`));
    wrapper.append(head);
    if (!hasBody) return wrapper;
    const body = createElement("div", "change-summary-body");
    if (summary.lifecycle) {
      body.append(createElement("p", "", `Lifecycle: ${summary.lifecycle.from || "–"} → ${summary.lifecycle.to || "–"}`));
    }
    renderChangeLists(summary, body);
    if (extra && extra.files && extra.files.length) {
      body.append(createElement("h5", "", `Files (${extra.files.length})`));
      const files = createElement("ul", "change-files");
      for (const file of extra.files) {
        const li = createElement("li");
        li.append(createElement("code", "", file));
        files.append(li);
      }
      body.append(files);
    }
    wrapper.append(body);
    return wrapper;
  }

  function renderGateList(gates, className) {
    const list = createElement("ul", className || "timeline-gates");
    for (const gate of gates) {
      const li = createElement("li", gate.result === "FAIL" ? "gate-row-fail" : "");
      li.append(resultBadge(gate.result), document.createTextNode(" "));
      li.append(createElement("strong", "", gate.gate));
      const meta = [gate.date, gate.signedBy ? `signed by ${gate.signedBy}` : "unsigned"].filter(Boolean);
      if (gate.kind) li.append(createElement("span", "muted", " · "), kindAbbr(gate.kind));
      li.append(createElement("span", "muted", ` · ${meta.join(" · ")}`));
      if (gate.transition) li.append(createElement("span", "muted", ` · ${gate.transition}`));
      if (gate.evidence) {
        const evidence = createElement("div", "timeline-evidence");
        appendRichText(evidence, gate.evidence);
        li.append(evidence);
      }
      list.append(li);
    }
    return list;
  }

  function renderTimeline(model, slot) {
    slot.replaceChildren();
    slot.hidden = false;
    if (model.hint) {
      const hint = createElement("p", "timeline-hint muted");
      appendRichText(hint, model.hint);
      slot.append(hint);
    }
    for (const notice of model.notices) {
      const p = createElement("p", "timeline-notice");
      appendRichText(p, notice);
      slot.append(p);
    }
    if (model.baselines.length) {
      const changes = createElement("section", "drawer-section");
      changes.append(createElement("h3", "", "Changes"));
      const summaries = createElement("div", "change-summaries");
      for (const baseline of model.baselines) {
        summaries.append(
          renderChangeSummary(baseline.title, baseline.summary, { id: baseline.id, base: baseline.base, files: baseline.files }),
        );
      }
      changes.append(summaries);
      slot.append(changes);
    }
    const timelineSection = createElement("section", "drawer-section");
    timelineSection.append(createElement("h3", "", "Timeline"));
    slot.append(timelineSection);
    if (model.steps.length === 0) {
      timelineSection.append(createElement("p", "muted", "No transitions recorded."));
    } else {
      const list = createElement("ol", "timeline");
      model.steps.forEach((step, index) => {
        const item = createElement("li", `timeline-step${index === model.steps.length - 1 ? " is-current" : ""}`);
        const head = createElement("div", "timeline-step-head");
        const to = createElement("span", "pill pill-lifecycle pill-info", lifecycleLabel(step.to));
        withTooltip(to, "lifecycle", step.to, { hidden: false });
        head.append(to);
        head.append(createElement("span", "timeline-from muted", `from ${step.from && step.from !== "-" ? lifecycleLabel(step.from) : "start"}`));
        head.append(createElement("span", "timeline-date cell-date", step.date || "no date"));
        item.append(head);
        if (step.actor) item.append(createElement("p", "timeline-actor muted", step.actor));
        if (step.commit) {
          const commit = createElement("div", `timeline-commit commit-${step.commit.kind}`);
          if (step.commit.kind === "commit") {
            commit.append(createElement("code", "commit-chip", step.commit.shortSha || ""));
            if (step.commit.subject) commit.append(createElement("span", "commit-subject truncate", step.commit.subject));
            if (step.commit.subject) commit.title = step.commit.subject;
          } else {
            commit.textContent = step.commit.text;
            withTooltip(commit, "commit", step.commit.kind);
          }
          item.append(commit);
        }
        if (step.evidence) item.append(appendRichText(createElement("div", "timeline-evidence"), step.evidence));
        if (step.gates.length) item.append(renderGateList(step.gates));
        if (step.sharedNote) {
          item.append(withTooltip(createElement("p", "timeline-shared muted", step.sharedNote), "commit", "sharedCommit", { hidden: false }));
        }
        if (step.changes) {
          const title = step.sharedGroupSize > 1 ? `Changes (${step.sharedGroupSize} transitions in this commit)` : "Changes";
          item.append(renderChangeSummary(title, step.changes));
        }
        list.append(item);
      });
      timelineSection.append(list);
    }
    if (model.unmatchedGates.length) {
      timelineSection.append(createElement("h4", "", "Gates for transitions not recorded yet"));
      timelineSection.append(renderGateList(model.unmatchedGates));
    }
  }

  function callout(tone, title, items, formatter) {
    const box = createElement("section", `callout callout-${tone}`);
    box.append(createElement("h3", "", title));
    const list = createElement("ul");
    for (const item of items) list.append(createElement("li", "", formatter(item)));
    box.append(list);
    return box;
  }

  // BC details for the Board slide-over (T14b). Sections in order: header,
  // blockers/warnings, changes, timeline (slot), gate evidence, open items, sign-offs.
  function renderBoardDetails(project, board, bcId, container, statusReport = null) {
    container.replaceChildren();
    const bc = project && project.boundedContexts.find((item) => item.id === bcId);
    const card = board && board.cards.find((item) => item.id === bcId);
    if (!bc || !card) {
      container.append(createElement("p", "muted", "Select a bounded context to see its lifecycle evidence."));
      return;
    }
    const row = matrixRow(card);
    const header = createElement("header", "drawer-header");
    header.append(createElement("p", "eyebrow", "Bounded context"));
    const title = createElement("h2", "drawer-title", bc.name);
    title.id = "bcDrawerTitle";
    header.append(title);
    const pills = createElement("div", "drawer-pills");
    const lifecycleTone = { VERIFIED: "pill-success", BLOCKED: "pill-danger", DEPRECATED: "pill-neutral" }[card.lifecycle] || "pill-info";
    const lifecycle = pill(row.lifecycleLabel, `pill-lifecycle ${lifecycleTone}`);
    withTooltip(lifecycle, "lifecycle", card.lifecycle, { hidden: false });
    pills.append(lifecycle, classificationPills(row));
    const marker = markerPill(row);
    if (marker && !row.marker) pills.append(marker);
    if (card.warningCount) pills.append(warningBadge(card.warningCount));
    header.append(pills);
    const railWrap = createElement("div", "drawer-rail");
    railWrap.append(lifecycleRail(row, "rail-labelled"), createElement("span", "visually-hidden", railText(row)));
    const labels = createElement("div", "drawer-rail-labels");
    labels.setAttribute("aria-hidden", "true");
    row.steps.forEach((step) => labels.append(createElement("span", `rail-label rail-label-${step.status}`, step.label)));
    railWrap.append(labels);
    header.append(railWrap);
    const facts = createElement("dl", "drawer-facts");
    const fact = (label, value) => {
      const item = createElement("div", "drawer-fact");
      item.append(createElement("dt", "", label));
      const dd = createElement("dd");
      if (value instanceof Node) dd.append(value);
      else dd.textContent = value;
      item.append(dd);
      facts.append(item);
    };
    const next = createElement("span", "", card.nextSkill || "–");
    fact("Next skill", next);
    const gateWrap = createElement("span", "drawer-gates");
    gateWrap.append(gateProgress(row.gates));
    if (card.gateSummary.transition) gateWrap.append(createElement("span", "muted", transitionKey(card.gateSummary.transition).replace("->", "→")));
    fact("Gates", gateWrap);
    fact("Since", createElement("span", "cell-date", card.lifecycleDate || "–"));
    header.append(facts);
    if (row.gates.unmet.length) {
      header.append(createElement("p", "drawer-unmet", `Unmet: ${row.gates.unmet.join(", ")}`));
    }
    const show = (value) => (value === null || value === undefined ? "–" : String(value));
    const stats = createElement("div", "drawer-stats");
    [
      [card.stats.rules, "rules"],
      [card.stats.scenarios, "scenarios"],
      [card.stats.decisions, "decisions"],
      [card.stats.openGaps, "open gaps"],
      [card.signoffCount, "sign-offs"],
    ].forEach(([value, word]) => {
      const chip = createElement("span", "chip");
      chip.append(createElement("strong", "tnum", show(value)), document.createTextNode(` ${word}`));
      stats.append(chip);
    });
    header.append(stats);
    container.append(header);

    const body = createElement("div", "drawer-content");
    container.append(body);
    if (card.blocked) body.append(callout("danger", "Blockers", card.blockers, String));
    if (card.warningCount) {
      body.append(callout("warning", "Warnings", card.warnings, (item) => `${item.code ? `${item.code}: ` : ""}${item.message}`));
    }
    const timeline = buildTimelineModel(project, statusReport, bc.id);
    if (timeline && timeline.coverage) body.append(createElement("p", "project-meta timeline-coverage", timeline.coverage));
    const timelineSlot = createElement("div", "board-timeline-slot");
    timelineSlot.dataset.slot = "timeline";
    timelineSlot.dataset.bcId = bc.id;
    timelineSlot.hidden = true;
    body.append(timelineSlot);
    if (timeline) renderTimeline(timeline, timelineSlot);
    const gateEvidence = appendTable(
      body,
      "All gate evidence",
      ["Gate", "Result", "Evidence and signer"],
      (bc.gates || []).map((item) => {
        const gateCell = createElement("div", "gate-cell");
        const name = createElement("span", "gate-name");
        name.append(createElement("strong", "", item.gate || "–"));
        if (item.kind) name.append(document.createTextNode(" "), kindAbbr(item.kind));
        gateCell.append(name);
        if (item.transition) gateCell.append(createElement("span", "gate-transition muted", transitionKey(item.transition).replace("->", "→")));
        gateCell.append(createElement("span", "gate-date cell-date", item.date || "no date"));
        const evidence = createElement("div", "gate-evidence");
        appendRichText(evidence, item.evidence || "–");
        evidence.append(createElement("span", "gate-signer", item.signedBy ? `Signed by ${item.signedBy}` : "Unsigned"));
        return {
          className: item.result === "FAIL" ? "gate-row-fail" : "",
          cells: [gateCell, resultBadge(item.result), evidence],
        };
      }),
      { className: "drawer-section" },
    );
    gateEvidence.append(renderLegend("gates"));
    appendTable(
      body,
      "Open items",
      ["ID", "Item", "Owner", "Disposition"],
      (bc.openItems || []).map((item) => ({ cells: [item.id, item.item, item.owner, item.disposition] })),
      { className: "drawer-section table-ids" },
    );
    appendTable(
      body,
      "Sign-offs",
      ["Kind", "File", "Date", "Outcome"],
      (bc.signoffs || []).map((item) => {
        const file = createElement("code", "cell-path", item.file || "–");
        file.title = item.file || "";
        return { cells: [item.kind, file, item.date, item.outcome || item.status] };
      }),
      { className: "drawer-section" },
    );
  }

  function indexFiles(files) {
    const map = new Map();
    for (const file of Array.from(files || [])) {
      const path = relativeProjectPath(file.webkitRelativePath || file.name);
      if (isProjectFile(path)) map.set(path, file);
    }
    return map;
  }

  // Returns { project, diagnostics, statusReport }. statusReport is the optional
  // .hgate/status.json (null when absent); the Board timeline renders it (T7b).
  async function loadProject(fileMap) {
    const loaded = await loadProjectModel(fileMap);
    const status = await readStatusReport(fileMap);
    return {
      project: loaded.project,
      diagnostics: [...loaded.diagnostics, ...status.diagnostics],
      statusReport: status.statusReport,
    };
  }

  async function loadProjectModel(fileMap) {
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

  // "?" header button → side panel with the embedded viewer guide. Non-modal
  // drawer: Esc or Close hides it and focus returns to the button.
  function initHelpPanel() {
    const button = document.getElementById("helpBtn");
    const panel = document.getElementById("helpPanel");
    const body = document.getElementById("helpPanelBody");
    const close = document.getElementById("helpCloseBtn");
    if (!button || !panel || !body) return;
    let rendered = false;
    const isOpen = () => !panel.hidden;
    const hide = (restoreFocus = true) => {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
      if (restoreFocus) button.focus();
    };
    const show = () => {
      if (!rendered) {
        // Safe: renderMarkdown escapes all source text.
        body.innerHTML = renderMarkdown(guideMarkdown(), { headingOffset: 1, firstHeadingId: "helpPanelTitle" });
        rendered = true;
      }
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      (close || panel).focus();
    };
    button.addEventListener("click", () => (isOpen() ? hide() : show()));
    if (close) close.addEventListener("click", () => hide());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) {
        event.preventDefault();
        hide();
      }
    });
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
    const viewScenariosButton = document.getElementById("viewScenariosBtn");
    const scenarioSource = document.getElementById("sourceInput");
    const scenarioRender = document.getElementById("renderBtn");
    const zoomLevel = document.getElementById("zoomLevel");
    const scenarioLoadButton = document.getElementById("scenarioLoadProjectBtn");
    const scenarioStatus = document.getElementById("scenarioProjectStatus");
    const scenarioSources = document.getElementById("scenarioSources");
    const boardTab = document.getElementById("boardTab");
    const boardPanel = document.getElementById("boardPanel");
    const boardLoadButton = document.getElementById("boardLoadProjectBtn");
    const boardStatus = document.getElementById("boardProjectStatus");
    const boardLanes = document.getElementById("boardLanes");
    const boardDetails = document.getElementById("boardDetails");
    const gapLedger = document.getElementById("gapLedger");
    const boardDiagnostics = document.getElementById("boardDiagnostics");
    const boardDiagnosticsList = document.getElementById("boardDiagnosticsList");
    const boardDiagnosticsCount = document.getElementById("boardDiagnosticsCount");
    const warningBanner = document.getElementById("warningBanner");
    const warningBannerText = document.getElementById("warningBannerText");
    const warningBannerShow = document.getElementById("warningBannerShow");
    const welcomePanel = document.getElementById("welcomePanel");
    const welcomeLoadButton = document.getElementById("welcomeLoadBtn");
    const welcomeStatus = document.getElementById("welcomeStatus");
    const reloadButton = document.getElementById("reloadProjectBtn");
    const appProject = document.getElementById("appProject");
    const boardSummary = document.getElementById("boardSummary");
    const boardViewButtons = Array.from(document.querySelectorAll("[data-board-view]"));
    const drawer = document.getElementById("bcDrawer");
    const drawerScrim = document.getElementById("bcDrawerScrim");
    const drawerClose = document.getElementById("bcDrawerClose");
    const projectName = document.getElementById("projectName");
    if (!scenarioTab || !projectTab || !folderInput) return;
    let diagramZoom = 100;
    let topology = null;
    let projectFiles = new Map();
    let loadedProject = null;
    let loadedBoard = null;
    // Optional .hgate/status.json (or null). Rendered in the per-BC timeline (T7b).
    let statusReport = null;
    let selectedBcId = null;
    let activeScenarioId = null;
    // Directory handle of the last showDirectoryPicker load, reused by Reload.
    let lastHandle = null;
    // Board view (T14b): "matrix" (default) or "kanban". Drawer focus return target.
    let boardView = "matrix";
    let drawerReturnFocus = null;

    const updateZoom = (nextZoom) => {
      diagramZoom = clampZoom(nextZoom);
      const svg = graph.querySelector("svg");
      if (topology) topology.setZoom(diagramZoom);
      zoomLevel.value = `${diagramZoom}%`;
      zoomLevel.textContent = `${diagramZoom}%`;
      zoomOutButton.disabled = !svg || diagramZoom <= MIN_ZOOM;
      zoomInButton.disabled = !svg || diagramZoom >= MAX_ZOOM;
      fitDiagramButton.disabled = !svg || diagramZoom === 100;
    };

    const scenarioPathFor = (bcId) => {
      const bc = loadedProject && loadedProject.boundedContexts.find((item) => item.id === bcId);
      return findScenarioPath(bc, projectFiles);
    };

    const renderScenarioSources = () => {
      if (!scenarioSources) return;
      const groups = listScenarioSources(loadedProject, projectFiles);
      scenarioSources.replaceChildren();
      scenarioSources.hidden = groups.length === 0;
      for (const group of groups) {
        const groupElement = createElement("div", "scenario-source-group");
        groupElement.append(createElement("span", "scenario-source-label", group.label));
        const pills = createElement("div", "scenario-source-pills");
        for (const item of group.items) {
          const pill = createElement("button", "bc-pill", item.name);
          pill.type = "button";
          pill.dataset.bcId = item.id;
          pill.disabled = !item.path;
          pill.title = item.path || "No bdd-scenarios.md found for this bounded context";
          pill.setAttribute("aria-pressed", String(item.id === activeScenarioId));
          pill.addEventListener("click", () => showScenarios(item.id, item.path));
          pills.append(pill);
        }
        groupElement.append(pills);
        scenarioSources.append(groupElement);
      }
    };

    const markActivePill = () => {
      if (!scenarioSources) return;
      for (const pill of scenarioSources.querySelectorAll(".bc-pill")) {
        pill.setAttribute("aria-pressed", String(pill.dataset.bcId === activeScenarioId));
      }
    };

    const showScenarios = async (bcId, path) => {
      if (!path || !projectFiles.has(path)) return;
      scenarioSource.value = await projectFiles.get(path).text();
      scenarioRender.click();
      activeScenarioId = bcId;
      markActivePill();
      if (loadedProject && loadedProject.boundedContexts.some((bc) => bc.id === bcId)) selectBc(bcId);
      activate("scenario");
    };

    const openDiagnostics = () => {
      closeDrawer(false);
      activate("board");
      if (!boardDiagnostics) return;
      boardDiagnostics.open = true;
      boardDiagnostics.scrollIntoView({ block: "center" });
      const summaryElement = boardDiagnostics.querySelector("summary");
      if (summaryElement) summaryElement.focus();
    };

    const focusGaps = () => {
      if (!gapLedger) return;
      gapLedger.scrollIntoView({ block: "start" });
      gapLedger.focus({ preventScroll: true });
    };

    // BC slide-over (T14b): modal, Esc / close button / scrim close it, Tab is
    // trapped inside and focus returns to the row that opened it. URL-free.
    const shellParts = () => Array.from(document.querySelectorAll(".app-bar, .app-main"));
    const isDrawerOpen = () => Boolean(drawer) && !drawer.hidden;
    const openDrawer = (bcId, trigger) => {
      if (!drawer) return;
      selectBc(bcId);
      if (trigger) drawerReturnFocus = trigger;
      if (!isDrawerOpen()) {
        drawer.hidden = false;
        if (drawerScrim) drawerScrim.hidden = false;
        document.body.classList.add("has-drawer");
        for (const part of shellParts()) part.inert = true;
      }
      if (boardDetails) boardDetails.scrollTop = 0;
      (drawerClose || drawer).focus();
    };
    function closeDrawer(restoreFocus = true) {
      if (!isDrawerOpen()) return;
      drawer.hidden = true;
      if (drawerScrim) drawerScrim.hidden = true;
      document.body.classList.remove("has-drawer");
      for (const part of shellParts()) part.inert = false;
      if (restoreFocus) {
        const target =
          (drawerReturnFocus && drawerReturnFocus.isConnected && drawerReturnFocus) ||
          (boardLanes && selectedBcId && boardLanes.querySelector(`[data-bc-id="${CSS.escape(selectedBcId)}"]`));
        if (target) target.focus();
      }
      drawerReturnFocus = null;
    }

    const onBoardSelect = (bcId, trigger) => openDrawer(bcId, trigger);

    const renderBoard = () => {
      if (!boardLanes || !loadedBoard) return;
      if (boardSummary) {
        renderSummaryStrip(loadedBoard, boardSummary, { onGaps: focusGaps, onWarnings: openDiagnostics, onBc: onBoardSelect });
      }
      renderBoardLanes(loadedBoard, boardLanes, selectedBcId, onBoardSelect, boardView);
      for (const button of boardViewButtons) {
        button.setAttribute("aria-pressed", String(button.dataset.boardView === boardView));
      }
      renderBoardDetails(loadedProject, loadedBoard, selectedBcId, boardDetails, statusReport);
    };

    const selectBc = (bcId) => {
      selectedBcId = bcId;
      if (loadedProject) renderDetails(loadedProject, bcId, details);
      if (boardLanes && loadedBoard) {
        for (const card of boardLanes.querySelectorAll("[data-bc-id]")) {
          card.setAttribute("aria-pressed", String(card.dataset.bcId === bcId));
        }
        renderBoardDetails(loadedProject, loadedBoard, bcId, boardDetails, statusReport);
      }
      const path = scenarioPathFor(bcId);
      viewScenariosButton.disabled = !path;
      viewScenariosButton.title = path ? path : "No bdd-scenarios.md found for this bounded context";
    };

    const tabs = [
      ["scenario", scenarioTab, scenarioPanel],
      ["project", projectTab, projectPanel],
      ["board", boardTab, boardPanel],
    ].filter(([, tab, panel]) => tab && panel);

    // "welcome" is the first-run screen: no tab selected, tabs stay reachable.
    const activate = (name) => {
      if (welcomePanel) welcomePanel.hidden = name !== "welcome";
      for (const [tabName, tab, panel] of tabs) {
        panel.hidden = tabName !== name;
        tab.setAttribute("aria-selected", String(tabName === name));
      }
    };

    const showLoadError = (message) => {
      renderDiagnostics([{ severity: "error", message }], diagnostics);
      if (scenarioStatus) scenarioStatus.textContent = message;
      if (welcomeStatus) welcomeStatus.textContent = message;
    };

    const applyProjectFiles = async (fileMap, folderName) => {
      diagnostics.hidden = true;
      if (fileMap.size === 0) {
        showLoadError(
          `No hGATE files found in ${folderName || "the selected folder"}. ` +
            `Select the project root that contains docs/ and ${SKILLS_ROOTS.join(", ")}.`,
        );
        return;
      }
      details.replaceChildren(createElement("p", "muted", "Loading project artifacts..."));
      closeDrawer(false);
      projectFiles = fileMap;
      activeScenarioId = null;
      const loaded = await loadProject(fileMap);
      loadedProject = loaded.project;
      statusReport = loaded.statusReport;
      loadedBoard = buildBoardModel(loaded.project);
      if (warningBanner) renderWarningBanner(loadedBoard, warningBanner, warningBannerText);
      renderProjectIdentity(folderName);
      if (boardDiagnostics) {
        renderBoardDiagnostics(loadedBoard, boardDiagnostics, boardDiagnosticsList, boardDiagnosticsCount);
      }
      if (gapLedger) renderGapLedger(loadedBoard, gapLedger);
      renderSummary(loaded.project, summary);
      renderDiagnostics(loaded.diagnostics, diagnostics);
      topology = renderTopology(loaded.project, graph, selectBc);
      updateZoom(100);
      selectedBcId = loaded.project.boundedContexts[0] && loaded.project.boundedContexts[0].id;
      renderBoard();
      selectBc(selectedBcId);
      renderScenarioSources();
      if (scenarioStatus) {
        const items = listScenarioSources(loadedProject, projectFiles).flatMap((group) => group.items);
        const withScenarios = items.filter((item) => item.path).length;
        scenarioStatus.textContent =
          `${folderName ? `${folderName}: ` : ""}${withScenarios} of ${items.length} ` +
          `bounded context${items.length === 1 ? "" : "s"} with scenarios (${skillsRootOf(fileMap)})`;
      }
      if (boardStatus) {
        boardStatus.textContent =
          `${folderName ? `${folderName}: ` : ""}${loadedProject.boundedContexts.length} bounded ` +
          `context${loadedProject.boundedContexts.length === 1 ? "" : "s"}, ` +
          `${loadedBoard.gaps.length} gap${loadedBoard.gaps.length === 1 ? "" : "s"}, ` +
          `schema v${loadedProject.schemaVersion}` +
          (loadedProject.sourceMode === "legacy" ? " (legacy Markdown)" : "");
      }
    };

    // App bar: project name, reload state and the first-run screen.
    const renderProjectIdentity = (folderName) => {
      const name = (loadedProject && loadedProject.project && loadedProject.project.name) || folderName || "hGATE project";
      if (projectName) {
        projectName.textContent = name;
        projectName.title = folderName && folderName !== name ? `${name} (folder: ${folderName})` : name;
      }
      if (appProject) appProject.classList.remove("is-empty");
      if (typeof document !== "undefined") document.title = `${name} · hGATE viewer`;
      if (welcomeStatus) welcomeStatus.textContent = "";
      if (reloadButton) {
        reloadButton.disabled = false;
        reloadButton.title = lastHandle
          ? `Re-read ${lastHandle.name} from disk`
          : "Pick the project folder again to re-read it (this browser cannot re-open a folder by itself)";
      }
      if (welcomePanel && !welcomePanel.hidden) activate("board");
    };

    const loadSafely = async (load) => {
      try {
        await load();
      } catch (error) {
        if (error && error.name === "AbortError") return;
        showLoadError(`Could not load project: ${error.message}`);
      }
    };

    // Prefer the File System Access API: it reads only docs/ and the skills folders.
    // Other browsers fall back to <input webkitdirectory>, which enumerates the whole folder.
    const pickProject = () => {
      if (typeof window.showDirectoryPicker === "function") {
        loadSafely(async () => {
          const handle = await window.showDirectoryPicker({ id: "hgate-project", mode: "read" });
          lastHandle = handle;
          await applyProjectFiles(await readProjectDirectory(handle), handle.name);
        });
      } else {
        folderInput.click();
      }
    };

    // Reload re-reads the same directory handle; without one (webkitdirectory
    // fallback) the browser has to ask for the folder again.
    const reloadProject = () => {
      if (!lastHandle) {
        pickProject();
        return;
      }
      loadSafely(async () => {
        await applyProjectFiles(await readProjectDirectory(lastHandle), lastHandle.name);
      });
    };

    scenarioTab.addEventListener("click", () => activate("scenario"));
    projectTab.addEventListener("click", () => activate("project"));
    if (boardTab) boardTab.addEventListener("click", () => activate("board"));
    if (boardLoadButton) boardLoadButton.addEventListener("click", pickProject);
    if (welcomeLoadButton) welcomeLoadButton.addEventListener("click", pickProject);
    if (reloadButton) reloadButton.addEventListener("click", reloadProject);
    if (warningBannerShow) warningBannerShow.addEventListener("click", openDiagnostics);
    for (const button of boardViewButtons) {
      button.addEventListener("click", () => {
        boardView = button.dataset.boardView === "kanban" ? "kanban" : "matrix";
        renderBoard();
      });
    }
    if (drawerClose) drawerClose.addEventListener("click", () => closeDrawer());
    if (drawerScrim) drawerScrim.addEventListener("click", () => closeDrawer());
    if (drawer) {
      // Capture phase: the drawer sits above the help panel, so Esc closes it first.
      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape" && isDrawerOpen()) {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeDrawer();
          }
        },
        true,
      );
      drawer.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;
        const focusable = Array.from(
          drawer.querySelectorAll('button, [href], summary, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        ).filter((element) => !element.disabled && element.getClientRects().length > 0);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
    }
    initHelpPanel();
    selectButton.addEventListener("click", pickProject);
    if (scenarioLoadButton) scenarioLoadButton.addEventListener("click", pickProject);
    viewScenariosButton.addEventListener("click", () =>
      showScenarios(selectedBcId, scenarioPathFor(selectedBcId)),
    );
    zoomOutButton.addEventListener("click", () => updateZoom(diagramZoom - ZOOM_STEP));
    zoomInButton.addEventListener("click", () => updateZoom(diagramZoom + ZOOM_STEP));
    fitDiagramButton.addEventListener("click", () => updateZoom(100));
    folderInput.addEventListener("change", () =>
      loadSafely(async () => {
        const [first] = Array.from(folderInput.files || []);
        const folderName = first && first.webkitRelativePath ? first.webkitRelativePath.split("/")[0] : "";
        lastHandle = null;
        await applyProjectFiles(indexFiles(folderInput.files), folderName);
        folderInput.value = "";
      }),
    );
    activate(welcomePanel ? "welcome" : "scenario");
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
    GLOSSARY,
    LEGENDS,
    glossaryEntry,
    glossaryText,
    legendItems,
    legendText,
    escapeHtml,
    renderMarkdown,
    guideMarkdown,
    renderLegend,
    renderGapLedger,
    renderBoardDetails,
    renderBoardLanes,
    renderSummaryStrip,
    slug,
    parseTable,
    parseDomainMap,
    parseContextMap,
    parseFrontmatter,
    parsePorts,
    parseAcl,
    SUPPORTED_SCHEMA_VERSIONS,
    MAIN_LIFECYCLES,
    OPTIONAL_LIFECYCLES,
    STATUS_REPORT_PATH,
    validateProject,
    normalizeProject,
    transitionKey,
    transitionTarget,
    latestTransition,
    orderTransitions,
    summarizeGates,
    summarizeChanges,
    matchGatesToSteps,
    formatCoverage,
    buildTimelineModel,
    warningBannerText,
    buildBoardModel,
    buildSummaryStrip,
    buildLifecycleMatrix,
    collapseDispositions,
    baseLifecycleOf,
    gapStateLabel,
    isOpenGap,
    gapPanelModel,
    compareGapIds,
    readStatusReport,
    isProjectFile,
    buildLegacyProject,
    indexFiles,
    skillsRootOf,
    findScenarioPath,
    listScenarioSources,
    readProjectDirectory,
    loadProject,
    layoutProject,
    computeCanvasSize,
    clampZoom,
    abbreviateEdgeLabel,
  };
});
