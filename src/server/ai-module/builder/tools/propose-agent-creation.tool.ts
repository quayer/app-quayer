/**
 * propose_agent_creation — Builder tool (Wave 1.2; Orayon Uplift card-action)
 *
 * Presents a confirmation card BEFORE actually creating an agent. Gives
 * the user an "Ajustar" escape hatch so they don't end up with an agent
 * named/configured wrong after a quick chat.
 *
 * Presentational only — it does NOT write to the database. The LLM calls this
 * right before it would otherwise call create_agent. In Jornada v2, the normal
 * path approves creation in the `agent_review` card; this tool remains as a
 * legacy/fallback inline proposal. Confirmation no longer
 * arrives as synthetic user text: the card's "Criar Agente" CTA submits the
 * `agent_approval` card, which flips the `agentApproved` sentinel in
 * `builderState` and seeds an authoritative card-action system note. The LLM
 * reacts to that confirmed state, never to free-form phrases.
 *
 * The proposed name/description are stamped on the result so the ACK turn that
 * follows the card submit has them available for create_agent.
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
        'Proposes creating a new agent by rendering a confirmation card with name + description + "Criar Agente" / "Ajustar" buttons. Call this ONCE to show the proposal, then stop. This is a presentational tool — it does NOT write to the database and does NOT create the agent. Confirmation arrives as deterministic state, not as user text: when the user taps "Criar Agente", the server flips the `agentApproved` sentinel in builderState and injects an authoritative card-action system note. Only when that confirmation is present should you call create_agent (with the same name/description). NEVER infer approval from chat phrases, and do NOT call propose_agent_creation again after it is confirmed.',
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
        // Stamp the proposal so the ACK turn (after the card submit flips
        // `agentApproved`) can reuse name/description for create_agent.
        return {
          success: true as const,
          proposedName: input.name,
          proposedDescription: input.description,
          message:
            'Card de aprovação exibido. Pare aqui e aguarde. A confirmação NÃO virá como texto do usuário: quando ele tocar "Criar Agente", o estado marca agentApproved e chega uma nota de sistema autoritativa. Só então chame create_agent com este nome/descrição. Não infira aprovação de frases do chat nem chame propose_agent_creation de novo após confirmado.',
        }
      },
    }),
  })
}
