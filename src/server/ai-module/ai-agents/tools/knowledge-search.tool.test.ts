/**
 * Unit tests da tool search_knowledge (RAG sob demanda).
 *
 *  - Sem ragCollectionId → degrada (found:false) e NÃO consulta a base.
 *  - Base vazia → found:false com mensagem.
 *  - Hits → found:true, scores arredondados, e repassa collectionId/org/topK.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../knowledge/knowledge-retrieval.service', () => ({
  retrieveRelevantChunks: vi.fn(),
}))

import { retrieveRelevantChunks } from '../knowledge/knowledge-retrieval.service'
import { createSearchKnowledgeTool } from './knowledge-search.tool'
import type { ToolExecutionContext } from './builtin-tools'

const mockedRetrieve = vi.mocked(retrieveRelevantChunks)

function makeCtx(over: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    sessionId: 's',
    contactId: 'c',
    connectionId: 'conn',
    organizationId: 'org-1',
    ragCollectionId: 'col-1',
    ...over,
  }
}

async function runTool(
  ctx: ToolExecutionContext,
  input: { query: string; limit: number },
) {
  const execute = createSearchKnowledgeTool(ctx).execute
  if (!execute) throw new Error('tool sem execute')
  return execute(input, {} as never)
}

beforeEach(() => {
  mockedRetrieve.mockReset()
})

describe('createSearchKnowledgeTool', () => {
  it('degrada sem consultar a base quando não há ragCollectionId', async () => {
    const result = await runTool(makeCtx({ ragCollectionId: null }), {
      query: 'política de cancelamento',
      limit: 5,
    })

    expect(result).toEqual({
      found: false,
      message: 'Base de conhecimento não configurada para este agente.',
    })
    expect(mockedRetrieve).not.toHaveBeenCalled()
  })

  it('retorna found:false quando a base não tem nada relevante', async () => {
    mockedRetrieve.mockResolvedValue([])

    const result = await runTool(makeCtx(), { query: 'algo inexistente', limit: 5 })

    expect(result).toEqual({
      found: false,
      message: 'Nada relevante encontrado na base de conhecimento.',
    })
  })

  it('repassa collectionId/org/topK e devolve os trechos com score arredondado', async () => {
    mockedRetrieve.mockResolvedValue([
      { id: '1', content: 'Cancelamento até 24h antes.', score: 0.912345, metadata: null },
      { id: '2', content: 'Reembolso em 5 dias úteis.', score: 0.8, metadata: null },
    ])

    const result = await runTool(makeCtx(), { query: 'cancelamento', limit: 3 })

    expect(mockedRetrieve).toHaveBeenCalledWith({
      collectionId: 'col-1',
      query: 'cancelamento',
      organizationId: 'org-1',
      topK: 3,
    })
    expect(result).toEqual({
      found: true,
      results: [
        { content: 'Cancelamento até 24h antes.', score: 0.912 },
        { content: 'Reembolso em 5 dias úteis.', score: 0.8 },
      ],
    })
  })
})
