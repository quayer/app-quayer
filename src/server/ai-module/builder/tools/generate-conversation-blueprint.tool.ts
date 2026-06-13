import { tool } from 'ai'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'
import {
  parseBuilderState,
  patchBuilderState,
  invalidateRefinement,
  type BuilderState,
  type DeepPartial,
} from '../cards/builder-state'
import { playbookDesignerSubAgent } from '../sub-agents'
import {
  normalizeConversationBlueprint,
  validateConversationBlueprint,
} from '../playbook/blueprint-helpers'
import {
  buildDesignerInput,
  hasSoldOutSourceSignal,
  soldOutStrategyKnownLimit,
} from '../playbook/designer-input'

export const generateConversationBlueprintInputSchema = z.object({
  objective: z
    .string()
    .min(10)
    .max(500)
    .optional()
    .describe(
      'Objetivo principal do agente. Se omitido, a tool usa project.objective já registrado.',
    ),
  niche: z
    .string()
    .min(2)
    .max(200)
    .optional()
    .describe(
      'Nicho/vertical do negócio. Ex.: imobiliário, clínica, B2B, delivery.',
    ),
  soldOutStrategy: z
    .enum(['interest_list', 'human_confirm', 'available_confirmed'])
    .optional()
    .describe(
      'Obrigatório quando a fonte indicar 100% vendido/esgotado: interest_list, human_confirm ou available_confirmed.',
    ),
  soldOutNote: z.string().min(1).max(300).optional(),
})

export function generateConversationBlueprintTool(
  ctx: BuilderToolExecutionContext,
) {
  return buildBuilderTool({
    name: 'generate_conversation_blueprint',
    metadata: { isReadOnly: false, isConcurrencySafe: false },
    tool: tool({
      description:
        'Gera um ConversationBlueprint estruturado (plano de atendimento) antes do prompt final em projetos v2. ' +
        'Use depois de objetivo e identidade do negócio estarem conhecidos, e antes de generate_prompt_anatomy/create_agent. ' +
        'A tool grava apenas uma PROPOSTA no builderState; a aprovação vem do card conversation_blueprint.',
      inputSchema: generateConversationBlueprintInputSchema,
      execute: async (input) => {
        const conversation = await database.builderProjectConversation.findFirst({
          where: { projectId: ctx.projectId, organizationId: ctx.organizationId },
          select: { id: true, builderState: true },
        })
        if (!conversation) {
          return {
            success: false as const,
            message: 'Conversa do Builder não encontrada para este projeto.',
          }
        }

        const current = parseBuilderState(conversation.builderState)
        if (hasSoldOutSourceSignal(current) && !input.soldOutStrategy) {
          return {
            success: false as const,
            code: 'SOURCE_DECISION_REQUIRED',
            message:
              'A fonte indica que o empreendimento está 100% vendido/esgotado. Antes de gerar o plano de atendimento, pergunte ao usuário se o SDR deve captar lista de interesse/alternativas, encaminhar para humano confirmar disponibilidade ou usar uma disponibilidade confirmada fora da fonte.',
          }
        }

        const designerInput = buildDesignerInput(current, {
          ...input,
          extraKnownLimits: input.soldOutStrategy
            ? [soldOutStrategyKnownLimit(input.soldOutStrategy, input.soldOutNote)]
            : [],
        })
        if (!designerInput) {
          return {
            success: false as const,
            code: 'OBJECTIVE_REQUIRED',
            message:
              'Defina primeiro o objetivo do agente antes de gerar o plano de atendimento.',
          }
        }

        const designed = await playbookDesignerSubAgent.run(designerInput, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          projectId: ctx.projectId,
        })
        if (!designed.success) {
          return {
            success: false as const,
            code: designed.code,
            message: designed.error,
          }
        }

        const blueprint = normalizeConversationBlueprint({
          ...designed.data.blueprint,
          status: 'proposed',
          objective: designerInput.objective,
          niche: designerInput.niche,
        })
        const issues = validateConversationBlueprint(blueprint)

        await database.$transaction(async (tx) => {
          const row = await tx.builderProjectConversation.findFirst({
            where: { id: conversation.id, organizationId: ctx.organizationId },
            select: { builderState: true },
          })
          const fresh = parseBuilderState(row?.builderState)
          const patch: DeepPartial<BuilderState> = {
            conversationBlueprint: blueprint,
          }
          const next = invalidateRefinement(
            patchBuilderState(fresh, patch),
            'Uma nova proposta de plano de atendimento foi gerada depois do refinamento.',
          )
          await tx.builderProjectConversation.updateMany({
            where: { id: conversation.id, organizationId: ctx.organizationId },
            data: { builderState: next as unknown as Prisma.InputJsonValue },
          })
        })

        return {
          success: true as const,
          card: 'conversation_blueprint' as const,
          source: designed.data.source,
          warnings: [...designed.data.warnings, ...issues.map((i) => i.message)],
          blueprint: {
            objective: blueprint.objective,
            niche: blueprint.niche,
            stageCount: blueprint.stages.length,
            questionCount: blueprint.questions.length,
            toolTriggerCount: blueprint.toolTriggers.length,
          },
          message:
            'Plano de atendimento gerado e exibido no card. Pare aqui e aguarde o usuário revisar/aprovar o plano; não gere o prompt final antes da aprovação.',
        }
      },
    }),
  })
}
