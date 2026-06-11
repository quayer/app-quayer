/**
 * materialize-knowledge.handler — Vitest unit (Onda 4 / risco 7 / FR-13).
 *
 * Materialização do VÍNCULO de RAG na saga de deploy: garante
 * `AIAgentConfig.ragCollectionId` + `useRAG=true` quando o projeto tem uma
 * `KnowledgeCollection` `kb:${projectId}`. É o passo `materialize_knowledge`,
 * executado entre `materialize_media` e `create_instance`.
 *
 * O que estes testes pinam (o CONTRATO que o passo deve satisfazer):
 *   1. Resolução da collection SEM depender do vínculo do agente: prefere
 *      `metadata.knowledgeCollectionId` (verificando existência + ativa) e cai para
 *      a busca por nome `kb:${projectId}` (mesma do create_agent).
 *   2. Liga o agente (ragCollectionId + useRAG:true) quando ainda não está vinculado.
 *   3. Idempotência / rede dupla: quando o agente JÁ aponta para a collection com
 *      useRAG=true, não escreve nada (zero UPDATE) — re-rodar a saga converge.
 *   4. No-op limpo quando o projeto não tem KB (sem collection → linked:false, sem
 *      derrubar a saga).
 *   5. Org-scoping: todo read/where carrega `organizationId`.
 *   6. Falha REAL de DB de ESCRITA PROPAGA (aciona o rollback como os outros steps).
 *   7. Compensação (rollback): no-op idempotente self-contained.
 *
 * Tudo mockado (`database`): a saga é TS puro, sem DB real. Segue o idioma de mock do
 * repo (vi.hoisted + vi.mock + import after-mock), igual a
 * materialize-pricing.handler.test.ts. Os helpers PUROS de knowledge-helpers
 * (collectionNameFor/metaCollectionId) rodam de verdade (não tocam DB).
 *
 * SUT: o handler `./materialize-knowledge.handler` (`materializeKnowledge` +
 * `compensateMaterializeKnowledge`) é importado APÓS o `vi.mock`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { DeployContext } from './deploy.contract'

// ---------------------------------------------------------------------------
// Hoisted mocks — database delegates
// ---------------------------------------------------------------------------

const mockProjectFindFirst = vi.hoisted(() => vi.fn())
const mockCollectionFindFirst = vi.hoisted(() => vi.fn())
const mockAgentFindFirst = vi.hoisted(() => vi.fn())
const mockAgentUpdate = vi.hoisted(() => vi.fn())

const databaseMock = vi.hoisted(() => ({
  builderProject: { findFirst: mockProjectFindFirst },
  knowledgeCollection: { findFirst: mockCollectionFindFirst },
  aIAgentConfig: { findFirst: mockAgentFindFirst, update: mockAgentUpdate },
}))

vi.mock('@/server/services/database', () => ({
  database: databaseMock,
  getDatabase: () => databaseMock,
}))

// ---------------------------------------------------------------------------
// SUT — importado APÓS o vi.mock.
// ---------------------------------------------------------------------------

import {
  materializeKnowledge,
  compensateMaterializeKnowledge,
} from './materialize-knowledge.handler'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-test'
const PROJECT_ID = 'cjld2cjxh0000qzrmn831i7rn'
const AGENT_ID = 'agent-1'
const COLLECTION_ID = 'kb-collection-1'
const COLLECTION_NAME = `kb:${PROJECT_ID}`

function baseContext(overrides: Partial<DeployContext> = {}): DeployContext {
  return {
    deploymentId: 'dep-1',
    projectId: PROJECT_ID,
    promptVersionId: 'pv-1',
    aiAgentId: AGENT_ID,
    organizationId: ORG_ID,
    userId: 'user-1',
    state: {},
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()

  // Default: projeto com metadata apontando para a collection.
  mockProjectFindFirst.mockResolvedValue({
    metadata: { knowledgeCollectionId: COLLECTION_ID },
  })
  // Default: a collection existe e está ativa.
  mockCollectionFindFirst.mockResolvedValue({ id: COLLECTION_ID })
  // Default: agente ainda SEM vínculo (deve ligar).
  mockAgentFindFirst.mockResolvedValue({ ragCollectionId: null, useRAG: false })
  mockAgentUpdate.mockResolvedValue({ id: AGENT_ID })
})

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('materializeKnowledge — passo da saga', () => {
  describe('resolução da collection', () => {
    it('usa metadata.knowledgeCollectionId quando existe e está ativa', async () => {
      const result = await materializeKnowledge(baseContext())
      expect(result.collectionId).toBe(COLLECTION_ID)
      // Verificou existência org-scoped + ativa.
      const arg = mockCollectionFindFirst.mock.calls[0]?.[0] as {
        where: { id: string; organizationId: string; isActive: boolean }
      }
      expect(arg.where.id).toBe(COLLECTION_ID)
      expect(arg.where.organizationId).toBe(ORG_ID)
      expect(arg.where.isActive).toBe(true)
    })

    it('cai para a busca por nome kb:${projectId} quando o metadata não resolve', async () => {
      mockProjectFindFirst.mockResolvedValue({ metadata: {} })
      // 1ª chamada (meta) nem acontece; a busca por nome retorna a collection.
      mockCollectionFindFirst.mockResolvedValue({ id: COLLECTION_ID })
      const result = await materializeKnowledge(baseContext())
      expect(result.collectionId).toBe(COLLECTION_ID)
      const calls = mockCollectionFindFirst.mock.calls
      const arg = calls[calls.length - 1]?.[0] as {
        where: { organizationId: string; name: string; isActive: boolean }
      }
      expect(arg.where.name).toBe(COLLECTION_NAME)
      expect(arg.where.organizationId).toBe(ORG_ID)
    })

    it('no-op limpo quando o projeto não tem KB (sem collection)', async () => {
      mockProjectFindFirst.mockResolvedValue({ metadata: {} })
      mockCollectionFindFirst.mockResolvedValue(null)
      const result = await materializeKnowledge(baseContext())
      expect(result).toEqual({ collectionId: null, linked: false })
      expect(mockAgentUpdate).not.toHaveBeenCalled()
    })

    it('no-op quando o projeto não existe na org', async () => {
      mockProjectFindFirst.mockResolvedValue(null)
      const result = await materializeKnowledge(baseContext())
      expect(result).toEqual({ collectionId: null, linked: false })
      expect(mockAgentUpdate).not.toHaveBeenCalled()
    })
  })

  describe('vínculo do agente', () => {
    it('liga ragCollectionId + useRAG:true quando o agente ainda não está vinculado', async () => {
      mockAgentFindFirst.mockResolvedValue({ ragCollectionId: null, useRAG: false })
      const result = await materializeKnowledge(baseContext())
      expect(result).toEqual({ collectionId: COLLECTION_ID, linked: true })
      expect(mockAgentUpdate).toHaveBeenCalledTimes(1)
      const arg = mockAgentUpdate.mock.calls[0]?.[0] as {
        where: { id: string }
        data: { ragCollectionId: string; useRAG: boolean }
      }
      expect(arg.where.id).toBe(AGENT_ID)
      expect(arg.data.ragCollectionId).toBe(COLLECTION_ID)
      expect(arg.data.useRAG).toBe(true)
    })

    it('resolve o agente org-scoped (findFirst com organizationId no where)', async () => {
      await materializeKnowledge(baseContext())
      const findArg = mockAgentFindFirst.mock.calls[0]?.[0] as {
        where: { id: string; organizationId: string }
      }
      expect(findArg.where.id).toBe(AGENT_ID)
      expect(findArg.where.organizationId).toBe(ORG_ID)
    })

    it('religa quando o agente aponta para OUTRA collection', async () => {
      mockAgentFindFirst.mockResolvedValue({
        ragCollectionId: 'collection-antiga',
        useRAG: true,
      })
      await materializeKnowledge(baseContext())
      const arg = mockAgentUpdate.mock.calls[0]?.[0] as {
        data: { ragCollectionId: string }
      }
      expect(arg.data.ragCollectionId).toBe(COLLECTION_ID)
    })

    it('liga useRAG quando aponta para a collection certa mas useRAG=false', async () => {
      mockAgentFindFirst.mockResolvedValue({
        ragCollectionId: COLLECTION_ID,
        useRAG: false,
      })
      await materializeKnowledge(baseContext())
      expect(mockAgentUpdate).toHaveBeenCalledTimes(1)
    })

    it('no-op de agente quando o agente não existe na org', async () => {
      mockAgentFindFirst.mockResolvedValue(null)
      const result = await materializeKnowledge(baseContext())
      expect(result).toEqual({ collectionId: COLLECTION_ID, linked: false })
      expect(mockAgentUpdate).not.toHaveBeenCalled()
    })
  })

  describe('idempotência / rede dupla com o create_agent', () => {
    it('NÃO escreve quando o agente JÁ aponta para a collection com useRAG=true (zero UPDATE)', async () => {
      mockAgentFindFirst.mockResolvedValue({
        ragCollectionId: COLLECTION_ID,
        useRAG: true,
      })
      const result = await materializeKnowledge(baseContext())
      expect(result).toEqual({ collectionId: COLLECTION_ID, linked: true })
      expect(mockAgentUpdate).not.toHaveBeenCalled()
    })

    it('segunda execução com o MESMO estado não gera novo UPDATE', async () => {
      // 1ª run: liga.
      await materializeKnowledge(baseContext())
      expect(mockAgentUpdate).toHaveBeenCalledTimes(1)

      // 2ª run: agente já vinculado → nada a fazer.
      vi.clearAllMocks()
      mockProjectFindFirst.mockResolvedValue({
        metadata: { knowledgeCollectionId: COLLECTION_ID },
      })
      mockCollectionFindFirst.mockResolvedValue({ id: COLLECTION_ID })
      mockAgentFindFirst.mockResolvedValue({
        ragCollectionId: COLLECTION_ID,
        useRAG: true,
      })
      await materializeKnowledge(baseContext())
      expect(mockAgentUpdate).not.toHaveBeenCalled()
    })
  })

  describe('falha de DB de ESCRITA propaga (aciona rollback)', () => {
    it('PROPAGA um erro no update do agente', async () => {
      mockAgentUpdate.mockRejectedValue(new Error('db down'))
      await expect(materializeKnowledge(baseContext())).rejects.toThrow('db down')
    })
  })

  describe('retorno do step', () => {
    it('retorna { collectionId, linked } (payload descritivo do step)', async () => {
      const result = await materializeKnowledge(baseContext())
      expect(result.collectionId).toBe(COLLECTION_ID)
      expect(typeof result.linked).toBe('boolean')
    })
  })

  describe('compensação no rollback (no-op self-contained)', () => {
    it('NÃO desfaz o vínculo: não chama update (fonte de verdade do usuário)', async () => {
      await compensateMaterializeKnowledge(baseContext())
      expect(mockAgentUpdate).not.toHaveBeenCalled()
    })

    it('é segura mesmo sem ctx.state.knowledge', async () => {
      await expect(
        compensateMaterializeKnowledge(baseContext({ state: {} })),
      ).resolves.toBeUndefined()
    })
  })
})
