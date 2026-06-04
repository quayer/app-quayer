/**
 * get_pricing — consulta o catálogo de preços da empresa no runtime.
 *
 * Lê de PriceList/PriceItem (DB) ligado ao agente via AIAgentConfig.priceListId.
 * Busca por nome/alias/descrição (ILIKE + array `has`), filtrável por categoria.
 * Diferente da send_pricing (que só registra o que o agente já decidiu), esta
 * BUSCA preços reais — o agente não precisa inventar/decorar valores.
 *
 * Fail-safe: catálogo não configurado ou erro → retorna matches:[] com orientação
 * ("verifique com a equipe"), NUNCA lança (não derruba o agente).
 *
 * Fonte: DB (MVP). Sync de Google Sheets = fase 2 (molde Google Calendar).
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import type { ToolExecutionContext } from '../builtin-tools'

const NOT_CONFIGURED =
  'Catálogo de preços não configurado para este agente. Oriente o cliente a falar com a equipe para valores.'

/** Formata centavos em BRL: 4500 → "R$ 45,00". */
function formatPrice(cents: number, currency: string): string {
  const value = (cents / 100).toFixed(2).replace('.', ',')
  return currency === 'BRL' ? `R$ ${value}` : `${currency} ${value}`
}

/** Resolve a priceList do agente (via agentConfigId, org-scoped). */
async function resolvePriceListId(ctx: ToolExecutionContext): Promise<string | null> {
  if (!ctx.agentConfigId) return null
  const agent = await database.aIAgentConfig.findFirst({
    where: { id: ctx.agentConfigId, organizationId: ctx.organizationId },
    select: { priceListId: true },
  })
  return agent?.priceListId ?? null
}

export function createGetPricingTool(ctx: ToolExecutionContext) {
  return tool({
    description:
      'Consulta o catálogo de preços real da empresa. Use SEMPRE que o cliente perguntar valores/preços — não invente preços. Pode buscar por termo (ex: "corte", "consulta") e/ou categoria.',
    inputSchema: z.object({
      search_term: z
        .string()
        .optional()
        .describe('Termo de busca (nome do serviço/produto). Vazio = lista geral.'),
      category: z.string().optional().describe('Filtrar por categoria, se houver.'),
      limit: z.number().int().min(1).max(25).optional().describe('Máximo de itens (default 10).'),
    }),
    execute: async ({ search_term, category, limit }) => {
      try {
        const priceListId = await resolvePriceListId(ctx)
        if (!priceListId) return { matches: [], orientacao: NOT_CONFIGURED }

        const list = await database.priceList.findFirst({
          where: { id: priceListId, organizationId: ctx.organizationId, isActive: true },
          select: { currency: true },
        })
        if (!list) return { matches: [], orientacao: NOT_CONFIGURED }

        const term = search_term?.trim()
        const items = await database.priceItem.findMany({
          where: {
            priceListId,
            isActive: true,
            ...(category ? { category } : {}),
            ...(term
              ? {
                  OR: [
                    { name: { contains: term, mode: 'insensitive' } },
                    { description: { contains: term, mode: 'insensitive' } },
                    { aliases: { has: term.toLowerCase() } },
                  ],
                }
              : {}),
          },
          select: { name: true, priceCents: true, description: true, category: true },
          orderBy: { name: 'asc' },
          take: Math.min(limit ?? 10, 25),
        })

        return {
          matches: items.map((i) => ({
            name: i.name,
            price: formatPrice(i.priceCents, list.currency),
            description: i.description ?? undefined,
            category: i.category ?? undefined,
          })),
          orientacao:
            items.length === 0
              ? 'Nenhum item encontrado para a busca. Ofereça ajuda ou peça mais detalhes.'
              : undefined,
        }
      } catch (err) {
        console.error('[get_pricing] falhou:', err instanceof Error ? err.message : String(err))
        return { matches: [], orientacao: NOT_CONFIGURED }
      }
    },
  })
}
