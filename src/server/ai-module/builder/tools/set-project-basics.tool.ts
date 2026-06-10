/**
 * set_project_basics — Builder tool (P0: step "objective" preso em requiredMissing)
 *
 * Não existia tool que escrevesse builderState para os campos de ownership
 * 'livre' (`project.objective` / `project.name` — ver FIELD_OWNERSHIP em
 * state/next-pending-step.ts): o meta-agente dizia "Objetivo registrado" sem
 * chamar nada e os steps `project_identity`/`objective` ficavam pendentes para
 * sempre. Esta tool grava os campos OWNED com o MESMO padrão de escrita do
 * apply-card-submit (parseBuilderState → patchBuilderState → updateMany
 * org-scoped), de forma atômica via $transaction read-modify-write (espelhando
 * patchSourceIngestionAtomic) para um card concorrente não ser clobberado.
 *
 * Quando `name` vem, atualiza também `builder_projects.name` (org-scoped) para
 * a lista de projetos refletir o nome do negócio.
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
  parseBuilderState,
  patchBuilderState,
  type BuilderState,
  type DeepPartial,
} from '../cards/builder-state'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const setProjectBasicsInputSchema = z
  .object({
    objective: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .optional()
      .describe(
        'Objetivo do agente em texto livre, como o usuário descreveu (ex.: "qualificar leads e agendar consultas"). Máx 300 caracteres.',
      ),
    name: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .optional()
      .describe(
        'Nome do negócio/projeto (ex.: "Clínica Sorriso"). Máx 80 caracteres.',
      ),
  })
  .refine((value) => Boolean(value.objective) || Boolean(value.name), {
    message: 'Informe pelo menos um campo: objective ou name.',
  })

/** O que foi efetivamente gravado (eco para o LLM confirmar ao usuário). */
export interface ProjectBasicsApplied {
  objective?: string
  name?: string
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function setProjectBasicsTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'set_project_basics',
    metadata: { isReadOnly: false, isConcurrencySafe: false, requiresApproval: false },
    tool: tool({
      description:
        'Use SEMPRE que o usuário informar o objetivo do agente ou o nome do negócio em texto livre no chat. ' +
        'Grava builderState.project.objective e/ou project.name (campos de captura livre — os steps ' +
        '"project_identity" e "objective" da jornada só destravam quando esses campos são gravados). ' +
        'Quando o nome vem, atualiza também o nome do projeto. NÃO use para persona (card agent_persona) ' +
        'nem para aprovar a criação do agente (card agent_approval).',
      inputSchema: setProjectBasicsInputSchema,
      execute: async (input) => {
        try {
          const { objective, name } = input

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
          //    patchSourceIngestionAtomic): re-read the FRESHEST state inside
          //    the transaction so a concurrent card submit isn't clobbered.
          const applied = await database.$transaction(async (tx) => {
            const row = await tx.builderProjectConversation.findFirst({
              where: { id: conversation.id, organizationId: ctx.organizationId },
              select: { builderState: true },
            })
            const current = parseBuilderState(row?.builderState ?? null)

            const patch: DeepPartial<BuilderState> = {
              project: {
                ...(objective ? { objective } : {}),
                ...(name ? { name } : {}),
              },
            }
            const next = patchBuilderState(current, patch)

            await tx.builderProjectConversation.updateMany({
              where: { id: conversation.id, organizationId: ctx.organizationId },
              data: { builderState: next as unknown as Prisma.InputJsonValue },
            })

            // 3. Mirror the business name onto builder_projects.name.
            if (name) {
              await tx.builderProject.updateMany({
                where: { id: ctx.projectId, organizationId: ctx.organizationId },
                data: { name },
              })
            }

            const result: ProjectBasicsApplied = {
              ...(objective ? { objective } : {}),
              ...(name ? { name } : {}),
            }
            return result
          })

          const bits: string[] = []
          if (applied.objective) bits.push(`objetivo "${applied.objective}"`)
          if (applied.name) bits.push(`nome "${applied.name}"`)

          return {
            success: true as const,
            applied,
            message: `Registrado: ${bits.join(' e ')}.`,
          }
        } catch (err) {
          return {
            success: false as const,
            message:
              err instanceof Error
                ? err.message
                : 'Falha ao gravar objetivo/nome do projeto',
          }
        }
      },
    }),
  })
}
