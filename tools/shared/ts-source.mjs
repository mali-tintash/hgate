import { createRequire } from "node:module";
import path from "node:path";

const TEST_BASES = new Map([
  ["it", { kind: "test" }],
  ["test", { kind: "test" }],
  ["xit", { kind: "test", inactive: true }],
  ["xtest", { kind: "test", inactive: true }],
  ["fit", { kind: "test", focused: true }],
  ["describe", { kind: "describe" }],
  ["xdescribe", { kind: "describe", inactive: true }],
  ["fdescribe", { kind: "describe", focused: true }],
]);
const INACTIVE_MODIFIERS = new Set(["skip", "todo"]);

export function loadTypeScript(root) {
  const projectRoot = path.resolve(root ?? ".");
  const projectRequire = createRequire(path.join(projectRoot, "noop.cjs"));
  try {
    return projectRequire("typescript");
  } catch (error) {
    if (error?.code !== "MODULE_NOT_FOUND") {
      throw error;
    }
    throw new Error(
      `the "typescript" package could not be resolved from ${projectRoot}; ` +
        "install it in the adopting project (npm install --save-dev typescript)",
    );
  }
}

function dottedName(ts, expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const parent = dottedName(ts, expression.expression);
    return parent === null ? null : `${parent}.${expression.name.text}`;
  }
  if (
    ts.isNonNullExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  ) {
    return dottedName(ts, expression.expression);
  }
  return null;
}

function resolveCallee(ts, expression) {
  if (ts.isIdentifier(expression)) {
    return { base: expression.text, modifiers: [] };
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const inner = resolveCallee(ts, expression.expression);
    return (
      inner && {
        base: inner.base,
        modifiers: [...inner.modifiers, expression.name.text],
      }
    );
  }
  if (ts.isCallExpression(expression)) {
    return resolveCallee(ts, expression.expression);
  }
  if (ts.isTaggedTemplateExpression(expression)) {
    return resolveCallee(ts, expression.tag);
  }
  return null;
}

function collectCalls(ts, nodes) {
  const calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      calls.push({
        path: dottedName(ts, callee),
        member: ts.isPropertyAccessExpression(callee) ? callee.name.text : null,
      });
    }
    ts.forEachChild(node, visit);
  };
  nodes.forEach(visit);
  return calls;
}

function isFunctionLike(ts, node) {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

/**
 * Returns every Jest `it`/`test` call with a static title, in source order.
 * `active` is false when the test or any enclosing describe is skipped or
 * todo; `focused` is true when the test or any enclosing describe uses only.
 * `calls` lists the call expressions found in the test's arguments after the
 * title; `hasFunction` tells whether a callback body was supplied.
 */
export function parseTestCalls(ts, source, file) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const tests = [];

  const visit = (node, context) => {
    let childContext = context;
    if (ts.isCallExpression(node)) {
      const callee = resolveCallee(ts, node.expression);
      const base = callee && TEST_BASES.get(callee.base);
      if (base) {
        const inactive =
          base.inactive === true ||
          callee.modifiers.some((modifier) => INACTIVE_MODIFIERS.has(modifier));
        const focused =
          base.focused === true || callee.modifiers.includes("only");
        const active = context.active && !inactive;
        const nextContext = {
          active,
          focused: context.focused || focused,
        };
        if (base.kind === "test") {
          const [titleNode, ...rest] = node.arguments;
          if (
            titleNode &&
            (ts.isStringLiteral(titleNode) ||
              ts.isNoSubstitutionTemplateLiteral(titleNode))
          ) {
            tests.push({
              title: titleNode.text,
              line:
                sourceFile.getLineAndCharacterOfPosition(
                  node.getStart(sourceFile),
                ).line + 1,
              active,
              focused: nextContext.focused,
              hasFunction: rest.some((argument) => isFunctionLike(ts, argument)),
              calls: collectCalls(ts, rest),
            });
          }
        }
        childContext = nextContext;
      }
    }
    ts.forEachChild(node, (child) => visit(child, childContext));
  };

  visit(sourceFile, { active: true, focused: false });
  return tests;
}
