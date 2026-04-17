/**
 * propose_agent_creation — Builder tool (Wave 1.2)
 *
 * Presents a confirmation card BEFORE actually creating an agent. Gives
 * the user an "Ajustar" escape hatch so they don't end up with an agent
 * named/configured wrong after a quick chat.
 *
 * The LLM should call this right before it would otherwise call
 * create_agent. The card's CTA posts a follow-up user message:
 *   - "Criar Agente" → "Pode criar, tá bom assim." (triggers create_agent)
 *   - "Ajustar"       → "Quero ajustar antes — ..." (free-form edit loop)
 */

import { tool } from 'ai'
import { z } from 'zod'
import { buildBuilderTool } from './build-tool'

export interface BuilderToolExecutionContext {
  projectId: string
  organizationId: string
  userId: string
}

export function proposeAgentCreationTool(_ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'propose_agent_creation',
    metadata: { isReadOnly: true, isConcurrencySafe: false },
    tool: tool({
      description:
        'Proposes creating a new agent and waits for user confirmation before actually calling create_agent. Use this to render a confirmation card with name + short description + Confirm/Adjust buttons. This is a presentational tool — it does NOT write to the database. Only call create_agent after the user confirms via the card.',
      inputSchema: z.object({
        name: z
          .string()
          .min(3)
          .max(60)
          .describe('Proposed agent display name'),
        description: z
          .string()
          .min(20)
          .max(500)
          .describe(
            'One-paragraph plain-language summary of what the agent will do. Shown to the user in the card.',
          ),
      }),
      execute: async (input) => {
        return {
          success: true as const,
          proposedName: input.name,
          proposedDescription: input.description,
          message: 'Aguardando confirmação do usuário na ApprovalCard.',
        }
      },
    }),
  })
}
