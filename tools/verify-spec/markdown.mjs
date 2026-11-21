export function stripMarkup(value) {
  return value.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();
}

export function toKebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

export function extractClassNames(source) {
  return [...source.matchAll(/\bclass\s+([A-Za-z_]\w*)/g)].map((m) => m[1]);
}

// Section and table parsing lives in tools/shared/markdown.mjs.
export { parseTable, splitSections } from "../shared/markdown.mjs";
