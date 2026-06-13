import { z } from 'zod'
import { runLLMSubAgent } from '../base'
import type { SubAgent, SubAgentContext, SubAgentResult } from '../types'
import type { ConversationBlueprint } from '../../playbook/blueprint.schema'
import {
  blueprintHasBlockingIssues,
  normalizeConversationBlueprint,
  validateConversationBlueprint,
} from '../../playbook/blueprint-helpers'
import { buildNicheBlueprintFixture } from '../../playbook/niche-blueprint-fixtures'
import {
  PLAYBOOK_DESIGNER_SYSTEM,
  buildPlaybookDesignerUserMessage,
} from './playbook-designer.prompt'

export const playbookDesignerInputSchema = z.object({
  objective: z.string().min(10).max(500),
  niche: z.string().min(2).max(200),
  businessContext: z.array(z.string().min(1).max(600)).max(20).default([]),
  capabilities: z.array(z.string().min(1).max(160)).max(30).default([]),
  knownServices: z.array(z.string().min(1).max(200)).max(50).default([]),
  knownLimits: z.array(z.string().min(1).max(300)).max(30).default([]),
})

export type PlaybookDesignerInput = z.infer<typeof playbookDesignerInputSchema>

export interface PlaybookDesignerOutput {
  blueprint: ConversationBlueprint
  source: 'llm' | 'fixture'
  warnings: string[]
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim()
  const fence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)
  if (fence) return fence[1].trim()
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
}

function parseBlueprintJson(raw: string): ConversationBlueprint | null {
  try {
    return normalizeConversationBlueprint(JSON.parse(stripJsonFences(raw)))
  } catch {
    return null
  }
}

function fallbackOutput(
  input: PlaybookDesignerInput,
  warnings: string[],
): PlaybookDesignerOutput {
  return {
    blueprint: buildNicheBlueprintFixture({
      objective: input.objective,
      niche: input.niche,
    }),
    source: 'fixture',
    warnings,
  }
}

export const playbookDesignerSubAgent: SubAgent<
  PlaybookDesignerInput,
  PlaybookDesignerOutput
> = {
  metadata: {
    name: 'playbook-designer',
    isReadOnly: true,
    isConcurrencySafe: false,
    timeoutMs: 35_000,
  },

  async run(
    input: PlaybookDesignerInput,
    context: SubAgentContext,
  ): Promise<SubAgentResult<PlaybookDesignerOutput>> {
    const started = Date.now()
    const parsed = playbookDesignerInputSchema.safeParse(input)
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return {
        success: false,
        error: `Invalid input: ${issues}`,
        code: 'INVALID_INPUT',
        durationMs: Date.now() - started,
      }
    }

    const validInput = parsed.data
    const llm = await runLLMSubAgent(
      {
        systemPrompt: PLAYBOOK_DESIGNER_SYSTEM,
        userMessage: buildPlaybookDesignerUserMessage(validInput),
        temperature: 0.25,
        maxOutputTokens: 2200,
        timeoutMs: 35_000,
      },
      context,
    )

    if (!llm.success) {
      return {
        success: true,
        data: fallbackOutput(validInput, [
          `Fallback por fixture: ${llm.code ?? 'LLM_ERROR'}`,
        ]),
        durationMs: Date.now() - started,
      }
    }

    const blueprint = parseBlueprintJson(llm.data.text)
    if (!blueprint) {
      return {
        success: true,
        data: fallbackOutput(validInput, [
          'Fallback por fixture: resposta do playbook-designer não era JSON válido.',
        ]),
        durationMs: Date.now() - started,
      }
    }

    const issues = validateConversationBlueprint(blueprint)
    if (blueprintHasBlockingIssues(issues)) {
      return {
        success: true,
        data: fallbackOutput(
          validInput,
          issues.map((issue) => issue.message),
        ),
        durationMs: Date.now() - started,
      }
    }

    return {
      success: true,
      data: {
        blueprint: { ...blueprint, status: 'proposed' },
        source: 'llm',
        warnings: issues.map((issue) => issue.message),
      },
      durationMs: Date.now() - started,
    }
  },
}
