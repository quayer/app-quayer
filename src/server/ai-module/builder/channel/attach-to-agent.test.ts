/**
 * attachConnectionToProjectAgent — Vitest unit (Onda 5b, FR-26 / T104).
 *
 * Pina a semântica MULTI-CANAL do attach (plan §7.1): a pausa de deployment é
 * escopada por `connectionId`, então o mesmo agente pode ter N deployments
 * ACTIVE — 1 por conexão/canal simultâneo (WhatsApp + Instagram).
 *
 * O que estes testes pinam (o CONTRATO que a T92 já implementou no fonte):
 *   1. Anexar a conexão B NÃO pausa o deployment ACTIVE da conexão A do MESMO
 *      agente → 2 ACTIVE coexistem (1 por canal).
 *   2. Re-attach da MESMA conexão reativa a linha existente (PAUSED→ACTIVE) SEM
 *      duplicar deployment.
 *   3. No-op quando o projeto ainda não tem `aiAgentId` (nenhuma escrita).
 *
 * Estratégia: o fonte recebe `db` por INJEÇÃO (param `ReturnType<typeof
 * getDatabase>`), então usamos um fake STATEFUL in-memory da tabela
 * `agent_deployments` em vez de vi.mock — verifica o EFEITO real (estado final
 * das linhas), não só as chamadas. Faithful o suficiente para os 4 delegates
 * que o fonte toca: builderProject.findFirst + agentDeployment.{updateMany,
 * findFirst,update,create}.
 */

import { describe, it, expect, beforeEach } from 'vitest'

import type { getDatabase } from '@/server/services/database'
import { attachConnectionToProjectAgent } from './attach-to-agent'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-test'
const PROJECT_ID = 'proj-1'
const AGENT_ID = 'agent-1'
const CONN_A = 'conn-whatsapp'
const CONN_B = 'conn-instagram'

type DeploymentStatus = 'ACTIVE' | 'PAUSED'

interface FakeDeployment {
  id: string
  agentConfigId: string
  connectionId: string
  mode: string
  status: DeploymentStatus
  updatedAt: Date
}

/**
 * Fake STATEFUL do subconjunto de delegates Prisma que o fonte usa. Implementa
 * a semântica real de updateMany/findFirst/update/create sobre uma tabela
 * in-memory de deployments para que possamos asserir o ESTADO final.
 */
function makeFakeDb(opts: { aiAgentId: string | null }) {
  const deployments: FakeDeployment[] = []
  let seq = 0

  const matchesWhere = (
    row: FakeDeployment,
    where: Partial<Pick<FakeDeployment, 'agentConfigId' | 'connectionId' | 'status'>>,
  ): boolean =>
    (where.agentConfigId === undefined || row.agentConfigId === where.agentConfigId) &&
    (where.connectionId === undefined || row.connectionId === where.connectionId) &&
    (where.status === undefined || row.status === where.status)

  const db = {
    __deployments: deployments,
    builderProject: {
      findFirst: async (_args: unknown) => (opts.aiAgentId ? { aiAgentId: opts.aiAgentId } : null),
    },
    agentDeployment: {
      updateMany: async (args: {
        where: Partial<Pick<FakeDeployment, 'agentConfigId' | 'connectionId' | 'status'>>
        data: Partial<FakeDeployment>
      }) => {
        let count = 0
        for (const row of deployments) {
          if (matchesWhere(row, args.where)) {
            Object.assign(row, args.data)
            count++
          }
        }
        return { count }
      },
      findFirst: async (args: {
        where: Partial<Pick<FakeDeployment, 'agentConfigId' | 'connectionId' | 'status'>>
      }) => deployments.find((row) => matchesWhere(row, args.where)) ?? null,
      update: async (args: { where: { id: string }; data: Partial<FakeDeployment> }) => {
        const row = deployments.find((r) => r.id === args.where.id)
        if (!row) throw new Error(`fake update: row ${args.where.id} not found`)
        Object.assign(row, args.data)
        return row
      },
      create: async (args: {
        data: { agentConfigId: string; connectionId: string; mode: string; status: DeploymentStatus }
      }) => {
        const row: FakeDeployment = {
          id: `dep-${++seq}`,
          updatedAt: new Date(),
          ...args.data,
        }
        deployments.push(row)
        return row
      },
    },
  }

  // O fonte só toca os 4 delegates acima; o cast é o idioma do repo para um
  // PrismaClient parcial em testes de injeção.
  return db as unknown as ReturnType<typeof getDatabase> & { __deployments: FakeDeployment[] }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('attachConnectionToProjectAgent — multi-canal (FR-26)', () => {
  let db: ReturnType<typeof getDatabase> & { __deployments: FakeDeployment[] }

  beforeEach(() => {
    db = makeFakeDb({ aiAgentId: AGENT_ID })
  })

  it('anexar a conexão B NÃO pausa o deployment ACTIVE da conexão A (2 ACTIVE coexistem)', async () => {
    // Canal A já anexado e ATIVO (1 deployment por canal).
    await attachConnectionToProjectAgent(db, PROJECT_ID, CONN_A, ORG_ID)
    // Agora anexa um SEGUNDO canal (ex.: Instagram) no MESMO agente.
    await attachConnectionToProjectAgent(db, PROJECT_ID, CONN_B, ORG_ID)

    const rows = db.__deployments
    expect(rows).toHaveLength(2)

    const a = rows.find((r) => r.connectionId === CONN_A)
    const b = rows.find((r) => r.connectionId === CONN_B)
    // O canal A NÃO foi pausado por causa do attach do B — ambos ACTIVE.
    expect(a?.status).toBe('ACTIVE')
    expect(b?.status).toBe('ACTIVE')

    // Os 2 ACTIVE pertencem ao MESMO agente (N deployments por agente).
    const active = rows.filter((r) => r.status === 'ACTIVE')
    expect(active).toHaveLength(2)
    expect(active.every((r) => r.agentConfigId === AGENT_ID)).toBe(true)
  })

  it('re-attach da MESMA conexão reativa (PAUSED→ACTIVE) SEM duplicar deployment', async () => {
    // 1ª: cria o deployment do canal A.
    await attachConnectionToProjectAgent(db, PROJECT_ID, CONN_A, ORG_ID)
    expect(db.__deployments).toHaveLength(1)
    const originalId = db.__deployments[0]!.id

    // Simula uma queda do canal (deployment ficou PAUSED).
    db.__deployments[0]!.status = 'PAUSED'

    // 2ª: re-attach da MESMA conexão → reativa a linha existente, não cria outra.
    await attachConnectionToProjectAgent(db, PROJECT_ID, CONN_A, ORG_ID)

    expect(db.__deployments).toHaveLength(1) // sem duplicata
    expect(db.__deployments[0]!.id).toBe(originalId) // mesma linha
    expect(db.__deployments[0]!.status).toBe('ACTIVE') // reativada
  })

  it('attach idempotente do canal já ACTIVE: continua 1 linha ACTIVE (não duplica nem deixa órfã PAUSED)', async () => {
    await attachConnectionToProjectAgent(db, PROJECT_ID, CONN_A, ORG_ID)
    // Re-attach sem queda (já estava ACTIVE): a pausa por connectionId atinge a
    // própria linha, mas o update subsequente a reativa — converge em 1 ACTIVE.
    await attachConnectionToProjectAgent(db, PROJECT_ID, CONN_A, ORG_ID)

    expect(db.__deployments).toHaveLength(1)
    expect(db.__deployments[0]!.status).toBe('ACTIVE')
  })

  it('no-op quando o projeto ainda não tem aiAgentId (nenhuma escrita)', async () => {
    const dbSemAgente = makeFakeDb({ aiAgentId: null })
    await attachConnectionToProjectAgent(dbSemAgente, PROJECT_ID, CONN_A, ORG_ID)
    expect(dbSemAgente.__deployments).toHaveLength(0)
  })
})
