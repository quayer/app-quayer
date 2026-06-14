/**
 * materialize-proactive.handler — Vitest unit (F1).
 *
 * Materialização da CAPACIDADE "Mensagens proativas" (`builderState.proactive`, 3
 * toggles opt-in — FR-PRO-01) nas regras de runtime `ScheduledAutomation`
 * (FR-PRO-02). Passo `materialize_proactive` da saga de deploy, executado entre
 * `materialize_knowledge` e `create_instance`.
 *
 * O que estes testes pinam (o CONTRATO que a F1 deve satisfazer):
 *   1. Tradução toggles→regras: cada toggle gera os triggers certos; nenhum toggle ⇒
 *      desired vazio.
 *   2. Reconciliação por TRIGGER num $transaction (create/update/pause), NUNCA
 *      hard-delete; escopo por organizationId + projectId.
 *   3. Clear-on-empty: capacidade desligada ⇒ PAUSA todas as automações ativas.
 *   4. Idempotência: rodar 2x converge (update no-op de status; pausa não re-escreve
 *      o que já está paused).
 *   5. Org/project-scoping: findMany carrega organizationId + projectId.
 *   6. Fail-open: builderState null/garbage NÃO derruba a saga (desired vazio).
 *   7. Read de DB que LANÇA propaga (aciona rollback como os outros steps).
 *   8. Degradação: delegate scheduledAutomation ausente (migration não landou) →
 *      no-op (não lança).
 *   9. Compensação (rollback): no-op idempotente self-contained.
 *
 * Tudo mockado (`database` + `readBuilderStateByProject`). Idioma de mock do repo
 * (vi.hoisted + vi.mock + import after-mock), igual a materialize-team.handler.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { DeployContext } from './deploy.contract'

// ---------------------------------------------------------------------------
// Hoisted mocks — database delegate scheduledAutomation + readBuilderStateByProject
// ---------------------------------------------------------------------------

const mockFindMany = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
// Delegate aIAgentConfig — fns DISTINTAS das de scheduledAutomation para a
// derivação de `create_followup` não colidir com as asserções de regras.
const mockAgentFindFirst = vi.hoisted(() => vi.fn())
const mockAgentUpdate = vi.hoisted(() => vi.fn())

const mockTransaction = vi.hoisted(() =>
  vi.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => unknown)(databaseMock)
    }
    return Promise.all(arg as Promise<unknown>[])
  }),
)

const databaseMock = vi.hoisted(() => ({
  scheduledAutomation: {
    findMany: mockFindMany,
    create: mockCreate,
    update: mockUpdate,
  },
  aIAgentConfig: {
    findFirst: mockAgentFindFirst,
    update: mockAgentUpdate,
  },
  $transaction: mockTransaction,
}))

vi.mock('@/server/services/database', () => ({
  database: databaseMock,
  getDatabase: () => databaseMock,
}))

const mockReadBuilderStateByProject = vi.hoisted(() => vi.fn())
vi.mock('../sources/builder-state-db', () => ({
  readBuilderStateByProject: mockReadBuilderStateByProject,
}))

// ---------------------------------------------------------------------------
// SUT — após os vi.mock
// ---------------------------------------------------------------------------

import {
  materializeProactive,
  compensateMaterializeProactive,
} from './materialize-proactive.handler'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-test'
const PROJECT_ID = 'cjld2cjxh0000qzrmn831i7rn'

function baseContext(overrides: Partial<DeployContext> = {}): DeployContext {
  return {
    deploymentId: 'dep-1',
    projectId: PROJECT_ID,
    promptVersionId: 'pv-1',
    aiAgentId: 'agent-1',
    organizationId: ORG_ID,
    userId: 'user-1',
    state: {},
    ...overrides,
  }
}

/** State com a capacidade proativa configurada (3 toggles). */
function stateWithProactive(
  proactive: { followUp?: boolean; reminders?: boolean; importantDates?: boolean },
): Record<string, unknown> {
  return { proactive }
}

interface CreateArg {
  data: {
    organizationId: string
    projectId: string
    trigger: string
    audience: string
    status: string
    cancelRules: { set: string[] }
    maxAttempts: number
  }
}
interface UpdateArg {
  where: { id: string }
  data: Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindMany.mockResolvedValue([])
  mockCreate.mockImplementation(async () => ({ id: 'created' }))
  mockUpdate.mockResolvedValue({ id: 'updated' })
  // Agente com enabledTools vazio por padrão (a derivação de create_followup roda
  // após a reconciliação das regras, no caminho de sucesso).
  mockAgentFindFirst.mockResolvedValue({ enabledTools: [] })
  mockAgentUpdate.mockResolvedValue({ id: 'agent-1' })
  mockReadBuilderStateByProject.mockResolvedValue(
    stateWithProactive({ followUp: true }),
  )
})

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('materializeProactive — F1 step', () => {
  describe('carregar o builderState (lazy, fail-open de conteúdo)', () => {
    it('lê o builderState via readBuilderStateByProject(ctx.projectId)', async () => {
      await materializeProactive(baseContext())
      expect(mockReadBuilderStateByProject).toHaveBeenCalledWith(PROJECT_ID)
    })

    it('NÃO derruba a saga quando o state é null (desired vazio, sem create)', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(null)
      const result = await materializeProactive(baseContext())
      expect(result.activeCount).toBe(0)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('NÃO derruba a saga quando o state é garbage (desired vazio)', async () => {
      mockReadBuilderStateByProject.mockResolvedValue('::nao-e-json::')
      await expect(materializeProactive(baseContext())).resolves.toBeDefined()
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('PROPAGA um erro de DB no read (aciona rollback como os outros steps)', async () => {
      mockReadBuilderStateByProject.mockRejectedValue(new Error('db down'))
      await expect(materializeProactive(baseContext())).rejects.toThrow('db down')
      expect(mockFindMany).not.toHaveBeenCalled()
    })
  })

  describe('tradução toggles → regras', () => {
    it('followUp:true → cria 1 regra lead_idle (audience lead)', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithProactive({ followUp: true }),
      )
      const result = await materializeProactive(baseContext())
      expect(result.created).toBe(1)
      expect(result.activeCount).toBe(1)
      const args = mockCreate.mock.calls.map((c) => c[0] as CreateArg)
      expect(args.map((a) => a.data.trigger)).toEqual(['lead_idle'])
      expect(args[0]?.data.audience).toBe('lead')
    })

    it('reminders:true → cria appointment_before + appointment_after', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithProactive({ reminders: true }),
      )
      const result = await materializeProactive(baseContext())
      const triggers = mockCreate.mock.calls
        .map((c) => (c[0] as CreateArg).data.trigger)
        .sort()
      expect(triggers).toEqual(['appointment_after', 'appointment_before'])
      expect(result.activeCount).toBe(2)
    })

    it('importantDates:true → cria birthday + renewal_due (audience customer)', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithProactive({ importantDates: true }),
      )
      await materializeProactive(baseContext())
      const args = mockCreate.mock.calls.map((c) => c[0] as CreateArg)
      const triggers = args.map((a) => a.data.trigger).sort()
      expect(triggers).toEqual(['birthday', 'renewal_due'])
      expect(args.every((a) => a.data.audience === 'customer')).toBe(true)
    })

    it('todos os toggles ON → 5 regras (1+2+2)', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithProactive({
          followUp: true,
          reminders: true,
          importantDates: true,
        }),
      )
      const result = await materializeProactive(baseContext())
      expect(result.created).toBe(5)
      expect(result.activeCount).toBe(5)
    })

    it('todos OFF → desired vazio (nenhum create; activeCount 0)', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithProactive({
          followUp: false,
          reminders: false,
          importantDates: false,
        }),
      )
      const result = await materializeProactive(baseContext())
      expect(result.created).toBe(0)
      expect(result.activeCount).toBe(0)
      expect(mockCreate).not.toHaveBeenCalled()
    })
  })

  describe('reconciliação por trigger (org/project-scoped)', () => {
    it('findMany filtra por organizationId + projectId', async () => {
      await materializeProactive(baseContext())
      const arg = mockFindMany.mock.calls[0]?.[0] as {
        where: { organizationId: string; projectId: string }
      }
      expect(arg.where.organizationId).toBe(ORG_ID)
      expect(arg.where.projectId).toBe(PROJECT_ID)
    })

    it('create carimba organizationId + projectId + status active', async () => {
      await materializeProactive(baseContext())
      const arg = mockCreate.mock.calls[0]?.[0] as CreateArg
      expect(arg.data.organizationId).toBe(ORG_ID)
      expect(arg.data.projectId).toBe(PROJECT_ID)
      expect(arg.data.status).toBe('active')
    })

    it('regra já existente no DB (mesmo trigger) → UPDATE (não cria duplicata)', async () => {
      mockFindMany.mockResolvedValue([
        { id: 'a-1', trigger: 'lead_idle', status: 'active' },
      ])
      const result = await materializeProactive(baseContext()) // followUp default
      expect(result.updated).toBe(1)
      expect(result.created).toBe(0)
      expect(mockCreate).not.toHaveBeenCalled()
      const arg = mockUpdate.mock.calls[0]?.[0] as UpdateArg
      expect(arg.where.id).toBe('a-1')
      expect(arg.data.status).toBe('active')
    })

    it('re-ATIVA uma regra que estava paused (toggle religado)', async () => {
      mockFindMany.mockResolvedValue([
        { id: 'a-1', trigger: 'lead_idle', status: 'paused' },
      ])
      const result = await materializeProactive(baseContext())
      expect(result.updated).toBe(1)
      const arg = mockUpdate.mock.calls[0]?.[0] as UpdateArg
      expect(arg.data.status).toBe('active')
    })

    it('regra no DB ausente do desired → PAUSA (status paused, nunca delete)', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithProactive({ followUp: true }),
      )
      mockFindMany.mockResolvedValue([
        { id: 'a-1', trigger: 'lead_idle', status: 'active' }, // fica
        { id: 'a-2', trigger: 'birthday', status: 'active' }, // some → pausa
      ])
      const result = await materializeProactive(baseContext())
      expect(result.updated).toBe(1) // lead_idle reescrita
      expect(result.paused).toBe(1) // birthday pausada
      const pauseCall = mockUpdate.mock.calls.find(
        (c) => (c[0] as UpdateArg).where.id === 'a-2',
      )?.[0] as UpdateArg
      expect(pauseCall.data).toEqual({ status: 'paused' })
    })

    it('clear-on-empty: capacidade desligada PAUSA todas as ativas', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(null) // desired vazio
      mockFindMany.mockResolvedValue([
        { id: 'a-1', trigger: 'lead_idle', status: 'active' },
        { id: 'a-2', trigger: 'birthday', status: 'active' },
      ])
      const result = await materializeProactive(baseContext())
      expect(result.paused).toBe(2)
      expect(result.created).toBe(0)
      expect(result.updated).toBe(0)
    })

    it('NÃO re-escreve uma regra já paused (evita write no-op)', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(null) // desired vazio
      mockFindMany.mockResolvedValue([
        { id: 'a-1', trigger: 'lead_idle', status: 'paused' }, // já paused
      ])
      const result = await materializeProactive(baseContext())
      expect(result.paused).toBe(0)
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('duplicata histórica de trigger no DB → 1 update + extras pausados (converge)', async () => {
      mockFindMany.mockResolvedValue([
        { id: 'a-1', trigger: 'lead_idle', status: 'active' },
        { id: 'a-2', trigger: 'lead_idle', status: 'active' }, // dupe
      ])
      const result = await materializeProactive(baseContext()) // followUp
      expect(result.updated).toBe(1)
      expect(result.paused).toBe(1)
    })
  })

  describe('idempotência', () => {
    it('2ª run sobre o estado já materializado é só update (zero create/pause)', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithProactive({ followUp: true }),
      )
      mockFindMany.mockResolvedValue([
        { id: 'a-1', trigger: 'lead_idle', status: 'active' },
      ])
      const result = await materializeProactive(baseContext())
      expect(result.created).toBe(0)
      expect(result.paused).toBe(0)
      expect(result.updated).toBe(1)
    })
  })

  describe('degradação — delegate ausente (migration não landou)', () => {
    it('scheduledAutomation ausente → no-op (não lança)', async () => {
      const txWithoutDelegate = vi.fn(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return (arg as (tx: unknown) => unknown)({})
        }
        return undefined
      })
      // Substitui o $transaction só nesta asserção, passando um tx sem o delegate.
      const original = databaseMock.$transaction
      databaseMock.$transaction = txWithoutDelegate as typeof original
      try {
        const result = await materializeProactive(baseContext())
        expect(result).toEqual({
          activeCount: 1,
          created: 0,
          updated: 0,
          paused: 0,
        })
        expect(mockCreate).not.toHaveBeenCalled()
      } finally {
        databaseMock.$transaction = original
      }
    })
  })

  describe('falha de DB de escrita propaga (aciona rollback)', () => {
    it('create que lança → o step rejeita', async () => {
      mockCreate.mockRejectedValue(new Error('insert failed'))
      await expect(materializeProactive(baseContext())).rejects.toThrow(
        'insert failed',
      )
    })
  })

  describe('derivação da tool create_followup no agente (FR-PRO-01)', () => {
    it('followUp ON → garante create_followup em enabledTools (set-merge)', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithProactive({ followUp: true }),
      )
      mockAgentFindFirst.mockResolvedValue({ enabledTools: ['transfer_to_human'] })
      await materializeProactive(baseContext())
      const arg = mockAgentUpdate.mock.calls[0]?.[0] as {
        where: { id: string }
        data: { enabledTools: { set: string[] } }
      }
      expect(arg.where.id).toBe('agent-1')
      expect(arg.data.enabledTools.set).toEqual([
        'transfer_to_human',
        'create_followup',
      ])
    })

    it('followUp OFF → remove create_followup mas preserva tools custom', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithProactive({ followUp: false }),
      )
      mockAgentFindFirst.mockResolvedValue({
        enabledTools: ['create_followup', 'webhook_crm'],
      })
      await materializeProactive(baseContext())
      const arg = mockAgentUpdate.mock.calls[0]?.[0] as {
        data: { enabledTools: { set: string[] } }
      }
      expect(arg.data.enabledTools.set).toEqual(['webhook_crm'])
    })

    it('create_followup já presente + followUp ON → idempotente (sem update do agente)', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithProactive({ followUp: true }),
      )
      mockAgentFindFirst.mockResolvedValue({ enabledTools: ['create_followup'] })
      await materializeProactive(baseContext())
      expect(mockAgentUpdate).not.toHaveBeenCalled()
    })

    it('findFirst do agente é org-scoped (id + organizationId)', async () => {
      await materializeProactive(baseContext())
      const arg = mockAgentFindFirst.mock.calls[0]?.[0] as {
        where: { id: string; organizationId: string }
      }
      expect(arg.where.id).toBe('agent-1')
      expect(arg.where.organizationId).toBe(ORG_ID)
    })

    it('agente não encontrado → não tenta update (degrada)', async () => {
      mockAgentFindFirst.mockResolvedValue(null)
      await expect(materializeProactive(baseContext())).resolves.toBeDefined()
      expect(mockAgentUpdate).not.toHaveBeenCalled()
    })
  })

  describe('compensação (rollback)', () => {
    it('compensateMaterializeProactive é no-op idempotente (não lança, não toca DB)', async () => {
      await expect(
        compensateMaterializeProactive(baseContext()),
      ).resolves.toBeUndefined()
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockCreate).not.toHaveBeenCalled()
    })
  })
})
