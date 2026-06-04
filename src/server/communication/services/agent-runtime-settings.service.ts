import { database } from '@/server/services/database'
import {
  getAgentRuntimeSettingsFromMetadata,
  normalizeAgentRuntimeSettings,
  type AgentRuntimeSettings,
} from '@/lib/agent-runtime-settings'

export async function loadAgentRuntimeSettingsForAgent(
  agentConfigId: string | null | undefined,
  organizationId: string,
): Promise<AgentRuntimeSettings> {
  if (!agentConfigId) {
    return normalizeAgentRuntimeSettings(null)
  }

  try {
    const builderProject = (database as unknown as {
      builderProject?: {
        findFirst?: (args: unknown) => Promise<{
          metadata: unknown
          aiAgent: {
            enableTTS?: boolean | null
            ttsProvider?: string | null
            ttsVoiceId?: string | null
            ttsModel?: string | null
            ttsSpeechRate?: number | null
          } | null
        } | null>
      }
    }).builderProject

    if (!builderProject?.findFirst) {
      return normalizeAgentRuntimeSettings(null)
    }

    const project = await builderProject.findFirst({
      where: {
        aiAgentId: agentConfigId,
        organizationId,
      },
      select: {
        metadata: true,
        aiAgent: {
          select: {
            enableTTS: true,
            ttsProvider: true,
            ttsVoiceId: true,
            ttsModel: true,
            ttsSpeechRate: true,
          },
        },
      },
    })

    return normalizeAgentRuntimeSettings(
      getAgentRuntimeSettingsFromMetadata(project?.metadata),
      project?.aiAgent,
    )
  } catch (err) {
    console.warn(
      '[agent-runtime-settings] failed to load settings, using defaults:',
      err instanceof Error ? err.message : String(err),
    )
    return normalizeAgentRuntimeSettings(null)
  }
}
