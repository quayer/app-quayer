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
        'Proposes creating a new agent by rendering a confirmation card with name + description + "Criar Agente" / "Ajustar" buttons. Call this ONCE to show the proposal. This is a presentational tool — it does NOT write to the database. IMPORTANT: After the user sends any confirmation (e.g., "Pode criar, tá bom assim. 👍", "Pode criar", "Criar agente", "Cria", "Ok", "Sim", "Vai"), call create_agent IMMEDIATELY. Do NOT call propose_agent_creation again after confirmation.',
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
          message:
            'Card de aprovação exibido. AGUARDE a próxima mensagem do usuário. Se o usuário confirmar (qualquer mensagem positiva como "Pode criar", "tá bom assim", "Criar agente", "Sim", "Ok", "Vai"), chame create_agent IMEDIATAMENTE com o nome e prompt já gerados. NÃO chame propose_agent_creation novamente.',
        }
      },
    }),
  })
}
