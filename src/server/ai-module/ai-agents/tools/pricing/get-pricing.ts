/**
 * get_pricing — consulta o catálogo de preços da empresa no runtime.
 *
 * Lê de PriceList/PriceItem (DB) ligado ao agente via AIAgentConfig.priceListId.
 * Busca por nome/alias/descrição (ILIKE + array `has`), filtrável por categoria.
 * Diferente da send_pricing (que só registra o que o agente já decidiu), esta
 * BUSCA preços reais — o agente não precisa inventar/decorar valores.
 *
 * M2 — fala o preço no FORMATO CERTO (campos materializados pela saga de deploy):
 *  - `disclosureStyle` GLOBAL da lista decide como o agente cita o valor:
 *      exact   → "R$ 45,00"
 *      from    → "a partir de R$ 45,00"
 *      average → "entre R$ 200,00 e R$ 350,00" (usa `priceMaxCents`; fail-safe p/ piso)
 *      none    → NÃO cita valor (campo `price` omitido do match)
 *  - `imageUrl` (foto do catálogo visual) é exposto quando é uma https válida.
 *  - `minTicketCents` GLOBAL vira `valorMinimo` top-level + injetado na `orientacao`.
 *
 * Fail-safe: catálogo não configurado ou erro → retorna matches:[] com orientação
 * ("verifique com a equipe"), NUNCA lança (não derruba o agente). Toda a formatação
 * passa pelos helpers PUROS de `format-pricing.ts` (centavos→reais sem float drift).
 *
 * Fonte: DB (MVP). Sync de Google Sheets = fase 2 (molde Google Calendar).
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import type { ToolExecutionContext } from '../builtin-tools'
import {
  formatItemPrice,
  formatPriceCents,
  type PriceDisclosureStyle,
} from './format-pricing'

const NOT_CONFIGURED =
  'Catálogo de preços não configurado para este agente. Oriente o cliente a falar com a equipe para valores.'

/** Estilos de divulgação reconhecidos; default defensivo 'exact'. */
const DISCLOSURE_STYLES: readonly PriceDisclosureStyle[] = [
  'exact',
  'from',
  'average',
  'none',
]

/** Coage qualquer string do DB para um `PriceDisclosureStyle` válido (default 'exact'). */
function asDisclosureStyle(value: string): PriceDisclosureStyle {
  return (DISCLOSURE_STYLES as readonly string[]).includes(value)
    ? (value as PriceDisclosureStyle)
    : 'exact'
}

/** `true` quando é uma URL http(s) confiável o suficiente para expor ao agente. */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
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
      'Consulta o catálogo de preços real da empresa. Use SEMPRE que o cliente perguntar valores/preços — não invente preços. Respeite o estilo de divulgação retornado (não crave preço quando o estilo for "from"/"average"/"none"). Pode buscar por termo (ex: "corte", "consulta") e/ou categoria.',
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
          select: { currency: true, disclosureStyle: true, minTicketCents: true },
        })
        if (!list) return { matches: [], orientacao: NOT_CONFIGURED }

        const style = asDisclosureStyle(list.disclosureStyle)

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
          select: {
            name: true,
            priceCents: true,
            priceMaxCents: true,
            imageUrl: true,
            description: true,
            category: true,
          },
          orderBy: { name: 'asc' },
          take: Math.min(limit ?? 10, 25),
        })

        // valorMinimo global (independe do estilo — inclusive em 'none' pode ser a
        // ÚNICA âncora de valor permitida).
        const valorMinimo =
          typeof list.minTicketCents === 'number' && list.minTicketCents > 0
            ? formatPriceCents(list.minTicketCents, list.currency)
            : undefined

        const matches = items.map((i) => {
          // `price` é undefined quando style==='none' (o agente NÃO cita valor).
          const price = formatItemPrice(i, list.currency, style)
          // Foto: re-valida https defensivamente; omite se inválida.
          const imageUrl =
            i.imageUrl && isHttpUrl(i.imageUrl) ? i.imageUrl : undefined
          return {
            name: i.name,
            ...(price !== undefined ? { price } : {}),
            description: i.description ?? undefined,
            category: i.category ?? undefined,
            ...(imageUrl ? { imageUrl } : {}),
          }
        })

        // Orientação: caso 'none' instrui a NÃO citar valores; busca vazia mantém a
        // copy atual. O valorMinimo (quando houver) é anexado em ambos os casos.
        const minHint = valorMinimo
          ? ` Valor mínimo de atendimento: ${valorMinimo}.`
          : ''
        let orientacao: string | undefined
        if (items.length === 0) {
          orientacao =
            'Nenhum item encontrado para a busca. Ofereça ajuda ou peça mais detalhes.' +
            minHint
        } else if (style === 'none') {
          orientacao =
            'A empresa optou por NÃO divulgar valores por aqui. NÃO cite preços: qualifique a necessidade do cliente e encaminhe para a equipe fechar o valor.' +
            minHint
        } else if (minHint) {
          orientacao = minHint.trim()
        }

        return {
          matches,
          disclosureStyle: style,
          ...(valorMinimo ? { valorMinimo } : {}),
          ...(orientacao ? { orientacao } : {}),
        }
      } catch (err) {
        console.error('[get_pricing] falhou:', err instanceof Error ? err.message : String(err))
        return { matches: [], orientacao: NOT_CONFIGURED }
      }
    },
  })
}
