/**
 * propose_field_values — Builder tool (jornada-builder-v2 T23, FR-02)
 *
 * Irmã da `set_project_basics`: mesmo padrão de escrita atômica do builderState
 * (parseBuilderState → patchBuilderState → updateMany org-scoped, via
 * $transaction read-modify-write para um card concorrente não ser clobberado),
 * MAS grava EXCLUSIVAMENTE no namespace `capturedProposals.*` — propostas
 * capturadas da conversa que o usuário ainda PRECISA confirmar no card.
 *
 * Contrato "configure por exceção" (plan §2.2 item 2 + §5):
 *   - NUNCA flipa um sentinel (`confirmations.*`). Proposta ≠ confirmação.
 *   - O shape é uma WHITELIST estrutural fechada por domínio (persona/services/
 *     hours/pricing/handoff/activation), reusando os sub-schemas de
 *     `capturedProposalsSchema` com seus max-lengths — o LLM nunca grava shape
 *     arbitrário (chaves extras são descartadas pelo safeParse).
 *   - O prefill dos cards lê `capturedProposals.<domínio>` como fallback abaixo
 *     do owned confirmado; o submit do card limpa a proposta via
 *     `clearCapturedProposals` depois que o valor vira owned.
 *
 * Tenant boundary: toda escrita filtrada por organizationId. Zero `any`.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'
import {
  invalidateRefinement,
  parseBuilderState,
  patchBuilderState,
  capturedPersonaProposalSchema,
  capturedServicesProposalSchema,
  capturedHoursProposalSchema,
  capturedPricingProposalSchema,
  capturedHandoffProposalSchema,
  capturedActivationProposalSchema,
  type BuilderState,
  type CapturedProposals,
  type DeepPartial,
} from '../cards/builder-state'

// ---------------------------------------------------------------------------
// Input schema — WHITELIST estrutural fechada (reusa os sub-schemas de
// capturedProposalsSchema, com seus max-lengths). Cada domínio é OPCIONAL; o
// refine exige pelo menos um. Chaves fora da whitelist caem no .strict() abaixo.
// ---------------------------------------------------------------------------

export const proposeFieldValuesInputSchema = z
  .object({
    persona: capturedPersonaProposalSchema
      .optional()
      .describe(
        'Persona proposta a partir do texto livre: { name?, tone?, greeting? }. Pré-preenche o card de persona para CONFIRMAÇÃO.',
      ),
    services: capturedServicesProposalSchema
      .optional()
      .describe(
        'Escopo proposto: { offered?: string[] }. Pré-preenche o card de escopo para CONFIRMAÇÃO.',
      ),
    hours: capturedHoursProposalSchema
      .optional()
      .describe(
        'Horário proposto: { preset? }. Pré-preenche o card de horários para CONFIRMAÇÃO.',
      ),
    pricing: capturedPricingProposalSchema
      .optional()
      .describe(
        'Preços propostos: { items?: { name, priceCents, ... }[] }. Pré-preenche o card de preços para CONFIRMAÇÃO.',
      ),
    handoff: capturedHandoffProposalSchema
      .optional()
      .describe(
        'Transferência proposta: { mode?, reason? }. Pré-preenche o card de transferência para CONFIRMAÇÃO.',
      ),
    activation: capturedActivationProposalSchema
      .optional()
      .describe(
        'Ativação proposta: { mode? }. Pré-preenche o card de ativação para CONFIRMAÇÃO.',
      ),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(value.persona) ||
      Boolean(value.services) ||
      Boolean(value.hours) ||
      Boolean(value.pricing) ||
      Boolean(value.handoff) ||
      Boolean(value.activation),
    {
      message:
        'Informe pelo menos um domínio: persona, services, hours, pricing, handoff ou activation.',
    },
  )

/** O conjunto de domínios efetivamente propostos (eco para o LLM avisar o usuário). */
export type ProposedDomain = keyof CapturedProposals

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function proposeFieldValuesTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'propose_field_values',
    metadata: { isReadOnly: false, isConcurrencySafe: false, requiresApproval: false },
    tool: tool({
      description:
        'Use quando o usuário mencionar horários/escopo/preços/transferência (ou persona/ativação) em texto livre — ' +
        'a proposta aparece prefillada no card para CONFIRMAÇÃO; nunca confirme por ele. ' +
        'Grava SOMENTE builderState.capturedProposals.<domínio> (proposta, não confirmação): ' +
        'NÃO destrava nenhum passo da jornada e NÃO substitui o submit do card.',
      inputSchema: proposeFieldValuesInputSchema,
      execute: async (input) => {
        try {
          // 1. Resolve the conversation for the active project (org-scoped).
          const conversation = await database.builderProjectConversation.findFirst({
            where: { projectId: ctx.projectId, organizationId: ctx.organizationId },
            select: { id: true },
          })
          if (!conversation) {
            return {
              success: false as const,
              message: 'Conversa do Builder não encontrada para este projeto.',
            }
          }

          // 2. Atomic read-modify-write of builderState (same pattern as
          //    set_project_basics): re-read the FRESHEST state inside the
          //    transaction so a concurrent card submit isn't clobbered. Writes
          //    ONLY capturedProposals.* — never a confirmation sentinel.
          const proposed = await database.$transaction(async (tx) => {
            const row = await tx.builderProjectConversation.findFirst({
              where: { id: conversation.id, organizationId: ctx.organizationId },
              select: { builderState: true },
            })
            const current = parseBuilderState(row?.builderState ?? null)

            // Only forward the domains that came in (deepMerge ignores undefined
            // and never deletes — clearing a proposal is the card submit's job
            // via clearCapturedProposals, not this tool's).
            const capturedProposals: DeepPartial<CapturedProposals> = {
              ...(input.persona ? { persona: input.persona } : {}),
              ...(input.services ? { services: input.services } : {}),
              ...(input.hours ? { hours: input.hours } : {}),
              ...(input.pricing ? { pricing: input.pricing } : {}),
              ...(input.handoff ? { handoff: input.handoff } : {}),
              ...(input.activation ? { activation: input.activation } : {}),
            }
            const patch: DeepPartial<BuilderState> = { capturedProposals }
            const next = invalidateRefinement(
              patchBuilderState(current, patch),
              'propose_field_values alterou propostas usadas pelo contexto do agente.',
            )

            await tx.builderProjectConversation.updateMany({
              where: { id: conversation.id, organizationId: ctx.organizationId },
              data: { builderState: next as unknown as Prisma.InputJsonValue },
            })

            return Object.keys(capturedProposals) as ProposedDomain[]
          })

          const labels: Record<ProposedDomain, string> = {
            persona: 'persona',
            services: 'escopo',
            hours: 'horários',
            pricing: 'preços',
            handoff: 'transferência',
            activation: 'ativação',
          }
          const bits = proposed.map((domain) => labels[domain])

          return {
            success: true as const,
            proposed,
            message:
              `Proposta capturada para ${bits.join(', ')} — vai aparecer prefillada no card ` +
              'para você CONFIRMAR. Nada foi confirmado ainda.',
          }
        } catch (err) {
          return {
            success: false as const,
            message:
              err instanceof Error
                ? err.message
                : 'Falha ao gravar a proposta capturada',
          }
        }
      },
    }),
  })
}
