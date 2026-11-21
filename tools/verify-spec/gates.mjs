// Gate validation for verify-spec. The catalog parsing and Validity Rule
// evaluation live in tools/shared/gate-rules.mjs so the projection generator
// reports the same gate status; this module keeps verify-spec's import path.
export {
  GATE_CODES,
  LIFECYCLE_STATES,
  catalogMatches,
  checkGates,
  parseGateCatalog,
} from "../shared/gate-rules.mjs";
