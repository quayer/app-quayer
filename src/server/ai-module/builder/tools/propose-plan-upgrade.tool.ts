/**
 * propose_plan_upgrade — Builder tool (Wave 2.3)
 *
 * Reads the org's active subscription + catalog of higher-tier plans and
 * emits a PlanPickerCard so the user can pick an upgrade path. Purely
 * presentational — the card's "Escolher" handler opens /org/billing with
 * the chosen slug, which then drives the existing checkout flow.
 *
 * Used by the Builder LLM when:
 *   - The user asks about pricing, limits, or upgrading.
 *   - `publish_agent` is blocked by a plan-limit blocker.
 *   - The user explicitly asks "qual plano preciso para X?"
 *
 * Scope: Portuguese labels, BRL prices rendered by the card (cents → reais).
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'

export interface BuilderToolExecutionContext {
  projectId: string
  organizationId: string
  userId: string
}

interface PlanSummary {
  id: string
  slug: string
  name: string
  description: string | null
  priceMonthlyCents: number
  priceYearlyCents: number | null
  currency: string
  isFree: boolean
  limits: {
    instances: number
    messages: number
    aiCredits: number
    contacts: number
    users: number
  }
  features: {
    webhooks: boolean
    api: boolean
    customRoles: boolean
    sso: boolean
    aiAgents: boolean
    prioritySupport: boolean
  }
  /** True if this is the org's current plan */
  isCurrent: boolean
  /** Relative to current: 'downgrade' | 'same' | 'upgrade' | 'unknown' */
  relativeTier: 'downgrade' | 'same' | 'upgrade' | 'unknown'
}

export function proposePlanUpgradeTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'propose_plan_upgrade',
    metadata: { isReadOnly: true, isConcurrencySafe: true },
    tool: tool({
      description:
        'Presents the catalog of available plans with pricing/limits comparison and highlights the org current plan. Use when the user asks about pricing, limits, or upgrade paths, or when publish_agent is blocked by a plan limit. Does NOT charge or mutate — the user clicks "Escolher" to open the checkout page.',
      inputSchema: z.object({
        reason: z
          .string()
          .max(200)
          .optional()
          .describe(
            'Optional short context ("Precisa do plano Pro para ativar campanhas"). Shown above the cards.',
          ),
        highlight: z
          .string()
          .optional()
          .describe(
            'Optional plan slug to pre-highlight ("pro"). If absent, the next-tier is auto-highlighted.',
          ),
      }),
      execute: async (input) => {
        try {
          const [plans, currentSub] = await Promise.all([
            database.plan.findMany({
              where: { isActive: true },
              orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
            }),
            database.subscription.findFirst({
              where: {
                organizationId: ctx.organizationId,
                isCurrent: true,
              },
              select: { planId: true, plan: { select: { sortOrder: true } } },
            }),
          ])

          if (plans.length === 0) {
            return {
              success: false as const,
              message: 'Nenhum plano ativo encontrado.',
            }
          }

          const currentSort = currentSub?.plan.sortOrder ?? -1

          const summaries: PlanSummary[] = plans.map((p) => {
            const isCurrent = p.id === currentSub?.planId
            let relativeTier: PlanSummary['relativeTier'] = 'unknown'
            if (currentSort >= 0) {
              if (p.sortOrder === currentSort) relativeTier = 'same'
              else if (p.sortOrder > currentSort) relativeTier = 'upgrade'
              else relativeTier = 'downgrade'
            }
            return {
              id: p.id,
              slug: p.slug,
              name: p.name,
              description: p.description,
              priceMonthlyCents: p.priceMonthly,
              priceYearlyCents: p.priceYearly,
              currency: p.currency,
              isFree: p.isFree,
              limits: {
                instances: p.maxInstances,
                messages: p.maxMessages,
                aiCredits: p.maxAiCredits,
                contacts: p.maxContacts,
                users: p.maxUsers,
              },
              features: {
                webhooks: p.hasWebhooks,
                api: p.hasApi,
                customRoles: p.hasCustomRoles,
                sso: p.hasSso,
                aiAgents: p.hasAiAgents,
                prioritySupport: p.hasPrioritySupport,
              },
              isCurrent,
              relativeTier,
            }
          })

          const highlight =
            input.highlight ??
            summaries.find((s) => s.relativeTier === 'upgrade')?.slug ??
            null

          return {
            success: true as const,
            reason: input.reason ?? null,
            highlight,
            plans: summaries,
            message: `Exibindo ${summaries.length} planos para o usuário comparar.`,
          }
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Erro ao listar planos'
          return { success: false as const, message }
        }
      },
    }),
  })
}
