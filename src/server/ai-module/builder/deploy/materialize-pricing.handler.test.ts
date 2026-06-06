/**
 * materialize-pricing.handler — Vitest unit (M2).
 *
 * Materialização do PRICING coletado no `builderState` (Onda B) nos modelos de
 * RUNTIME (PriceList / PriceItem). Este é o passo `materialize_pricing` da saga
 * de deploy, executado entre `publish_version` e `create_instance`.
 *
 * O que estes testes pinam (o CONTRATO que a M2 deve satisfazer):
 *   1. Reconciliação por (priceListId, name) case-insensitive:
 *        - presente no state E no DB     → UPDATE (preço/campos, isActive:true)
 *        - presente no state, ausente DB → CREATE
 *        - ausente no state, presente DB → UPDATE isActive:false (DESATIVA)
 *      NUNCA `delete` (preserva histórico / reversível); só a list DO PROJETO.
 *   2. Idempotência: rodar 2x converge ao mesmo estado (sem hard-delete, sem
 *      drift de centavos).
 *   3. Fail-open: `builderState` ausente / null / garbage NÃO derruba a saga
 *      (degrada para no-op seguro, espelhando `parseBuilderState`).
 *   4. Org-scoping: todo upsert/where carrega `organizationId`; o update do
 *      agente é por id já validado como pertencente à org.
 *   5. Link `priceListId` no agente (AIAgentConfig.priceListId = list.id).
 *   6. Campos globais novos espelhando o card: `disclosureStyle`, `minTicketCents`,
 *      `currency`; e por item `priceMaxCents` (só 'average' e > piso) + `imageUrl`
 *      (só https válido) — re-sanitizados defensivamente como em apply-card-submit.
 *   7. Compensação (rollback): no-op idempotente self-contained — NÃO reabre o
 *      catálogo (é fonte de verdade do usuário, não "lixo de deploy") e NÃO depende
 *      de `ctx.state.pricing` (que não é persistido na BuilderDeploymentRow).
 *
 * Tudo mockado (`database` + `readBuilderStateByProject`): a saga é TS puro, sem DB
 * real. Segue o idioma de mock do repo (vi.hoisted + vi.mock + import after-mock),
 * igual a deploy-runner.sub-agent.test.ts / apply-card-submit.test.ts.
 *
 * SUT: o handler M2 `./materialize-pricing.handler` (`materializePricing` +
 * `compensateMaterializePricing`) é importado APÓS os `vi.mock`, para que `database`
 * e `readBuilderStateByProject` já estejam mockados quando o handler resolver seus
 * imports.
 *
 * Contrato pinado: `materializePricing(ctx) → { listId, upserted, deactivated }`
 * e `compensateMaterializePricing(ctx) → void` (no-op self-contained).
 *
 * Cobertura: o glob `node` inclui `src/server/ai-module/builder/deploy/**`
 * (vitest.config.ts), então esta suíte roda no `npm run test:unit`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { DeployContext } from './deploy.contract'
import type { BuilderState } from '../cards/builder-state'

// ---------------------------------------------------------------------------
// Hoisted mocks — database delegates + readBuilderStateByProject
// ---------------------------------------------------------------------------

const mockPriceListUpsert = vi.hoisted(() => vi.fn())
const mockPriceItemFindMany = vi.hoisted(() => vi.fn())
const mockPriceItemCreate = vi.hoisted(() => vi.fn())
const mockPriceItemUpdate = vi.hoisted(() => vi.fn())
const mockPriceItemDelete = vi.hoisted(() => vi.fn())
const mockAgentFindFirst = vi.hoisted(() => vi.fn())
const mockAgentUpdate = vi.hoisted(() => vi.fn())

// `$transaction(fn)` apenas executa o callback com o mesmo `database` mock (o
// step roda a reconciliação dentro de um $transaction; aqui ele é transparente).
const mockTransaction = vi.hoisted(() =>
  vi.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => unknown)(databaseMock)
    }
    // forma de array: Promise.all-like
    return Promise.all(arg as Promise<unknown>[])
  }),
)

const databaseMock = vi.hoisted(() => ({
  priceList: {
    upsert: mockPriceListUpsert,
  },
  priceItem: {
    findMany: mockPriceItemFindMany,
    create: mockPriceItemCreate,
    update: mockPriceItemUpdate,
    delete: mockPriceItemDelete,
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
// SUT — importado APÓS os vi.mock (igual a deploy-runner.sub-agent.test.ts), para
// que `database` e `readBuilderStateByProject` já estejam mockados quando o handler
// resolver seus imports. O contrato pinado aqui é o que a M2 implementa.
// ---------------------------------------------------------------------------

import {
  materializePricing,
  compensateMaterializePricing,
} from './materialize-pricing.handler'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-test'
const OTHER_ORG_ID = 'org-outra'
const PROJECT_ID = 'cjld2cjxh0000qzrmn831i7rn'
const AGENT_ID = 'agent-1'
const LIST_ID = 'list-projeto-1'
const LIST_NAME = `pricing:${PROJECT_ID}`

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

/** Constrói um `builderState` válido (passa por parseBuilderState no handler). */
function stateWithPricing(
  pricing: Partial<BuilderState['pricing']>,
): Record<string, unknown> {
  return {
    pricing: {
      items: [],
      currency: 'BRL',
      disclosureStyle: 'exact',
      ...pricing,
    },
  }
}

/** Linha de PriceItem como o `findMany({ select:{id,name,isActive} })` retorna. */
function dbItem(
  name: string,
  opts: { id?: string; isActive?: boolean } = {},
): { id: string; name: string; isActive: boolean } {
  return {
    id: opts.id ?? `item-${name.toLowerCase()}`,
    name,
    isActive: opts.isActive ?? true,
  }
}

beforeEach(() => {
  vi.clearAllMocks()

  // Default: a list do projeto é criada/garantida com sucesso.
  mockPriceListUpsert.mockResolvedValue({ id: LIST_ID })
  // Default: catálogo DB vazio (todo item do state vira CREATE).
  mockPriceItemFindMany.mockResolvedValue([])
  mockPriceItemCreate.mockImplementation(async (args: { data: { name: string } }) => ({
    id: `created-${args.data.name.toLowerCase()}`,
  }))
  mockPriceItemUpdate.mockResolvedValue({ id: 'updated' })
  mockPriceItemDelete.mockResolvedValue({ id: 'deleted' })
  // Default: agente ainda não tem priceListId (link deve acontecer).
  mockAgentFindFirst.mockResolvedValue({ priceListId: null })
  mockAgentUpdate.mockResolvedValue({ id: AGENT_ID })

  // Default builderState: 1 item simples.
  mockReadBuilderStateByProject.mockResolvedValue(
    stateWithPricing({ items: [{ name: 'Corte', priceCents: 4500 }] }),
  )
})

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('materializePricing — M2 step', () => {
  describe('carregar o builderState (lazy, fail-open de conteúdo)', () => {
    it(
      'lê o builderState do projeto via readBuilderStateByProject(ctx.projectId)',
      async () => {
        await materializePricing(baseContext())
        expect(mockReadBuilderStateByProject).toHaveBeenCalledWith(PROJECT_ID)
      },
    )

    it(
      'NÃO derruba a saga quando o builderState é null (degrada para no-op seguro)',
      async () => {
        mockReadBuilderStateByProject.mockResolvedValue(null)
        const result = await materializePricing(baseContext())
        // parseBuilderState(null) → pricing.items: [] → nada a criar.
        expect(result.upserted).toBe(0)
        expect(mockPriceItemCreate).not.toHaveBeenCalled()
        // O catálogo DB vazio significa que também não há nada a desativar.
        expect(mockPriceItemDelete).not.toHaveBeenCalled()
      },
    )

    it(
      'NÃO derruba a saga quando o builderState é garbage (string inválida)',
      async () => {
        mockReadBuilderStateByProject.mockResolvedValue('::nao-e-json::')
        await expect(
          materializePricing(baseContext()),
        ).resolves.toBeDefined()
        expect(mockPriceItemDelete).not.toHaveBeenCalled()
      },
    )

    it(
      'PROPAGA um erro de DB no read (fail-open é da COERÇÃO do state, não de uma queda de DB — a falha aciona o rollback como os outros steps)',
      async () => {
        // O fail-open cobre conteúdo (null/garbage → default). Uma queda REAL de DB
        // no read deve propagar para o orchestrator acionar a compensação — coerente
        // com "PODE lançar em falha de DB para acionar o rollback".
        mockReadBuilderStateByProject.mockRejectedValue(new Error('db down'))
        await expect(materializePricing(baseContext())).rejects.toThrow('db down')
        // E nada foi escrito (não materializou catálogo parcial).
        expect(mockPriceListUpsert).not.toHaveBeenCalled()
        expect(mockPriceItemCreate).not.toHaveBeenCalled()
        expect(mockPriceItemDelete).not.toHaveBeenCalled()
      },
    )
  })

  describe('PriceList do projeto (org-scoped, idempotente)', () => {
    it(
      'faz upsert da list por (organizationId, name = pricing:${projectId})',
      async () => {
        await materializePricing(baseContext())
        expect(mockPriceListUpsert).toHaveBeenCalledTimes(1)
        const arg = mockPriceListUpsert.mock.calls[0]?.[0] as {
          where: { organizationId_name: { organizationId: string; name: string } }
        }
        expect(arg.where.organizationId_name).toEqual({
          organizationId: ORG_ID,
          name: LIST_NAME,
        })
      },
    )

    it(
      'grava os campos GLOBAIS novos espelhando o card (disclosureStyle, minTicketCents, currency, isActive)',
      async () => {
        mockReadBuilderStateByProject.mockResolvedValue(
          stateWithPricing({
            items: [{ name: 'Mesa', priceCents: 20000 }],
            currency: 'BRL',
            disclosureStyle: 'from',
            minTicketCents: 5000,
          }),
        )
        await materializePricing(baseContext())
        const arg = mockPriceListUpsert.mock.calls[0]?.[0] as {
          create: Record<string, unknown>
          update: Record<string, unknown>
        }
        // disclosureStyle/minTicketCents/currency precisam aparecer em create E update.
        expect(arg.create.disclosureStyle).toBe('from')
        expect(arg.update.disclosureStyle).toBe('from')
        expect(arg.create.minTicketCents).toBe(5000)
        expect(arg.update.minTicketCents).toBe(5000)
        expect(arg.create.currency).toBe('BRL')
        expect(arg.update.isActive).toBe(true)
        // org-scoping no create.
        expect(arg.create.organizationId).toBe(ORG_ID)
      },
    )

    it(
      'grava minTicketCents = null quando ausente (destrava o checkbox)',
      async () => {
        mockReadBuilderStateByProject.mockResolvedValue(
          stateWithPricing({
            items: [{ name: 'Mesa', priceCents: 20000 }],
            // sem minTicketCents
          }),
        )
        await materializePricing(baseContext())
        const arg = mockPriceListUpsert.mock.calls[0]?.[0] as {
          update: { minTicketCents: number | null }
        }
        expect(arg.update.minTicketCents).toBeNull()
      },
    )
  })

  describe('link da PriceList no agente', () => {
    it(
      'liga AIAgentConfig.priceListId = list.id quando o agente ainda não aponta para ela',
      async () => {
        mockAgentFindFirst.mockResolvedValue({ priceListId: null })
        await materializePricing(baseContext())
        expect(mockAgentUpdate).toHaveBeenCalledTimes(1)
        const arg = mockAgentUpdate.mock.calls[0]?.[0] as {
          where: { id: string }
          data: { priceListId: string }
        }
        expect(arg.where.id).toBe(AGENT_ID)
        expect(arg.data.priceListId).toBe(LIST_ID)
      },
    )

    it(
      'resolve o agente org-scoped (findFirst com organizationId no where)',
      async () => {
        await materializePricing(baseContext())
        const findArg = mockAgentFindFirst.mock.calls[0]?.[0] as {
          where: { id: string; organizationId: string }
        }
        expect(findArg.where.id).toBe(AGENT_ID)
        expect(findArg.where.organizationId).toBe(ORG_ID)
      },
    )

    it(
      'NÃO re-liga quando o agente já aponta para a mesma list (idempotente)',
      async () => {
        mockAgentFindFirst.mockResolvedValue({ priceListId: LIST_ID })
        await materializePricing(baseContext())
        expect(mockAgentUpdate).not.toHaveBeenCalled()
      },
    )
  })

  describe('reconciliação dos itens (create / update / deactivate)', () => {
    it('CREATE para item presente no state e ausente no DB', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithPricing({ items: [{ name: 'Barba', priceCents: 3000 }] }),
      )
      mockPriceItemFindMany.mockResolvedValue([]) // DB vazio
      const result = await materializePricing(baseContext())
      expect(mockPriceItemCreate).toHaveBeenCalledTimes(1)
      const arg = mockPriceItemCreate.mock.calls[0]?.[0] as {
        data: { priceListId: string; name: string; priceCents: number }
      }
      expect(arg.data.priceListId).toBe(LIST_ID)
      expect(arg.data.name).toBe('Barba')
      expect(arg.data.priceCents).toBe(3000)
      expect(result.upserted).toBeGreaterThanOrEqual(1)
      expect(mockPriceItemDelete).not.toHaveBeenCalled()
    })

    it(
      'UPDATE (não CREATE) para item presente no state E no DB — match case-insensitive',
      async () => {
        mockReadBuilderStateByProject.mockResolvedValue(
          stateWithPricing({ items: [{ name: 'Corte', priceCents: 5000 }] }),
        )
        // DB tem "CORTE" (caixa diferente) → deve casar e fazer UPDATE.
        mockPriceItemFindMany.mockResolvedValue([
          dbItem('CORTE', { id: 'item-corte' }),
        ])
        await materializePricing(baseContext())
        expect(mockPriceItemCreate).not.toHaveBeenCalled()
        expect(mockPriceItemUpdate).toHaveBeenCalled()
        const arg = mockPriceItemUpdate.mock.calls[0]?.[0] as {
          where: { id: string }
          data: { priceCents: number; isActive: boolean }
        }
        expect(arg.where.id).toBe('item-corte')
        expect(arg.data.priceCents).toBe(5000)
        expect(arg.data.isActive).toBe(true)
      },
    )

    it(
      'DESATIVA (isActive:false) item presente no DB e ausente no state — NUNCA delete',
      async () => {
        mockReadBuilderStateByProject.mockResolvedValue(
          stateWithPricing({ items: [{ name: 'Corte', priceCents: 5000 }] }),
        )
        // DB tem Corte (fica) + Sobrancelha (sumiu do state → desativa).
        mockPriceItemFindMany.mockResolvedValue([
          dbItem('Corte', { id: 'item-corte' }),
          dbItem('Sobrancelha', { id: 'item-sobr' }),
        ])
        const result = await materializePricing(baseContext())

        // hard-delete é PROIBIDO.
        expect(mockPriceItemDelete).not.toHaveBeenCalled()

        // Sobrancelha deve receber update isActive:false.
        const deactivateCall = mockPriceItemUpdate.mock.calls.find((c) => {
          const a = c[0] as { where: { id: string }; data: { isActive?: boolean } }
          return a.where.id === 'item-sobr' && a.data.isActive === false
        })
        expect(deactivateCall).toBeTruthy()
        expect(result.deactivated).toBeGreaterThanOrEqual(1)
      },
    )

    it(
      'reativa (isActive:true) um item que reaparece no state estando inativo no DB',
      async () => {
        mockReadBuilderStateByProject.mockResolvedValue(
          stateWithPricing({ items: [{ name: 'Corte', priceCents: 5000 }] }),
        )
        mockPriceItemFindMany.mockResolvedValue([
          dbItem('Corte', { id: 'item-corte', isActive: false }),
        ])
        await materializePricing(baseContext())
        const reactivate = mockPriceItemUpdate.mock.calls.find((c) => {
          const a = c[0] as { where: { id: string }; data: { isActive?: boolean } }
          return a.where.id === 'item-corte' && a.data.isActive === true
        })
        expect(reactivate).toBeTruthy()
      },
    )
  })

  describe('escopo: só a list DO PROJETO (nunca outras lists da org)', () => {
    it(
      'todo findMany/create/update de item filtra/usa priceListId = list do projeto',
      async () => {
        mockReadBuilderStateByProject.mockResolvedValue(
          stateWithPricing({ items: [{ name: 'Novo', priceCents: 1000 }] }),
        )
        mockPriceItemFindMany.mockResolvedValue([
          dbItem('Antigo', { id: 'item-antigo' }),
        ])
        await materializePricing(baseContext())

        // findMany é escopado por priceListId da list do projeto.
        const findArg = mockPriceItemFindMany.mock.calls[0]?.[0] as {
          where: { priceListId: string }
        }
        expect(findArg.where.priceListId).toBe(LIST_ID)

        // create escreve na list do projeto.
        const createArg = mockPriceItemCreate.mock.calls[0]?.[0] as {
          data: { priceListId: string }
        }
        expect(createArg.data.priceListId).toBe(LIST_ID)
      },
    )
  })

  describe('campos novos por item (priceMaxCents / imageUrl) re-sanitizados', () => {
    it(
      "mantém priceMaxCents só quando disclosureStyle='average' E teto > piso",
      async () => {
        mockReadBuilderStateByProject.mockResolvedValue(
          stateWithPricing({
            disclosureStyle: 'average',
            items: [
              { name: 'Pacote', priceCents: 20000, priceMaxCents: 35000 },
            ],
          }),
        )
        await materializePricing(baseContext())
        const arg = mockPriceItemCreate.mock.calls[0]?.[0] as {
          data: { priceMaxCents: number | null }
        }
        expect(arg.data.priceMaxCents).toBe(35000)
      },
    )

    it(
      "descarta priceMaxCents quando o estilo NÃO é 'average' (grava null)",
      async () => {
        mockReadBuilderStateByProject.mockResolvedValue(
          stateWithPricing({
            disclosureStyle: 'exact',
            // priceMaxCents não deve sobreviver fora de 'average'.
            items: [
              { name: 'Pacote', priceCents: 20000, priceMaxCents: 35000 },
            ],
          }),
        )
        await materializePricing(baseContext())
        const arg = mockPriceItemCreate.mock.calls[0]?.[0] as {
          data: { priceMaxCents: number | null }
        }
        expect(arg.data.priceMaxCents).toBeNull()
      },
    )

    it(
      "descarta priceMaxCents quando o teto NÃO é estritamente maior que o piso",
      async () => {
        mockReadBuilderStateByProject.mockResolvedValue(
          stateWithPricing({
            disclosureStyle: 'average',
            items: [
              { name: 'Pacote', priceCents: 20000, priceMaxCents: 20000 },
            ],
          }),
        )
        await materializePricing(baseContext())
        const arg = mockPriceItemCreate.mock.calls[0]?.[0] as {
          data: { priceMaxCents: number | null }
        }
        expect(arg.data.priceMaxCents).toBeNull()
      },
    )

    it('mantém imageUrl só quando é uma URL https válida', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithPricing({
          items: [
            {
              name: 'ComFoto',
              priceCents: 1000,
              imageUrl: 'https://cdn.example.com/a.jpg',
            },
          ],
        }),
      )
      await materializePricing(baseContext())
      const arg = mockPriceItemCreate.mock.calls[0]?.[0] as {
        data: { imageUrl: string | null }
      }
      expect(arg.data.imageUrl).toBe('https://cdn.example.com/a.jpg')
    })

    it('descarta imageUrl quando não é http(s) (grava null)', async () => {
      mockReadBuilderStateByProject.mockResolvedValue(
        stateWithPricing({
          items: [
            {
              name: 'SemFoto',
              priceCents: 1000,
              // builder-state aceita qualquer url; o step re-valida https.
              imageUrl: 'ftp://evil.example.com/a.jpg',
            },
          ],
        }),
      )
      await materializePricing(baseContext())
      const arg = mockPriceItemCreate.mock.calls[0]?.[0] as {
        data: { imageUrl: string | null }
      }
      expect(arg.data.imageUrl).toBeNull()
    })
  })

  describe('idempotência (rodar 2x converge)', () => {
    it(
      'segunda execução com o MESMO state e MESMO DB não cria duplicata nem hard-deleta',
      async () => {
        const state = stateWithPricing({
          items: [{ name: 'Corte', priceCents: 5000 }],
        })
        mockReadBuilderStateByProject.mockResolvedValue(state)

        // 1ª run: DB vazio → CREATE.
        mockPriceItemFindMany.mockResolvedValueOnce([])
        const first = await materializePricing(baseContext())
        expect(first.upserted).toBeGreaterThanOrEqual(1)

        // 2ª run: agora o DB já tem o item criado → vira UPDATE no-op (sem create).
        vi.clearAllMocks()
        mockPriceListUpsert.mockResolvedValue({ id: LIST_ID })
        mockAgentFindFirst.mockResolvedValue({ priceListId: LIST_ID })
        mockPriceItemUpdate.mockResolvedValue({ id: 'item-corte' })
        mockReadBuilderStateByProject.mockResolvedValue(state)
        mockPriceItemFindMany.mockResolvedValue([
          dbItem('Corte', { id: 'item-corte' }),
        ])

        const second = await materializePricing(baseContext())
        expect(mockPriceItemCreate).not.toHaveBeenCalled()
        expect(mockPriceItemDelete).not.toHaveBeenCalled()
        expect(second.deactivated).toBe(0)
      },
    )
  })

  describe('org-scoping no link do agente', () => {
    it(
      'o update do agente é por id já validado como da org (ctx.organizationId)',
      async () => {
        await materializePricing(baseContext({ organizationId: ORG_ID }))
        // O upsert da list carrega o organizationId do contexto (não vaza p/ outra org).
        const upsertArg = mockPriceListUpsert.mock.calls[0]?.[0] as {
          where: { organizationId_name: { organizationId: string } }
        }
        expect(upsertArg.where.organizationId_name.organizationId).toBe(ORG_ID)
        expect(upsertArg.where.organizationId_name.organizationId).not.toBe(
          OTHER_ORG_ID,
        )
      },
    )
  })

  describe('retorno do step', () => {
    it(
      'retorna { listId, upserted, deactivated } (payload descritivo do step)',
      async () => {
        mockReadBuilderStateByProject.mockResolvedValue(
          stateWithPricing({ items: [{ name: 'Corte', priceCents: 5000 }] }),
        )
        const result = await materializePricing(baseContext())
        expect(result.listId).toBe(LIST_ID)
        expect(typeof result.upserted).toBe('number')
        expect(typeof result.deactivated).toBe('number')
      },
    )
  })

  describe('compensação no rollback (no-op self-contained)', () => {
    it(
      'NÃO reabre o catálogo: não chama delete nem desfaz a list (fonte de verdade do usuário)',
      async () => {
        await compensateMaterializePricing(baseContext())
        expect(mockPriceItemDelete).not.toHaveBeenCalled()
        expect(mockPriceListUpsert).not.toHaveBeenCalled()
      },
    )

    it(
      'é segura mesmo sem ctx.state.pricing (rollback reconstrói o ctx sem esse bookkeeping)',
      async () => {
        // ctx.state.pricing ausente → compensação não pode depender dele.
        await expect(
          compensateMaterializePricing(baseContext({ state: {} })),
        ).resolves.toBeUndefined()
      },
    )
  })
})
