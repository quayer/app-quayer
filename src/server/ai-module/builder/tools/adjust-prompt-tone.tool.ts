/**
 * adjust_prompt_tone — Builder tool (Wave 1.5)
 *
 * Presentational: renders a 4-slider card so the user can dial in the
 * tone of an agent prompt with numerical precision instead of fuzzy
 * text ("mais amigável"). Does NOT mutate — the card's Apply button
 * posts a user message that triggers update_agent_prompt.
 *
 * The four axes are opinionated, tuned for the kind of agents Quayer
 * users typically build (SMB support/sales on WhatsApp):
 *   - formality  (0 = casual conversa de bar, 1 = formal corporativo)
 *   - energy     (0 = calmo/neutro,          1 = empolgado/entusiasmado)
 *   - emoji      (0 = nenhum emoji,          1 = muitos emojis)
 *   - verbosity  (0 = direto/breve,          1 = detalhado/explicativo)
 */

import { tool } from 'ai'
import { z } from 'zod'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'
import {
  resolveProjectAgent,
  OPTIONAL_AGENT_ID_DESCRIPTION,
} from './resolve-project-agent'

export function adjustPromptToneTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'adjust_prompt_tone',
    metadata: { isReadOnly: true, isConcurrencySafe: true },
    tool: tool({
      description:
        'Renders a tone-adjustment slider card (formality / energy / emoji / verbosity, each 0-1) so the user can fine-tune the agent prompt numerically. The agent is resolved automatically from the active project — do NOT provide agentId. Does NOT mutate. After the user clicks Apply, the chat receives a message with the chosen values — at that point call update_agent_prompt to rewrite the system prompt reflecting those knobs.',
      inputSchema: z.object({
        agentId: z
          .string()
          .uuid()
          .optional()
          .describe(OPTIONAL_AGENT_ID_DESCRIPTION),
        currentTone: z
          .object({
            formality: z.number().min(0).max(1).optional(),
            energy: z.number().min(0).max(1).optional(),
            emoji: z.number().min(0).max(1).optional(),
            verbosity: z.number().min(0).max(1).optional(),
          })
          .optional()
          .describe(
            'Optional best-guess of current tone. Used as the slider starting point. Defaults to 0.5 on all axes when absent.',
          ),
      }),
      execute: async (input) => {
        // Resolve the REAL agent from the active project (LLM-provided ids
        // are ignored when divergent — they tend to be hallucinated).
        const resolved = await resolveProjectAgent(ctx, input.agentId)
        if (!resolved.ok) {
          return { success: false as const, message: resolved.message }
        }
        return {
          success: true as const,
          agentId: resolved.agentId,
          initialTone: {
            formality: input.currentTone?.formality ?? 0.5,
            energy: input.currentTone?.energy ?? 0.5,
            emoji: input.currentTone?.emoji ?? 0.5,
            verbosity: input.currentTone?.verbosity ?? 0.5,
          },
          message:
            'Aguardando o usuário ajustar sliders e clicar em Aplicar.',
        }
      },
    }),
  })
}
