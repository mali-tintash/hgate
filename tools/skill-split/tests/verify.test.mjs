import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { verifyAll, verifySkillSplit } from "../verify.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("split skills preserve every original line and heading and all links resolve", () => {
  assert.deepEqual(verifyAll(root), []);
});

test("verifier reports content missing from the split skill", () => {
  const errors = verifySkillSplit(root, "bc-review", "# Title\n\nA rule that no longer exists anywhere.\n");
  assert.ok(errors.some((e) => e.includes("lost line")));
});
