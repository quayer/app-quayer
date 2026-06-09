/**
 * materialize-team.handler — Vitest unit (M1).
 *
 * Materialização do TEAM coletado no `builderState` (Onda A, card team_structure)
 * nos modelos de RUNTIME (Department / DepartmentMember). Passo `materialize_team`
 * da saga de deploy, executado entre `materialize_pricing` e `create_instance`.
 *
 * O que estes testes pinam (o CONTRATO que a M1 deve satisfazer):
 *   1. UPSERT do Department por (organizationId, slug = team:${projectId}) —
 *      chave DETERMINÍSTICA (não há unique por name); name/type com defaults.
 *   2. Reconciliação dos membros num $transaction (create/update/deactivate),
 *      NUNCA hard-delete; escopo por departmentId + organizationId.
 *   3. Injeção idempotente do bloco de roleta no AIAgentConfig.systemPrompt entre
 *      marcadores (substitui se existir; append se não).
 *   4. Org-scoping: upsert/findFirst carregam organizationId.
 *   5. Fail-open: builderState null/garbage NÃO derruba a saga.
 *   6. Degradação: delegate departmentMember ausente (migration não landou) →
 *      no-op nos membros, mas o Department é criado.
 *   7. Compensação (rollback): no-op idempotente self-contained.
 *
 * Tudo mockado (`database` + `readBuilderStateByProject`). Idioma de mock do repo
 * (vi.hoisted + vi.mock + import after-mock), igual a materialize-pricing.handler.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { DeployContext } from './deploy.contract'
import type { BuilderState } from '../cards/builder-state'

// ---------------------------------------------------------------------------
// Hoisted mocks — database delegates + readBuilderStateByProject
// ---------------------------------------------------------------------------

const mockDepartmentUpsert = vi.hoisted(() => vi.fn())
const mockMemberFindMany = vi.hoisted(() => vi.fn())
const mockMemberCreate = vi.hoisted(() => vi.fn())
const mockMemberUpdate = vi.hoisted(() => vi.fn())
const mockMemberDelete = vi.hoisted(() => vi.fn())
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
  department: {
    upsert: mockDepartmentUpsert,
  },
  departmentMember: {
    findMany: mockMemberFindMany,
    create: mockMemberCreate,
    update: mockMemberUpdate,
    delete: mockMemberDelete,
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
  materializeTeam,
  compensateMaterializeTeam,
} from './materialize-team.handler'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-test'
const OTHER_ORG_ID = 'org-outra'
const PROJECT_ID = 'cjld2cjxh0000qzrmn831i7rn'
const AGENT_ID = 'agent-1'
const DEPT_ID = 'dept-projeto-1'
const SLUG = `team:${PROJECT_ID}`

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

function stateWithHandoff(
  handoff: Partial<BuilderState['handoff']>,
): Record<string, unknown> {
  // Onda 2 — default mode 'roleta' (caminho que materializa a roleta); os testes
  // que exercem solo/nenhum sobrescrevem `mode`.
  return {
    handoff: {
      mode: 'roleta',
      alsoSchedule: false,
      steps: [],
      members: [],
      ...handoff,
    },
  }
}

function dbMember(
  overrides: {
    id?: string
    userId?: string | null
    whatsapp?: string | null
    name?: string | null
    isActive?: boolean
  } = {},
): {
  id: string
  userId: string | null
  whatsapp: string | null
  name: string | null
  isActive: boolean
} {
  return {
    id: overrides.id ?? 'm-1',
    userId: overrides.userId ?? null,
    whatsapp: overrides.whatsapp ?? null,
    name: overrides.name ?? null,
    isActive: overrides.isActive ?? true,
  }
}

beforeEach(() => {
  vi.clearAllMocks()

  mockDepartmentUpsert.mockResolvedValue({ id: DEPT_ID })
  mockMemberFindMany.mockResolvedValue([])
  mockMemberCreate.mockImplementation(async () => ({ id: 'created' }))
  mockMemberUpdate.mockResolvedValue({ id: 'updated' })
  mockMemberDelete.mockResolvedValue({ id: 'deleted' })
  mockAgentFindFirst.mockResolvedValue({ systemPrompt: null })
  mockAgentUpdate.mockResolvedValue({ id: AGENT_ID })

  mockReadBuilderStateByProject.mockResolvedValue(
    stateWithHandoff({ members: [{ userId: 'u-1', name: 'Ana', position: 0 }] }),
  )
})

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('materializeTeam — M1 step', () => {
  describe('carregar o builderState (lazy, fail-open de conteúdo)', () => {
    it('lê o builderState via readBuilderStateByProject(ctx.projectId)', async () => {
      await materializeTeam(baseContext())
      expect(mockReadBuilderStateByProject).toHaveBeenCalledWith(PROJECT_ID)
    })

    it('NÃO derruba a saga quando o state é null (degrada — cria dept vazio)', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(null)
      const result = await materializeTeam(baseContext())
      expect(result.departmentId).toBe(DEPT_ID)
      expect(mockMemberCreate).not.toHaveBeenCalled()
      expect(mockMemberDelete).not.toHaveBeenCalled()
    })

    it('NÃO derruba a saga quando o state é garbage', async () => {
      mockReadBuilderStateByProject.mockResolvedValue('::nao-e-json::')
      await expect(materializeTeam(baseContext())).resolves.toBeDefined()
      expect(mockMemberDelete).not.toHaveBeenCalled()
    })

    it('PROPAGA um erro de DB no read (aciona rollback como os outros steps)', async () => {
      mockReadBuilderStateByProject.mockRejectedValue(new Error('db down'))
      await expect(materializeTeam(baseContext())).rejects.toThrow('db down')
      expect(mockDepartmentUpsert).not.toHaveBeenCalled()
    })
  })

  describe('Department do projeto (org-scoped, slug determinístico)', () => {
    it('faz upsert por (organizationId, slug = team:${projectId})', async () => {
      await materializeTeam(baseContext())
      expect(mockDepartmentUpsert).toHaveBeenCalledTimes(1)
      const arg = mockDepartmentUpsert.mock.calls[0]?.[0] as {
        where: { organizationId_slug: { organizationId: string; slug: string } }
        create: Record<string, unknown>
      }
      expect(arg.where.organizationId_slug).toEqual({
        organizationId: ORG_ID,
        slug: SLUG,
      })
      expect(arg.create.organizationId).toBe(ORG_ID)
      expect(arg.create.slug).toBe(SLUG)
    })

    it('usa name/type do state quando presentes', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithHandoff({
          departmentName: 'Vendas',
          departmentType: 'sales',
          members: [],
        }),
      )
      await materializeTeam(baseContext())
      const arg = mockDepartmentUpsert.mock.calls[0]?.[0] as {
        create: { name: string; type: string }
        update: { name: string; type: string }
      }
      expect(arg.create.name).toBe('Vendas')
      expect(arg.create.type).toBe('sales')
      expect(arg.update.name).toBe('Vendas')
    })

    it('aplica defaults (Atendimento/support) quando name/type ausentes', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(stateWithHandoff({ members: [] }))
      await materializeTeam(baseContext())
      const arg = mockDepartmentUpsert.mock.calls[0]?.[0] as {
        create: { name: string; type: string }
      }
      expect(arg.create.name).toBe('Atendimento')
      expect(arg.create.type).toBe('support')
    })
  })

  describe('reconciliação dos membros (create / update / deactivate)', () => {
    it('CREATE para membro presente no state e ausente no DB (org+dept escopados)', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithHandoff({ members: [{ name: 'Bia', whatsapp: '11988887777', position: 0 }] }),
      )
      mockMemberFindMany.mockResolvedValue([])
      const result = await materializeTeam(baseContext())
      expect(mockMemberCreate).toHaveBeenCalledTimes(1)
      const arg = mockMemberCreate.mock.calls[0]?.[0] as {
        data: { departmentId: string; organizationId: string; whatsapp: string }
      }
      expect(arg.data.departmentId).toBe(DEPT_ID)
      expect(arg.data.organizationId).toBe(ORG_ID)
      expect(arg.data.whatsapp).toBe('+5511988887777') // normalizado
      expect(result.upserted).toBeGreaterThanOrEqual(1)
      expect(mockMemberDelete).not.toHaveBeenCalled()
    })

    it('UPDATE (não CREATE) quando o membro casa por userId no DB', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithHandoff({ members: [{ userId: 'u-1', name: 'Ana', position: 0 }] }),
      )
      mockMemberFindMany.mockResolvedValue([dbMember({ id: 'm-1', userId: 'u-1' })])
      await materializeTeam(baseContext())
      expect(mockMemberCreate).not.toHaveBeenCalled()
      const arg = mockMemberUpdate.mock.calls[0]?.[0] as {
        where: { id: string }
        data: { isActive: boolean }
      }
      expect(arg.where.id).toBe('m-1')
      expect(arg.data.isActive).toBe(true)
    })

    it('DESATIVA (isActive:false) membro do DB ausente no state — NUNCA delete', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithHandoff({ members: [{ userId: 'u-1', name: 'Ana', position: 0 }] }),
      )
      mockMemberFindMany.mockResolvedValue([
        dbMember({ id: 'm-1', userId: 'u-1' }),
        dbMember({ id: 'm-some', userId: 'u-2' }),
      ])
      const result = await materializeTeam(baseContext())
      expect(mockMemberDelete).not.toHaveBeenCalled()
      const deactivate = mockMemberUpdate.mock.calls.find((c) => {
        const a = c[0] as { where: { id: string }; data: { isActive?: boolean } }
        return a.where.id === 'm-some' && a.data.isActive === false
      })
      expect(deactivate).toBeTruthy()
      expect(result.deactivated).toBeGreaterThanOrEqual(1)
    })

    it('findMany dos membros é escopado por departmentId + organizationId', async () => {
      await materializeTeam(baseContext())
      const arg = mockMemberFindMany.mock.calls[0]?.[0] as {
        where: { departmentId: string; organizationId: string }
      }
      expect(arg.where.departmentId).toBe(DEPT_ID)
      expect(arg.where.organizationId).toBe(ORG_ID)
    })
  })

  describe('degradação quando o delegate departmentMember está ausente', () => {
    it('cria o Department mas pula a reconciliação de membros (no-op, não lança)', async () => {
      // $transaction recebe um tx SEM departmentMember → delegate null → no-op.
      mockTransaction.mockImplementationOnce(async (arg: unknown) => {
        const txSemDelegate = { aIAgentConfig: databaseMock.aIAgentConfig }
        return (arg as (tx: unknown) => unknown)(txSemDelegate)
      })
      const result = await materializeTeam(baseContext())
      expect(result.departmentId).toBe(DEPT_ID)
      expect(mockMemberCreate).not.toHaveBeenCalled()
      expect(mockMemberUpdate).not.toHaveBeenCalled()
    })
  })

  describe('bloco de roleta no systemPrompt (idempotente)', () => {
    it('injeta o bloco com o departmentId quando o prompt está vazio', async () => {
      mockAgentFindFirst.mockResolvedValue({ systemPrompt: null })
      await materializeTeam(baseContext())
      const arg = mockAgentUpdate.mock.calls[0]?.[0] as {
        where: { id: string }
        data: { systemPrompt: string }
      }
      expect(arg.where.id).toBe(AGENT_ID)
      expect(arg.data.systemPrompt).toContain('<!--ROLETA:start-->')
      expect(arg.data.systemPrompt).toContain(`departmentId='${DEPT_ID}'`)
      expect(arg.data.systemPrompt).toContain('<!--ROLETA:end-->')
      // ensina a tool UNIFICADA (não mais o alias dispatch_to_agent)
      expect(arg.data.systemPrompt).toContain('transfer_to_human')
      expect(arg.data.systemPrompt).toContain("routing='department'")
    })

    it('resolve o agente org-scoped (findFirst com organizationId)', async () => {
      await materializeTeam(baseContext())
      const arg = mockAgentFindFirst.mock.calls[0]?.[0] as {
        where: { id: string; organizationId: string }
      }
      expect(arg.where.id).toBe(AGENT_ID)
      expect(arg.where.organizationId).toBe(ORG_ID)
    })

    it('SUBSTITUI o bloco existente (idempotente, sem duplicar marcadores)', async () => {
      mockAgentFindFirst.mockResolvedValue({
        systemPrompt:
          'Prompt base\n\n<!--ROLETA:start-->\n## Roleta antiga\ndept antigo\n<!--ROLETA:end-->',
      })
      await materializeTeam(baseContext())
      const arg = mockAgentUpdate.mock.calls[0]?.[0] as {
        data: { systemPrompt: string }
      }
      const starts = arg.data.systemPrompt.match(/<!--ROLETA:start-->/g) ?? []
      expect(starts).toHaveLength(1)
      expect(arg.data.systemPrompt).toContain(`departmentId='${DEPT_ID}'`)
      expect(arg.data.systemPrompt).toContain('Prompt base')
    })

    it('NÃO reescreve o prompt quando o bloco já é idêntico (idempotente)', async () => {
      // 1ª run para capturar o prompt resultante.
      mockAgentFindFirst.mockResolvedValueOnce({ systemPrompt: null })
      await materializeTeam(baseContext())
      const written = (
        mockAgentUpdate.mock.calls[0]?.[0] as { data: { systemPrompt: string } }
      ).data.systemPrompt

      // 2ª run com o prompt já igual E o vínculo estruturado já gravado
      // (departmentId === DEPT_ID) → nenhum dos dois caminhos de update deve disparar.
      vi.clearAllMocks()
      mockDepartmentUpsert.mockResolvedValue({ id: DEPT_ID })
      mockMemberFindMany.mockResolvedValue([])
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithHandoff({ members: [{ userId: 'u-1', name: 'Ana', position: 0 }] }),
      )
      mockAgentFindFirst.mockResolvedValue({
        systemPrompt: written,
        departmentId: DEPT_ID,
      })
      await materializeTeam(baseContext())
      expect(mockAgentUpdate).not.toHaveBeenCalled()
    })
  })

  describe('Onda 2 — modo gateia a roleta (solo/nenhum: tear-down)', () => {
    it("modo 'solo' NÃO injeta bloco de roleta, desativa membros legados e limpa o vínculo", async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithHandoff({ mode: 'solo', members: [] }),
      )
      mockMemberFindMany.mockResolvedValue([dbMember({ id: 'm-old', userId: 'u-old' })])
      mockAgentFindFirst.mockResolvedValue({
        systemPrompt:
          'Base\n\n<!--ROLETA:start-->\n## Roleta antiga\n<!--ROLETA:end-->',
        departmentId: DEPT_ID,
      })
      await materializeTeam(baseContext())

      // desired vazio (não-roleta) → membro legado desativado (nunca delete).
      expect(mockMemberDelete).not.toHaveBeenCalled()
      const deactivate = mockMemberUpdate.mock.calls.find((c) => {
        const a = c[0] as { where: { id: string }; data: { isActive?: boolean } }
        return a.where.id === 'm-old' && a.data.isActive === false
      })
      expect(deactivate).toBeTruthy()

      // tear-down do prompt: bloco de roleta removido.
      const promptUpdate = mockAgentUpdate.mock.calls.find((c) => {
        const a = c[0] as { data: { systemPrompt?: string } }
        return typeof a.data.systemPrompt === 'string'
      })
      expect(promptUpdate).toBeTruthy()
      expect(
        (promptUpdate?.[0] as { data: { systemPrompt: string } }).data.systemPrompt,
      ).not.toContain('<!--ROLETA:start-->')

      // vínculo estruturado limpo (apontava para ESTE department).
      const deptClear = mockAgentUpdate.mock.calls.find((c) => {
        const a = c[0] as { data: { departmentId?: string | null } }
        return a.data.departmentId === null
      })
      expect(deptClear).toBeTruthy()
    })
  })

  describe('org-scoping', () => {
    it('o upsert carrega o organizationId do contexto (não vaza p/ outra org)', async () => {
      await materializeTeam(baseContext({ organizationId: ORG_ID }))
      const arg = mockDepartmentUpsert.mock.calls[0]?.[0] as {
        where: { organizationId_slug: { organizationId: string } }
      }
      expect(arg.where.organizationId_slug.organizationId).toBe(ORG_ID)
      expect(arg.where.organizationId_slug.organizationId).not.toBe(OTHER_ORG_ID)
    })
  })

  describe('retorno do step', () => {
    it('retorna { departmentId, upserted, deactivated }', async () => {
      const result = await materializeTeam(baseContext())
      expect(result.departmentId).toBe(DEPT_ID)
      expect(typeof result.upserted).toBe('number')
      expect(typeof result.deactivated).toBe('number')
    })
  })

  describe('compensação no rollback (no-op self-contained)', () => {
    it('NÃO desativa membros nem desfaz o department', async () => {
      await compensateMaterializeTeam(baseContext())
      expect(mockMemberDelete).not.toHaveBeenCalled()
      expect(mockMemberUpdate).not.toHaveBeenCalled()
      expect(mockDepartmentUpsert).not.toHaveBeenCalled()
    })

    it('é segura sem ctx.state.team (rollback reconstrói o ctx sem esse bookkeeping)', async () => {
      await expect(
        compensateMaterializeTeam(baseContext({ state: {} })),
      ).resolves.toBeUndefined()
    })
  })
})
