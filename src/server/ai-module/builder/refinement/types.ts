import type { ConversationBlueprint } from '../playbook/blueprint.schema'
import type {
  RefinementCheckSummary,
  RefinementMaterial,
  RefinementState,
} from '../cards/builder-state'

export interface RefinementScenario {
  id: string
  label: string
  userMessages: string[]
  expectedBehavior?: string
  tags: string[]
  expectsToolKey?: string
  expectsHandoff?: boolean
  kind?: string
  leadProfile?: string
  setup?: {
    knownVariables: Record<string, string>
    toolFailure?: {
      toolKey?: string
      capability: string
      message: string
    }
  }
  turns?: Array<{
    actor: 'lead' | 'tool'
    message: string
    toolKey?: string
    status?: 'failure'
  }>
  expectedBehaviors?: Array<{
    checkId: string
    severity: 'critical' | 'warning'
    statement: string
    blueprintPath?: string
  }>
  blueprintPaths?: string[]
}

export interface RefinementTranscriptTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface RefinementToolCall {
  toolName: string
  args?: unknown
  result?: unknown
}

export interface RefinementScenarioRun {
  scenario: RefinementScenario
  transcript: RefinementTranscriptTurn[]
  toolCalls: RefinementToolCall[]
  error?: string
}

export interface RefinementRunnerInput {
  projectId: string
  organizationId: string
  scenario: RefinementScenario
}

export type RefinementScenarioRunner = (
  input: RefinementRunnerInput,
) => Promise<RefinementScenarioRun>

export interface RefinementAuditorInput {
  blueprint: ConversationBlueprint
  runs: RefinementScenarioRun[]
}

export type RefinementAuditor = (
  input: RefinementAuditorInput,
) => RefinementCheckSummary[]

export interface RunRefinementInput {
  projectId: string
  organizationId: string
  blueprint: ConversationBlueprint
  scenarios: RefinementScenario[]
  runner: RefinementScenarioRunner
  auditors: RefinementAuditor[]
  runId?: string
  material?: RefinementMaterial
  now?: () => Date
}

export interface RunRefinementOutput {
  state: RefinementState
  runs: RefinementScenarioRun[]
}
