/**
 * Tool buscar_media (Fase E — E3) — RETRIEVAL puro do catálogo de mídia.
 *
 * Espelha createSearchKnowledgeTool: é o caminho SOB DEMANDA pelo qual o agente
 * recupera URLs REAIS de fotos/vídeos/PDFs do catálogo (MediaAsset) ANTES de
 * emitir uma tag de mídia no outbound (`[url da imagem:"…"|"…"]`, `[video:…]`,
 * `[document:…]`). O guardrail do whatsapp-media-guide manda: só emitir tag com
 * URL REAL vinda de tool/catálogo — esta tool é essa fonte.
 *
 * IMPORTANTE: esta tool NUNCA envia nada. Ela só RECUPERA. Quem envia é o
 * pipeline OUTBOUND existente (tag-parser → uazapi-sender). Nada de uazapi aqui.
 *
 * Filtro simples (SEM vetor): casa `query` em caption (ILIKE) ou em tags (`has`),
 * opcionalmente restringe por mediaType e category. Só retorna itens visíveis ao
 * runtime: confirmedAt IS NOT NULL AND deletedAt IS NULL, da collection do agente
 * (ctx.ragCollectionId), org-scoped.
 *
 * Sign-on-read fail-safe POR ITEM (igual signImageRow de source-images): para
 * cada row, usa externalUrl direto quando presente, senão assina o storageKey
 * via storage.getSignedUrl(BUCKETS.MEDIA, …) dentro de try/catch — falha na
 * assinatura DESCARTA aquele item, nunca derruba a lista. O storageKey NUNCA é
 * exposto ao LLM; a signed URL NUNCA é persistida.
 *
 * Fail-safe top-level (igual get_pricing): erro inesperado → { found:false } com
 * mensagem degradada, NUNCA lança (não derruba o agente).
 */

import { tool } from 'ai'
import { z } from 'zod'

import { database } from '@/server/services/database'
import { BUCKETS, storage } from '@/server/services/storage'

import type { ToolExecutionContext } from './builtin-tools'

/** Tipos de mídia recuperáveis (áudio fora — é dinâmico/TTS no outbound). */
const MEDIA_TYPES = ['image', 'video', 'document'] as const

/** Item retornado ao LLM — storageKey jamais aparece aqui. */
interface MediaResult {
  url: string
  mediaType: string
  caption: string | null
}

/** Row cru selecionado do DB (storageKey só usado internamente p/ assinar). */
interface MediaRow {
  id: string
  mediaType: string
  storageKey: string | null
  externalUrl: string | null
  caption: string | null
}

/**
 * Resolve a URL REAL de UMA mídia on-read. FAIL-SAFE: externalUrl é usado direto
 * quando presente; caso contrário assina o storageKey (BUCKETS.MEDIA). Qualquer
 * erro de assinatura (storage indisponível, key inexistente, hiccup de rede) ou
 * ausência total de fonte → retorna `null`, e o item é DESCARTADO da lista pelo
 * chamador — nunca propaga, nunca derruba a busca. A signed URL não é persistida.
 */
async function signMediaRow(row: MediaRow): Promise<MediaResult | null> {
  if (row.externalUrl) {
    return { url: row.externalUrl, mediaType: row.mediaType, caption: row.caption }
  }
  if (!row.storageKey) return null
  try {
    const url = await storage.getSignedUrl(BUCKETS.MEDIA, row.storageKey)
    return { url, mediaType: row.mediaType, caption: row.caption }
  } catch (err) {
    console.warn(
      '[buscar_media] getSignedUrl falhou (fail-safe, item descartado):',
      row.id,
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}

export function createSearchMediaTool(ctx: ToolExecutionContext) {
  return tool({
    description:
      'Busca no catálogo de mídia da empresa (fotos, vídeos, PDFs) por uma URL REAL para enviar ao cliente. Use SEMPRE antes de emitir uma tag de mídia — a URL vem do campo `url` retornado aqui, NUNCA invente URLs. Pode filtrar por termo (casa em legenda/tags), por tipo (image/video/document) e por categoria.',
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe('Termo p/ casar em legenda/tags (curto e específico).'),
      mediaType: z
        .enum(MEDIA_TYPES)
        .optional()
        .describe('Restringe ao tipo: image, video ou document.'),
      category: z
        .string()
        .optional()
        .describe('Filtra por categoria do catálogo, se houver.'),
      max: z
        .number()
        .int()
        .min(1)
        .max(8)
        .default(6)
        .describe('Máximo de mídias a retornar (1–8, padrão 6).'),
    }),
    execute: async ({ query, mediaType, category, max }) => {
      try {
        if (!ctx.ragCollectionId) {
          return {
            found: false,
            message: 'Catálogo de mídia não configurado para este agente.',
          }
        }

        const term = query?.trim()

        const rows = await database.mediaAsset.findMany({
          where: {
            collectionId: ctx.ragCollectionId,
            organizationId: ctx.organizationId,
            confirmedAt: { not: null },
            deletedAt: null,
            ...(mediaType ? { mediaType } : {}),
            ...(category
              ? { category: { equals: category, mode: 'insensitive' } }
              : {}),
            ...(term
              ? {
                  OR: [
                    { caption: { contains: term, mode: 'insensitive' } },
                    { tags: { has: term.toLowerCase() } },
                  ],
                }
              : {}),
          },
          orderBy: { position: 'asc' },
          take: max,
          select: {
            id: true,
            mediaType: true,
            storageKey: true,
            externalUrl: true,
            caption: true,
          },
        })

        // Sign-on-read fail-safe POR ITEM: itens cuja URL não resolve são
        // descartados (signMediaRow → null), nunca derrubam a lista.
        const signed = await Promise.all(rows.map((row) => signMediaRow(row)))
        const results = signed.filter(
          (r): r is MediaResult => r !== null,
        )

        if (results.length === 0) {
          return {
            found: false,
            message: 'Nenhuma mídia encontrada para a busca.',
          }
        }

        return { found: true, results }
      } catch (err) {
        console.error(
          '[buscar_media] falhou:',
          err instanceof Error ? err.message : String(err),
        )
        return {
          found: false,
          message: 'Nenhuma mídia encontrada para a busca.',
        }
      }
    },
  })
}
