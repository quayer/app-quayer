/**
 * department-dispatch — barrel
 *
 * Round-robin (roleta) distribution of conversations to department members,
 * and the dispatch_to_agent builtin tool helper.
 *
 * Wiring (done by the owner of builtin-tools.ts):
 *   1. import { createDispatchToAgentTool } from './department-dispatch'
 *   2. spread `dispatch_to_agent: createDispatchToAgentTool(ctx)` into
 *      createBuiltinTools()'s return object.
 *   3. add 'dispatch_to_agent' to BUILTIN_TOOL_NAMES.
 */

export {
  createDispatchToAgentTool,
  executeDispatchToAgent,
  dispatchToAgentInputSchema,
} from './dispatch-to-agent'
export type {
  DispatchToAgentInput,
  DispatchToAgentResult,
} from './dispatch-to-agent'

export {
  selectNextMember,
  loadActivePool,
  pickNextInOrder,
} from './round-robin.service'
export type {
  RouletteCandidate,
  SelectMemberResult,
} from './round-robin.service'
