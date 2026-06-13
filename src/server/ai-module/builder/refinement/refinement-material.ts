import { createHash } from 'node:crypto'
import type {
  BuilderState,
  RefinementMaterial,
} from '../cards/builder-state'
import type { ConversationBlueprint } from '../playbook/blueprint.schema'

export interface PromptMaterialSnapshot {
  id?: string
  versionNumber?: number
  content?: string | null
}

export interface BuildRefinementMaterialInput {
  state: BuilderState
  blueprint: ConversationBlueprint
  promptVersion?: PromptMaterialSnapshot | null
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

function contextForRefinement(state: BuilderState): unknown {
  return {
    project: state.project,
    proposal: state.proposal,
    selectedCapabilityKeys: state.selectedCapabilityKeys,
    selectedToolKeys: state.selectedToolKeys,
    selectedChannelKey: state.selectedChannelKey,
    persona: state.persona,
    services: state.services,
    hours: state.hours,
    pricing: state.pricing,
    handoff: state.handoff,
    calendar: state.calendar,
    activation: state.activation,
    sourceIngestion: state.sourceIngestion,
    integration: state.integration,
    identity: state.identity,
    channel: state.channel,
  }
}

export function buildRefinementMaterial({
  state,
  blueprint,
  promptVersion,
}: BuildRefinementMaterialInput): RefinementMaterial {
  return {
    ...(promptVersion?.id ? { promptVersionId: promptVersion.id } : {}),
    ...(typeof promptVersion?.versionNumber === 'number'
      ? { promptVersionNumber: promptVersion.versionNumber }
      : {}),
    ...(typeof promptVersion?.content === 'string'
      ? { promptHash: sha256(promptVersion.content) }
      : {}),
    blueprintHash: sha256(blueprint),
    contextHash: sha256(contextForRefinement(state)),
  }
}
