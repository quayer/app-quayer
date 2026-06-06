/**
 * Tool search_knowledge — RAG consultável SOB DEMANDA pelo agente.
 *
 * Complementa (não substitui) a INJEÇÃO automática de contexto no system prompt
 * (knowledge-retrieval.service / agent-runtime). A injeção é sempre-disponível mas
 * é decidida UMA vez por turno com a query implícita; esta tool dá ao agente a
 * capacidade de RECONSULTAR a base para um fato específico que ficou fora da janela
 * injetada (ex.: "qual a política de cancelamento?", "esse serviço inclui X?").
 *
 * Reusa `retrieveRelevantChunks` (pgvector KNN, multi-tenant, fail-open — nunca
 * lança). Só existe para o agente quando 'search_knowledge' está em enabledTools
 * E o agente tem ragCollectionId (caso contrário responde degradado, sem quebrar).
 */

import { tool } from 'ai'
import { z } from 'zod'

import { retrieveRelevantChunks } from '../knowledge/knowledge-retrieval.service'
import type { ToolExecutionContext } from './builtin-tools'

export function createSearchKnowledgeTool(ctx: ToolExecutionContext) {
  return tool({
    description:
      'Busca na base de conhecimento da empresa (FAQ, políticas, catálogo, detalhes de serviço) por um trecho específico, sob demanda. Use quando precisar confirmar um fato que talvez não esteja no contexto já fornecido. Faça a query curta e específica, na língua do cliente.',
    inputSchema: z.object({
      query: z
        .string()
        .min(2)
        .describe('O que buscar na base (curto e específico).'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(8)
        .default(5)
        .describe('Quantos trechos retornar (1–8, padrão 5).'),
    }),
    execute: async ({ query, limit }) => {
      if (!ctx.ragCollectionId) {
        return {
          found: false,
          message: 'Base de conhecimento não configurada para este agente.',
        }
      }

      const chunks = await retrieveRelevantChunks({
        collectionId: ctx.ragCollectionId,
        query,
        organizationId: ctx.organizationId,
        topK: limit,
      })

      if (chunks.length === 0) {
        return {
          found: false,
          message: 'Nada relevante encontrado na base de conhecimento.',
        }
      }

      return {
        found: true,
        results: chunks.map((c) => ({
          content: c.content,
          score: Number(c.score.toFixed(3)),
        })),
      }
    },
  })
}
