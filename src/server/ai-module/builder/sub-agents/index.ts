/**
 * Quayer Builder — Sub-Agent Barrel
 *
 * Central export point for the sub-agent contract and every concrete
 * sub-agent. Consumers (tools, tests, the wiring layer) import from this
 * barrel rather than deep paths.
 */

export type {
  SubAgent,
  SubAgentContext,
  SubAgentMetadata,
  SubAgentResult,
  SubAgentInput,
  SubAgentOutput,
  SubAgentFromSchema,
} from './types'

export {
  runLLMSubAgent,
  measure,
  type RunLLMSubAgentParams,
  type RunLLMSubAgentSuccess,
} from './base'

// Concrete sub-agents (Phase C wiring)
export {
  validatorSubAgent,
  validatorInputSchema,
  type ValidatorInput,
} from './validator'

export {
  promptWriterSubAgent,
  promptWriterInputSchema,
  parsePromptSections,
  type PromptWriterInput,
  type PromptWriterOutput,
  type PromptWriterSections,
} from './prompt-writer'

export {
  nicheResearcherSubAgent,
  nicheResearcherInputSchema,
  type NicheResearcherInput,
  type NicheInsights,
  type NicheInsightsSource,
} from './niche-researcher'

export {
  deployRunnerSubAgent,
  deployRunnerInputSchema,
  type DeployRunnerInput,
  type DeployRunnerOutput,
  type DeployRunnerBlocker,
  type DeployRunnerBlockerCheck,
  type DeployRunnerFailedStep,
} from './deploy-runner'
