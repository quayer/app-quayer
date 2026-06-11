/**
 * Unit tests do `patchIntegrationStateAtomic` (Integration Builder W2, T21).
 *
 * Espelha o estilo de teste de merge do builder-state (sources/ingest-source-refs.test.ts):
 * Prisma mockado com builderState EM MEMÓRIA, o caminho
 * patchIntegrationStateAtomic → patchBuilderState (deepMerge) roda REAL. SEM rede,
 * SEM DB.
 *
 * Invariantes cobertas:
 *   - merge de `proposed` NÃO derruba `draftIntegrationId` (e vice-versa);
 *   - merge do subtree `integration` NÃO clobbera `sourceIngestion` nem outras
 *     chaves top-level (confirmations) do state;
 *   - patch vazio é no-op (não escreve);
 *   - 🚨 valores de credenciais NUNCA são gravados (a função só aceita metadata).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (hoisted ANTES de qualquer import que os toque)
// ---------------------------------------------------------------------------

const store = vi.hoisted(() => ({
  builderState: null as unknown,
  ownedBy: 'org-1',
  projectId: 'proj-1',
}))

const mockConvFindFirst = vi.hoisted(() =>
  vi.fn(
    async (args: {
      where: { projectId: string; organizationId: string }
    }): Promise<{ builderState: unknown } | null> => {
      if (
        args.where.projectId === store.projectId &&
        args.where.organizationId === store.ownedBy
      ) {
        return { builderState: store.builderState }
      }
      return null
    },
  ),
)

const mockConvUpdateMany = vi.hoisted(() =>
  vi.fn(
    async (args: {
      where: { projectId: string; organizationId: string }
      data: { builderState: unknown }
    }): Promise<{ count: number }> => {
      if (
        args.where.projectId !== store.projectId ||
        args.where.organizationId !== store.ownedBy
      ) {
        return { count: 0 }
      }
      store.builderState = args.data.builderState
      return { count: 1 }
    },
  ),
)

vi.mock('@/server/services/database', () => {
  const conversationDelegate = {
    findFirst: mockConvFindFirst,
    updateMany: mockConvUpdateMany,
  }
  return {
    database: {
      builderProjectConversation: conversationDelegate,
      $transaction: vi.fn(
        async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
          fn({ builderProjectConversation: conversationDelegate }),
      ),
    },
  }
})

// ---------------------------------------------------------------------------
// SUT (importado APÓS os mocks)
// ---------------------------------------------------------------------------

import { patchIntegrationStateAtomic } from './integration-state-db'
import { parseBuilderState } from '../cards/builder-state'

const ARGS = { projectId: 'proj-1', organizationId: 'org-1' } as const

beforeEach(() => {
  vi.clearAllMocks()
  store.builderState = null
  store.ownedBy = 'org-1'
  store.projectId = 'proj-1'
})

describe('patchIntegrationStateAtomic — merge do subtree integration', () => {
  it('grava a proposta inicial em integration.proposed', async () => {
    await patchIntegrationStateAtomic({
      ...ARGS,
      patch: {
        proposed: {
          platform: 'RD Station',
          templateSlug: 'rd-station',
          whatDataSent: 'nome, email e telefone do lead',
        },
      },
    })

    const state = parseBuilderState(store.builderState)
    expect(state.integration?.proposed?.platform).toBe('RD Station')
    expect(state.integration?.proposed?.templateSlug).toBe('rd-station')
    expect(state.integration?.proposed?.whatDataSent).toBe(
      'nome, email e telefone do lead',
    )
    expect(state.integration?.draftIntegrationId).toBeUndefined()
  })

  it('merge de proposed NÃO derruba draftIntegrationId já persistido', async () => {
    // Primeiro grava o draftIntegrationId.
    await patchIntegrationStateAtomic({
      ...ARGS,
      patch: { draftIntegrationId: 'draft-123' },
    })
    // Depois um patch SÓ-proposed (sem draftIntegrationId).
    await patchIntegrationStateAtomic({
      ...ARGS,
      patch: { proposed: { platform: 'RD Station' } },
    })

    const state = parseBuilderState(store.builderState)
    expect(state.integration?.draftIntegrationId).toBe('draft-123')
    expect(state.integration?.proposed?.platform).toBe('RD Station')
  })

  it('merge de draftIntegrationId NÃO derruba proposed já persistido', async () => {
    await patchIntegrationStateAtomic({
      ...ARGS,
      patch: {
        proposed: { platform: 'RD Station', triggerDescription: 'ao gerar um lead' },
      },
    })
    await patchIntegrationStateAtomic({
      ...ARGS,
      patch: { draftIntegrationId: 'draft-456' },
    })

    const state = parseBuilderState(store.builderState)
    expect(state.integration?.proposed?.platform).toBe('RD Station')
    expect(state.integration?.proposed?.triggerDescription).toBe('ao gerar um lead')
    expect(state.integration?.draftIntegrationId).toBe('draft-456')
  })

  it('merge do integration subtree NÃO clobbera sourceIngestion nem confirmations', async () => {
    // State pré-existente com sourceIngestion + uma confirmação true.
    store.builderState = {
      sourceIngestion: {
        sources: [
          {
            value: 'https://acme.com.br',
            type: 'url',
            status: 'ready',
            sourceId: 'src-1',
          },
        ],
        proposed: { businessName: 'Acme' },
      },
      confirmations: { source: true, persona: true },
    }

    await patchIntegrationStateAtomic({
      ...ARGS,
      patch: { proposed: { platform: 'RD Station' }, draftIntegrationId: 'draft-1' },
    })

    const state = parseBuilderState(store.builderState)
    // O subtree integration foi escrito.
    expect(state.integration?.proposed?.platform).toBe('RD Station')
    expect(state.integration?.draftIntegrationId).toBe('draft-1')
    // sourceIngestion intacto.
    expect(state.sourceIngestion.sources).toHaveLength(1)
    expect(state.sourceIngestion.sources[0].value).toBe('https://acme.com.br')
    expect(state.sourceIngestion.proposed?.businessName).toBe('Acme')
    // confirmations intactas (NÃO regrediram).
    expect(state.confirmations.source).toBe(true)
    expect(state.confirmations.persona).toBe(true)
  })

  it('patch vazio é no-op (não escreve)', async () => {
    await patchIntegrationStateAtomic({ ...ARGS, patch: {} })
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
  })

  it('é no-op quando a conversa não pertence à org (cross-org)', async () => {
    await patchIntegrationStateAtomic({
      projectId: 'proj-1',
      organizationId: 'org-OUTRA',
      patch: { proposed: { platform: 'RD Station' } },
    })
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
    expect(store.builderState).toBeNull()
  })

  it('🚨 nunca grava chaves de credencial no builderState (só metadata da proposta)', async () => {
    await patchIntegrationStateAtomic({
      ...ARGS,
      patch: {
        proposed: {
          platform: 'RD Station',
          templateSlug: 'rd-station',
          whatDataSent: 'nome e email',
        },
        draftIntegrationId: 'draft-789',
      },
    })

    // O JSON inteiro persistido não contém nenhum vestígio de segredo.
    const serialized = JSON.stringify(store.builderState).toLowerCase()
    expect(serialized).not.toContain('credential')
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('api_key')
    expect(serialized).not.toContain('token')

    const state = parseBuilderState(store.builderState)
    // A proposta só carrega as chaves declaradas do schema.
    expect(Object.keys(state.integration?.proposed ?? {}).sort()).toEqual([
      'platform',
      'templateSlug',
      'whatDataSent',
    ])
  })
})
