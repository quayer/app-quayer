import { runFaithfulPreview } from '../services/faithful-preview.service'
import type {
  RefinementScenarioRun,
  RefinementScenarioRunner,
  RefinementToolCall,
  RefinementTranscriptTurn,
} from './types'

function toolCallsFromNames(names: readonly string[]): RefinementToolCall[] {
  return names.map((toolName) => ({ toolName }))
}

export const runRefinementConversation: RefinementScenarioRunner = async ({
  projectId,
  organizationId,
  scenario,
}): Promise<RefinementScenarioRun> => {
  const transcript: RefinementTranscriptTurn[] = []
  const toolCalls: RefinementToolCall[] = []

  try {
    for (const userMessage of scenario.userMessages) {
      const history = transcript.map((turn) => ({
        role: turn.role,
        content: turn.content,
      }))
      const preview = await runFaithfulPreview({
        projectId,
        organizationId,
        messages: [...history, { role: 'user', content: userMessage }],
      })

      transcript.push({ role: 'user', content: userMessage })
      transcript.push({ role: 'assistant', content: preview.reply })
      toolCalls.push(...toolCallsFromNames(preview.toolCalls))
    }

    return { scenario, transcript, toolCalls }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Falha ao executar cenário.'
    return { scenario, transcript, toolCalls, error: message }
  }
}
