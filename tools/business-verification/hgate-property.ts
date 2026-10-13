import { appendFileSync } from "node:fs";
import * as fc from "fast-check";

import {
  exploreFiniteModel,
  type FiniteModelOptions,
  type FiniteModelResult,
} from "./finite-model-explorer";

/**
 * Environment variable naming the JSONL file that receives one execution
 * evidence record per successful property run. Pass the same file to
 * `verify.mjs --evidence`.
 */
export const HGATE_EVIDENCE_ENV = "HGATE_PROPERTY_EVIDENCE";

const DEFAULT_NUM_RUNS = 100;

function record(entry: Record<string, string | number>): void {
  const target = process.env[HGATE_EVIDENCE_ENV];
  if (target) {
    appendFileSync(target, `${JSON.stringify(entry)}\n`, "utf8");
  }
}

/**
 * Runs a fast-check property for the given `[PROP:<id>]` and records the
 * effective `numRuns` and `seed` once it passes. A failing property throws and
 * records nothing. The seed is always explicit so every run is replayable.
 */
export function hgateProperty<Ts>(
  id: string,
  property: fc.IRawProperty<Ts>,
  params: fc.Parameters<Ts> = {},
): void | Promise<void> {
  const numRuns = params.numRuns ?? DEFAULT_NUM_RUNS;
  const seed = params.seed ?? Math.floor(Math.random() * 0x7fffffff);
  const outcome = fc.assert(property, { ...params, numRuns, seed });
  const evidence = { id, technique: "PROPERTY", numRuns, seed };

  if (outcome instanceof Promise) {
    return outcome.then(() => record(evidence));
  }
  record(evidence);
}

/**
 * Exhaustively explores a finite model for the given `[PROP:<id>]` and records
 * the exploration size once no invariant is falsified.
 */
export function hgateFiniteModel<State>(
  id: string,
  options: FiniteModelOptions<State>,
): FiniteModelResult {
  const result = exploreFiniteModel(options);
  record({
    id,
    technique: "FINITE_MODEL",
    statesVisited: result.statesVisited,
    transitionsExplored: result.transitionsExplored,
    maxDepthReached: result.maxDepthReached,
  });
  return result;
}
