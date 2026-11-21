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
  const SATISFIED_GATE_RESULTS = new Set(["PASS", "N/A"]);

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

  // Latest transition by date; on equal dates the later row wins.
  function latestTransition(bc) {
    let latest = null;
    for (const transition of (bc && bc.transitions) || []) {
      if (!transition) continue;
      if (!latest || String(transition.date || "") >= String(latest.date || "")) latest = transition;
    }
    return latest;
  }

  // Summarizes the gates recorded for the transition into the BC's current lifecycle.
  // A gate re-run keeps only its latest row (by date, then order), so FAIL → PASS counts as PASS.
  function summarizeGates(bc) {
    const target = bc && bc.lifecycle;
    const latest = new Map();
    ((bc && bc.gates) || []).forEach((row, index) => {
      if (!row || transitionTarget(row.transition) !== target) return;
      const previous = latest.get(row.gate);
      if (!previous || String(row.date || "") >= String(previous.row.date || "")) {
        latest.set(row.gate, { row, index });
      }
    });
    const rows = Array.from(latest.values())
      .sort((a, b) => a.index - b.index)
      .map((entry) => entry.row);
    const count = (predicate) => rows.filter(predicate).length;
    const failedGates = rows.filter((row) => row.result === "FAIL").map((row) => row.gate);
    const satisfied = count((row) => SATISFIED_GATE_RESULTS.has(row.result));
    return {
      transition: rows.length ? transitionKey(rows[rows.length - 1].transition) : null,
      total: rows.length,
      satisfied,
      passed: count((row) => row.result === "PASS"),
      notApplicable: count((row) => row.result === "N/A"),
      failed: failedGates.length,
      pending: rows.length - satisfied - failedGates.length,
      failedGates,
      hasFail: failedGates.length > 0,
      label: rows.length ? `${satisfied}/${rows.length} gates` : "No gates recorded",
    };
  }

  function numberOrNull(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function warningBannerText(count) {
    if (!count) return "";
    return `${count} warning${count === 1 ? "" : "s"} in the project projection`;
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
            (gap) => gap.state !== "RESOLVED" && gapBcIds.get(gap.id) && gapBcIds.get(gap.id).has(bc.id),
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
    const table = createElement("table", "board-table");
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
        else cell.textContent = value === null || value === undefined || value === "" ? "–" : String(value);
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

  function resultBadge(result) {
    const value = result || "–";
    return createElement("span", `result-badge result-${slug(value) || "none"}`, value);
  }

  function warningBadge(count) {
    return createElement("span", "warning-badge", `${count} warning${count === 1 ? "" : "s"}`);
  }

  function renderWarningBanner(board, banner, textElement) {
    const count = board ? board.warnings.count : 0;
    banner.hidden = count === 0;
    if (textElement) textElement.textContent = board ? board.warnings.message : "";
  }

  function renderBoardCard(card, selected, onSelect) {
    const button = createElement("button", "board-card");
    button.type = "button";
    button.dataset.bcId = card.id;
    button.setAttribute("aria-pressed", String(selected));
    if (card.blocked) button.classList.add("has-blockers");
    if (card.warningCount) button.classList.add("has-warnings");

    const header = createElement("span", "board-card-header");
    header.append(createElement("span", "board-card-title", card.name));
    if (card.warningCount) header.append(warningBadge(card.warningCount));
    button.append(header);
    button.append(
      createElement("span", "board-card-meta", `${card.classification} · ${card.role}${card.inferred ? " · inferred" : ""}`),
    );
    const facts = createElement("span", "board-card-facts");
    facts.append(createElement("span", "", card.lifecycleDate ? `Since ${card.lifecycleDate}` : "No transition date"));
    facts.append(createElement("span", "", `Next: ${card.nextSkill || "–"}`));
    button.append(facts);
    if (card.blocked) {
      button.append(
        createElement(
          "span",
          "board-card-blockers",
          `${card.blockers.length} blocker${card.blockers.length === 1 ? "" : "s"}: ${card.blockers.join("; ")}`,
        ),
      );
    }
    const show = (value) => (value === null || value === undefined ? "–" : String(value));
    const stats = createElement("span", "board-card-stats");
    stats.append(
      createElement("span", "", `${show(card.stats.rules)} rules`),
      createElement("span", "", `${show(card.stats.scenarios)} scenarios`),
      createElement("span", "", `${show(card.stats.decisions)} decisions`),
      createElement("span", card.stats.openGaps ? "stat-attention" : "", `${show(card.stats.openGaps)} open gaps`),
    );
    button.append(stats);
    const footer = createElement("span", "board-card-footer");
    const gates = createElement(
      "span",
      `gate-summary${card.gateSummary.hasFail ? " has-fail" : ""}`,
      card.gateSummary.label,
    );
    if (card.gateSummary.transition) gates.title = card.gateSummary.transition;
    footer.append(gates);
    if (card.gateSummary.hasFail) {
      footer.append(createElement("span", "gate-fail", `FAIL: ${card.gateSummary.failedGates.join(", ")}`));
    }
    footer.append(
      createElement("span", "", `${card.signoffCount} sign-off${card.signoffCount === 1 ? "" : "s"}`),
    );
    button.append(footer);
    button.addEventListener("click", () => onSelect(card.id));
    return button;
  }

  function renderBoardLanes(board, container, selectedBcId, onSelect) {
    container.replaceChildren();
    for (const column of board.columns) {
      const columnElement = createElement("section", `board-column${column.optional ? " optional" : ""}`);
      const headingId = `board-column-${slug(column.state)}`;
      columnElement.setAttribute("aria-labelledby", headingId);
      const heading = createElement("h3", "board-column-title");
      heading.id = headingId;
      heading.append(
        createElement("span", "", column.label),
        createElement("span", "board-column-count", String(column.cards.length)),
      );
      columnElement.append(heading);
      if (column.cards.length === 0) columnElement.append(createElement("p", "muted board-empty", "No BCs"));
      for (const card of column.cards) {
        columnElement.append(renderBoardCard(card, card.id === selectedBcId, onSelect));
      }
      container.append(columnElement);
    }
  }

  function renderGapLedger(board, container) {
    container.replaceChildren();
    appendTable(
      container,
      "",
      ["ID", "Gap", "State", "Dispositions by source", "Warnings"],
      board.gaps.map((gap) => {
        const state = createElement("span", `gap-state gap-state-${slug(gap.state)}`, gap.state);
        const sources = createElement("ul", "gap-sources");
        for (const item of gap.sources) {
          const li = createElement("li");
          li.append(createElement("code", "", item.location || "–"));
          li.append(document.createTextNode(` — ${item.disposition || "–"}${item.owner ? ` (${item.owner})` : ""}`));
          sources.append(li);
        }
        return {
          className: gap.mixed ? "gap-mixed" : "",
          cells: [gap.id, gap.gap, state, sources, gap.warningCount ? warningBadge(gap.warningCount) : ""],
        };
      }),
      { empty: "No gaps in the projection (schema v1 and legacy projects carry none)." },
    );
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

  // Detail panel for one BC on the Board. Sections are appended in order; the
  // timeline slot is reserved for the git-derived status report (T7b).
  function renderBoardDetails(project, board, bcId, container) {
    container.replaceChildren();
    const bc = project && project.boundedContexts.find((item) => item.id === bcId);
    const card = board && board.cards.find((item) => item.id === bcId);
    if (!bc || !card) {
      container.append(createElement("p", "muted", "Select a bounded context card to see its lifecycle evidence."));
      return;
    }
    const heading = createElement("div", "project-detail-heading");
    heading.append(createElement("h2", "", bc.name));
    if (card.warningCount) heading.append(warningBadge(card.warningCount));
    container.append(heading);
    container.append(
      createElement("p", "project-meta", `${card.classification} · ${card.role} · ${card.lifecycle}`),
    );
    container.append(
      createElement(
        "p",
        "",
        `Next skill: ${card.nextSkill || "–"} · ${card.gateSummary.label}` +
          `${card.gateSummary.transition ? ` (${card.gateSummary.transition})` : ""}`,
      ),
    );
    if (card.blocked) appendList(container, "Blockers", card.blockers, String);
    if (card.warningCount) {
      appendList(container, "Warnings", card.warnings, (item) => `${item.code ? `${item.code}: ` : ""}${item.message}`);
    }
    const timelineSlot = createElement("section", "project-detail-section board-timeline-slot");
    timelineSlot.dataset.slot = "timeline";
    timelineSlot.dataset.bcId = bc.id;
    timelineSlot.hidden = true;
    container.append(timelineSlot);
    appendTable(
      container,
      "Transitions",
      ["Date", "From", "To", "Evidence", "Actor"],
      (bc.transitions || []).map((item) => ({ cells: [item.date, item.from, item.to, item.evidence, item.actor] })),
    );
    appendTable(
      container,
      "Gates",
      ["Transition", "Gate", "Kind", "Result", "Evidence", "Signed by", "Date"],
      (bc.gates || []).map((item) => ({
        className: item.result === "FAIL" ? "gate-row-fail" : "",
        cells: [
          transitionKey(item.transition),
          item.gate,
          item.kind,
          resultBadge(item.result),
          item.evidence,
          item.signedBy,
          item.date,
        ],
      })),
    );
    appendTable(
      container,
      "Open items",
      ["ID", "Item", "Owner", "Disposition"],
      (bc.openItems || []).map((item) => ({ cells: [item.id, item.item, item.owner, item.disposition] })),
    );
    appendTable(
      container,
      "Sign-offs",
      ["Kind", "File", "Date", "Outcome"],
      (bc.signoffs || []).map((item) => ({
        cells: [item.kind, createElement("code", "", item.file || "–"), item.date, item.outcome || item.status],
      })),
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
  // .hgate/status.json (null when absent); the Board does not render it yet.
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
    if (!scenarioTab || !projectTab || !folderInput) return;
    let diagramZoom = 100;
    let topology = null;
    let projectFiles = new Map();
    let loadedProject = null;
    let loadedBoard = null;
    // Optional .hgate/status.json (or null). Kept for the per-BC timeline (T7b).
    let statusReport = null;
    let selectedBcId = null;
    let activeScenarioId = null;

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

    const renderBoard = () => {
      if (!boardLanes || !loadedBoard) return;
      renderBoardLanes(loadedBoard, boardLanes, selectedBcId, selectBc);
      renderBoardDetails(loadedProject, loadedBoard, selectedBcId, boardDetails);
    };

    const selectBc = (bcId) => {
      selectedBcId = bcId;
      if (loadedProject) renderDetails(loadedProject, bcId, details);
      if (boardLanes && loadedBoard) {
        for (const card of boardLanes.querySelectorAll(".board-card")) {
          card.setAttribute("aria-pressed", String(card.dataset.bcId === bcId));
        }
        renderBoardDetails(loadedProject, loadedBoard, bcId, boardDetails);
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

    const activate = (name) => {
      for (const [tabName, tab, panel] of tabs) {
        panel.hidden = tabName !== name;
        tab.setAttribute("aria-selected", String(tabName === name));
      }
    };

    const showLoadError = (message) => {
      renderDiagnostics([{ severity: "error", message }], diagnostics);
      if (scenarioStatus) scenarioStatus.textContent = message;
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
      projectFiles = fileMap;
      activeScenarioId = null;
      const loaded = await loadProject(fileMap);
      loadedProject = loaded.project;
      statusReport = loaded.statusReport;
      loadedBoard = buildBoardModel(loaded.project);
      if (warningBanner) renderWarningBanner(loadedBoard, warningBanner, warningBannerText);
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
          await applyProjectFiles(await readProjectDirectory(handle), handle.name);
        });
      } else {
        folderInput.click();
      }
    };

    scenarioTab.addEventListener("click", () => activate("scenario"));
    projectTab.addEventListener("click", () => activate("project"));
    if (boardTab) boardTab.addEventListener("click", () => activate("board"));
    if (boardLoadButton) boardLoadButton.addEventListener("click", pickProject);
    if (warningBannerShow) {
      warningBannerShow.addEventListener("click", () => {
        activate("board");
        if (!boardDiagnostics) return;
        boardDiagnostics.open = true;
        boardDiagnostics.scrollIntoView({ block: "start" });
        const summaryElement = boardDiagnostics.querySelector("summary");
        if (summaryElement) summaryElement.focus();
      });
    }
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
        await applyProjectFiles(indexFiles(folderInput.files), folderName);
        folderInput.value = "";
      }),
    );
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
    SUPPORTED_SCHEMA_VERSIONS,
    MAIN_LIFECYCLES,
    OPTIONAL_LIFECYCLES,
    STATUS_REPORT_PATH,
    validateProject,
    normalizeProject,
    transitionKey,
    transitionTarget,
    latestTransition,
    summarizeGates,
    warningBannerText,
    buildBoardModel,
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
