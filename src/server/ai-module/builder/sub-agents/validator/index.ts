/**
 * Barrel — Validator Sub-Agent
 *
 * Re-exports the sub-agent, its Zod input schema, and the derived input
 * type. The coordinator wires these into the top-level `sub-agents/index.ts`
 * barrel in a later pass — do not add exports there from this file.
 */

export {
  validatorSubAgent,
  validatorInputSchema,
  type ValidatorInput,
} from './validator.sub-agent'
