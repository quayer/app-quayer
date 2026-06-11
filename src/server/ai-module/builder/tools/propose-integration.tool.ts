/**
 * Builder Tool — propose_integration (Integration Builder Wave 2, T22, FR-11)
 *
 * The meta-agent's "I'll connect your agent to <platform>" tool. In W2 it walks
 * the TEMPLATE path ONLY: it resolves a catalog template (by explicit slug or by
 * matching the free-text platform name), writes a transparency-first PROPOSAL
 * into `builderState.integration.proposed` (race-safe via `patchIntegrationStateAtomic`,
 * T21), and returns a result that carries the `integration_proposal` card key so
 * the chat renders the Confirmar / Agora não approval card. The handler that
 * actually creates the draft + AgentTool fires only on the card submit (T24) —
 * this tool NEVER mutates integrations and NEVER touches credential values.
 *
 * APPROVAL IDIOM (build-tool.ts §requiresApproval): the proposal is presentational
 * — the user gate is the card, not the tool. We follow the same shape as the
 * legacy inline-card tools (`propose_agent_creation`, `select_channel`): no DB
 * write of a confirmation, a result that stamps the card key + the data the card
 * renders, and a `message` instructing the LLM to STOP and await the card submit.
 *
 * 🚨 NFR-03 TRANSPARENCY (load-bearing): the proposal declares, in leiga pt-BR,
 * WHICH data leaves the conversation. `whatDataSent` is DERIVED from the template's
 * `parameterMapping` (the lead fields the agent sends) so the user sees exactly
 * what is shared before approving. Credential VALUES are never part of any of this.
 *
 * W3 (T30): the investigator path (unknown platforms → web research → drafted
 * proposal with cited sources) is NOT in this wave. The clearly-marked seam below
 * is where that branch lands; W2 falls back to proposing the generic-webhook
 * template so the flow still completes.
 *
 * Zero `any`.
 */

import { tool } from 'ai'
import { z } from 'zod'

import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './list-instances.tool'
import {
  getIntegrationTemplate,
  listIntegrationTemplates,
} from '../integrations/templates'
import type { IntegrationTemplate } from '../integrations/templates/integration-template.types'
import { patchIntegrationStateAtomic } from '../integrations/integration-state-db'
import type { IntegrationProposalPatch } from '../integrations/integration-state-db'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Card key the result carries so the chat dispatcher renders the proposal card. */
const INTEGRATION_PROPOSAL_CARD_KEY = 'integration_proposal' as const

/** W2 fallback when no catalog template matches the user's free-text platform. */
const FALLBACK_TEMPLATE_SLUG = 'generic-webhook'

// ---------------------------------------------------------------------------
// Helpers — template resolution + transparency text (pure, no IO)
// ---------------------------------------------------------------------------

/**
 * Resolve a catalog template for a free-text platform name: case-insensitive
 * substring match against each template's `slug` or `displayName`. Returns the
 * first match in offer order, or `null` when nothing matches. (No fuzzy scoring
 * in W2 — the unknown-platform case is the investigator's job, see the W3 seam.)
 */
function matchTemplateByPlatform(platform: string): IntegrationTemplate | null {
  const needle = platform.trim().toLowerCase()
  if (!needle) return null
  for (const template of listIntegrationTemplates()) {
    const slug = template.slug.toLowerCase()
    const displayName = template.displayName.toLowerCase()
    if (
      slug.includes(needle) ||
      needle.includes(slug) ||
      displayName.includes(needle) ||
      needle.includes(displayName)
    ) {
      return template
    }
  }
  return null
}

/**
 * Build the leiga pt-BR transparency sentence (NFR-03): exactly WHICH data the
 * integration sends, derived from the template's `parameterMapping` (the lead
 * fields the agent fills) — the user reads this BEFORE approving. We never name
 * credential VALUES here; `credentialFields` only inform the activation step, not
 * what is sent on each lead.
 */
function buildWhatDataSent(template: IntegrationTemplate): string {
  const params = template.requestSpec.parameterMapping ?? []
  const fieldNames = params.map((p) => p.name)
  if (fieldNames.length === 0) {
    // Defensive: a template with no declared params still sends *something*; be
    // honest rather than implying nothing leaves the conversation.
    return `Envia os dados coletados na conversa para o ${template.displayName}.`
  }
  const list =
    fieldNames.length === 1
      ? fieldNames[0]
      : `${fieldNames.slice(0, -1).join(', ')} e ${fieldNames[fieldNames.length - 1]}`
  return `Envia para o ${template.displayName} os seguintes dados do lead coletados na conversa: ${list}. Nenhuma credencial sua é enviada ao lead — ela fica guardada com segurança e só é usada para autenticar a chamada.`
}

/** Assemble the proposal metadata persisted to `builderState.integration.proposed`. */
function buildProposal(template: IntegrationTemplate): IntegrationProposalPatch {
  return {
    platform: template.displayName,
    templateSlug: template.slug,
    triggerDescription: template.triggerDescription,
    whatDataSent: buildWhatDataSent(template),
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function proposeIntegrationTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'propose_integration',
    // Presentational: the user gate is the card, not the tool. We DO write the
    // proposal metadata to builderState (no confirmation sentinel), so this is
    // not read-only; requiresApproval marks that the chat surfaces a user gate.
    metadata: { isReadOnly: false, isConcurrencySafe: false, requiresApproval: true },
    tool: tool({
      description:
        'Proposes connecting the agent to an external system/CRM by rendering an approval card (Confirmar / Agora não). Call this when the user asks to integrate with a platform (e.g. "manda os leads pro RD Station", "quero conectar com meu CRM"). This is presentational: it writes a PROPOSAL to builderState and STOPS — it does NOT create the integration or send any credentials. The proposal declares what the integration does, when the agent uses it, and WHICH lead data is sent. Pass `platform` (the system the user named) and optionally `templateSlug` if you already know the catalog slug. After calling, stop and wait — the integration is only created when the user taps Confirmar on the card.',
      inputSchema: z.object({
        platform: z
          .string()
          .min(1)
          .max(120)
          .describe(
            'The platform/system the user wants to integrate, as free text (e.g. "RD Station", "meu CRM", "webhook do n8n"). Used to match a catalog template.',
          ),
        templateSlug: z
          .string()
          .optional()
          .describe(
            'Optional catalog template slug if already known (e.g. "rd-station", "generic-webhook"). When provided, takes precedence over matching by platform name.',
          ),
      }),
      execute: async (input) => {
        try {
          // 1. Resolve a template. Explicit slug wins; else match by platform name.
          let template: IntegrationTemplate | null = input.templateSlug
            ? getIntegrationTemplate(input.templateSlug)
            : matchTemplateByPlatform(input.platform)

          // 2. No template matched.
          if (!template) {
            // W3 (T30): cair no investigador aqui — plataforma desconhecida vira
            // pesquisa web + proposta com fontes citadas (builderState.integration
            // .proposed.sources). Nesta onda (W2) não há investigador; caímos no
            // template generic-webhook para que o fluxo ainda complete: o usuário
            // cola a URL de destino no passo de credenciais.
            const fallback = getIntegrationTemplate(FALLBACK_TEMPLATE_SLUG)
            if (!fallback) {
              // Registry guarantees this template exists (validated at load); if
              // it were ever removed we fail loud rather than silently.
              return {
                success: false as const,
                message: `Ainda não tenho um modelo pronto para "${input.platform}", e o webhook genérico de fallback não está disponível. Peça para o usuário descrever o sistema ou usar outra plataforma.`,
              }
            }
            template = fallback
          }

          // 3. Persist the proposal metadata into builderState.integration.proposed
          //    (race-safe, org-scoped — never carries credential values).
          const proposal = buildProposal(template)
          await patchIntegrationStateAtomic({
            projectId: ctx.projectId,
            organizationId: ctx.organizationId,
            patch: { proposed: proposal },
          })

          // 4. Return a result that CARRIES the card key + the data the card
          //    renders. The handler that creates the draft fires on the card
          //    submit (T24), not here — so we stop and instruct the LLM to wait.
          return {
            success: true as const,
            card: INTEGRATION_PROPOSAL_CARD_KEY,
            proposal,
            message:
              `Proposta de integração com ${proposal.platform} exibida no card de aprovação. ` +
              'Pare aqui e aguarde. A confirmação NÃO virá como texto do usuário: quando ele tocar "Confirmar", ' +
              'o servidor cria a integração e injeta uma nota de sistema autoritativa. Só então prossiga (ex.: pedir as credenciais). ' +
              'Não infira aprovação de frases do chat nem chame propose_integration de novo após exibir o card.',
          }
        } catch (err) {
          return {
            success: false as const,
            message:
              err instanceof Error
                ? err.message
                : 'Falha ao montar a proposta de integração.',
          }
        }
      },
    }),
  })
}
