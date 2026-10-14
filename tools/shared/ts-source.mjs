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

function callRecord(ts, node, tautology = false) {
  const callee = node.expression;
  return {
    path: dottedName(ts, callee),
    member: ts.isPropertyAccessExpression(callee) ? callee.name.text : null,
    tautology,
  };
}

function collectCalls(ts, nodes) {
  const calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      calls.push(callRecord(ts, node));
    }
    ts.forEachChild(node, visit);
  };
  nodes.forEach(visit);
  return calls;
}

// Callbacks passed to these calls are treated as invoked. Anything else
// (mock implementations, event handlers, timers) is assumed never to fire.
const INVOKER_MEMBERS = new Set([
  "forEach", "map", "filter", "some", "every", "find", "findIndex",
  "findLast", "findLastIndex", "reduce", "reduceRight", "flatMap",
  "then", "catch", "finally",
]);
const INVOKER_FUNCTIONS = new Set([
  "waitFor", "act", "fc.property", "fc.asyncProperty", "fc.assert",
  "fastCheck.property", "fastCheck.asyncProperty", "fastCheck.assert",
  "hgateProperty", "hgateFiniteModel", "exploreFiniteModel",
]);
const EQUALITY_MATCHERS = new Set(["toBe", "toEqual", "toStrictEqual"]);

function isCallable(ts, node) {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node)
  );
}

function unwrap(ts, node) {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAsExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

// Returns true/false when the expression is a compile-time constant, else null.
function constantTruthiness(ts, expression) {
  const node = unwrap(ts, expression);
  switch (node.kind) {
    case ts.SyntaxKind.TrueKeyword:
      return true;
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
      return false;
    case ts.SyntaxKind.NumericLiteral:
      return Number(node.text) !== 0;
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return node.text.length > 0;
    case ts.SyntaxKind.ArrayLiteralExpression:
    case ts.SyntaxKind.ObjectLiteralExpression:
      return true;
    default:
  }
  if (ts.isIdentifier(node) && node.text === "undefined") {
    return false;
  }
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.ExclamationToken
  ) {
    const inner = constantTruthiness(ts, node.operand);
    return inner === null ? null : !inner;
  }
  return null;
}

function literalValue(ts, expression) {
  const node = unwrap(ts, expression);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return { value: -Number(node.operand.text) };
  }
  if (ts.isNumericLiteral(node)) return { value: Number(node.text) };
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { value: node.text };
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return { value: true };
  if (node.kind === ts.SyntaxKind.FalseKeyword) return { value: false };
  if (node.kind === ts.SyntaxKind.NullKeyword) return { value: null };
  if (ts.isIdentifier(node) && node.text === "undefined") {
    return { value: undefined };
  }
  return null;
}

function referenceText(ts, expression) {
  const node = unwrap(ts, expression);
  if (ts.isIdentifier(node)) return node.text;
  if (node.kind === ts.SyntaxKind.ThisKeyword) return "this";
  if (ts.isPropertyAccessExpression(node)) {
    const parent = referenceText(ts, node.expression);
    return parent === null ? null : `${parent}.${node.name.text}`;
  }
  return null;
}

// Finds the expect(...) call at the root of a matcher chain such as
// expect(a).not.toBe(b). Chains using .not/.resolves/.rejects are skipped.
function expectRoot(ts, matcherCall) {
  let node = matcherCall.expression;
  if (!ts.isPropertyAccessExpression(node)) return null;
  node = node.expression;
  while (ts.isPropertyAccessExpression(node)) {
    if (["not", "resolves", "rejects"].includes(node.name.text)) return null;
    node = node.expression;
  }
  node = unwrap(ts, node);
  return ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "expect"
    ? node
    : null;
}

// An expect(...) call that can never fail: literal-vs-same-literal, identical
// pure operands, or a truthiness matcher applied to a literal.
function tautologicalExpect(ts, matcherCall) {
  const root = expectRoot(ts, matcherCall);
  if (!root || root.arguments.length !== 1) return null;
  const matcher = matcherCall.expression.name.text;
  const actual = root.arguments[0];
  const actualLiteral = literalValue(ts, actual);

  if (EQUALITY_MATCHERS.has(matcher) && matcherCall.arguments.length === 1) {
    const expected = matcherCall.arguments[0];
    const expectedLiteral = literalValue(ts, expected);
    if (
      actualLiteral &&
      expectedLiteral &&
      Object.is(actualLiteral.value, expectedLiteral.value)
    ) {
      return root;
    }
    const left = referenceText(ts, actual);
    return left !== null && left === referenceText(ts, expected) ? root : null;
  }
  if (!actualLiteral) return null;
  const { value } = actualLiteral;
  const tautology =
    (matcher === "toBeTruthy" && Boolean(value)) ||
    (matcher === "toBeFalsy" && !value) ||
    (matcher === "toBeNull" && value === null) ||
    (matcher === "toBeUndefined" && value === undefined) ||
    (matcher === "toBeDefined" && value !== undefined);
  return tautology ? root : null;
}

/**
 * Collects the call expressions that are on a statically reachable path of a
 * test's arguments. Skipped: constant-false branches, code after
 * return/throw/break/continue, `for (x of [])` bodies, callbacks that are not
 * immediately invoked or passed to a known invoker, and local helpers that are
 * never called. Calls to same-file helpers are followed into their bodies.
 */
function collectReachableCalls(ts, argumentNodes, helpers) {
  const calls = [];
  const followed = new Set();
  const tautologicalRoots = new Set();

  const followHelper = (identifier) => {
    const helper = ts.isIdentifier(identifier) && helpers.get(identifier.text);
    if (helper && !followed.has(helper)) {
      followed.add(helper);
      walkFunction(helper);
    }
  };

  const walkFunction = (fn) => {
    if (fn.body === undefined) return;
    if (ts.isBlock(fn.body)) {
      walkStatements(fn.body.statements);
    } else {
      walkExpression(fn.body);
    }
  };

  const isInvoker = (callee) => {
    const name = dottedName(ts, callee);
    return (
      (name !== null && INVOKER_FUNCTIONS.has(name)) ||
      (ts.isPropertyAccessExpression(callee) &&
        INVOKER_MEMBERS.has(callee.name.text))
    );
  };

  const walkCall = (node) => {
    const taut = tautologicalExpect(ts, node);
    if (taut) tautologicalRoots.add(taut);
    calls.push(callRecord(ts, node, Boolean(taut) || tautologicalRoots.has(node)));

    const callee = unwrap(ts, node.expression);
    if (isCallable(ts, callee)) {
      walkFunction(callee);
    } else {
      walkExpression(callee);
      followHelper(callee);
    }
    const invokes = isInvoker(node.expression);
    for (const argument of node.arguments) {
      if (invokes && isCallable(ts, unwrap(ts, argument))) {
        walkFunction(unwrap(ts, argument));
      } else if (invokes) {
        followHelper(argument);
      }
      walkExpression(argument);
    }
  };

  function walkExpression(node) {
    if (
      isCallable(ts, node) ||
      ts.isMethodDeclaration(node) ||
      ts.isClassLike(node) ||
      ts.isGetAccessor(node) ||
      ts.isSetAccessor(node)
    ) {
      return;
    }
    if (ts.isCallExpression(node)) {
      walkCall(node);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      walkExpression(node.condition);
      const constant = constantTruthiness(ts, node.condition);
      if (constant !== false) walkExpression(node.whenTrue);
      if (constant !== true) walkExpression(node.whenFalse);
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(
        node.operatorToken.kind,
      )
    ) {
      walkExpression(node.left);
      const constant = constantTruthiness(ts, node.left);
      const isAnd = node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken;
      if (isAnd ? constant !== false : constant !== true) {
        walkExpression(node.right);
      }
      return;
    }
    ts.forEachChild(node, walkExpression);
  }

  // Returns false when control cannot continue past the statement.
  function walkStatement(node) {
    if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) {
      if (node.expression) walkExpression(node.expression);
      return false;
    }
    if (ts.isBreakStatement(node) || ts.isContinueStatement(node)) {
      return false;
    }
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
      return true;
    }
    if (ts.isBlock(node)) {
      return walkStatements(node.statements);
    }
    if (ts.isIfStatement(node)) {
      walkExpression(node.expression);
      const constant = constantTruthiness(ts, node.expression);
      const thenCompletes = constant === false ? false : walkStatement(node.thenStatement);
      const elseCompletes =
        constant === true
          ? false
          : node.elseStatement
            ? walkStatement(node.elseStatement)
            : true;
      return thenCompletes || elseCompletes;
    }
    if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
      walkExpression(node.expression);
      if (ts.isDoStatement(node) || constantTruthiness(ts, node.expression) !== false) {
        walkStatement(node.statement);
      }
      return true;
    }
    if (ts.isForStatement(node)) {
      for (const part of [node.initializer, node.condition, node.incrementor]) {
        if (part) walkExpression(part);
      }
      const never = node.condition && constantTruthiness(ts, node.condition) === false;
      if (!never) walkStatement(node.statement);
      return true;
    }
    if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      walkExpression(node.expression);
      const empty =
        ts.isArrayLiteralExpression(unwrap(ts, node.expression)) &&
        unwrap(ts, node.expression).elements.length === 0;
      if (!empty) walkStatement(node.statement);
      return true;
    }
    if (ts.isTryStatement(node)) {
      const tryCompletes = walkStatement(node.tryBlock);
      const catchCompletes = node.catchClause
        ? walkStatement(node.catchClause.block)
        : false;
      const finallyCompletes = node.finallyBlock
        ? walkStatement(node.finallyBlock)
        : true;
      return (tryCompletes || catchCompletes) && finallyCompletes;
    }
    if (ts.isSwitchStatement(node)) {
      walkExpression(node.expression);
      for (const clause of node.caseBlock.clauses) {
        walkStatements(clause.statements);
      }
      return true;
    }
    if (ts.isLabeledStatement(node)) {
      return walkStatement(node.statement);
    }
    ts.forEachChild(node, walkExpression);
    return true;
  }

  function walkStatements(statements) {
    for (const statement of statements) {
      if (!walkStatement(statement)) return false;
    }
    return true;
  }

  for (const argument of argumentNodes) {
    if (isCallable(ts, argument)) {
      walkFunction(argument);
    } else {
      walkExpression(argument);
    }
  }
  return calls;
}

function collectHelpers(ts, sourceFile) {
  const helpers = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && !helpers.has(node.name.text)) {
      helpers.set(node.name.text, node);
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isCallable(ts, unwrap(ts, node.initializer)) &&
      !helpers.has(node.name.text)
    ) {
      helpers.set(node.name.text, unwrap(ts, node.initializer));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return helpers;
}

function isFunctionLike(ts, node) {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

/**
 * Returns every Jest `it`/`test` call with a static title, in source order.
 * `active` is false when the test or any enclosing describe is skipped or
 * todo; `focused` is true when the test or any enclosing describe uses only.
 * `calls` lists the statically reachable call expressions in the test's
 * arguments after the title (see collectReachableCalls); `allCalls` lists every
 * call expression syntactically; `hasFunction` tells whether a callback body
 * was supplied. This is static analysis: callbacks that never fire at runtime
 * cannot be decided in general.
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
  const helpers = collectHelpers(ts, sourceFile);

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
              calls: collectReachableCalls(ts, rest, helpers),
              allCalls: collectCalls(ts, rest),
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
