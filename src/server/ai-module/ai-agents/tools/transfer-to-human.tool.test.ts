/**
 * Unit tests da tool UNIFICADA transfer_to_human (routing queue/department/self).
 *
 * Mocka o database, o executor de roleta (department-dispatch) e o sender uazapi
 * para isolar a lógica de roteamento e os efeitos colaterais de cada rota.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/services/database', () => ({
  database: {
    chatSession: { findUnique: vi.fn(), update: vi.fn() },
    notification: { create: vi.fn() },
    connection: { findFirst: vi.fn() },
  },
}))
vi.mock('./department-dispatch', () => ({
  executeDispatchToAgent: vi.fn(),
  rouletteNotifyRateLimiter: { check: vi.fn() },
}))
vi.mock('@/server/communication/services/uazapi-sender.service', () => ({
  sendText: vi.fn(),
  normalizePhone: (s: string) => s,
}))

import { database } from '@/server/services/database'
import {
  executeDispatchToAgent,
  rouletteNotifyRateLimiter,
} from './department-dispatch'
import { sendText } from '@/server/communication/services/uazapi-sender.service'
import {
  executeTransferToHuman,
  type TransferToHumanInput,
} from './transfer-to-human.tool'
import type { ToolExecutionContext } from './builtin-tools'

const mockSession = vi.mocked(database.chatSession.findUnique)
const mockUpdate = vi.mocked(database.chatSession.update)
const mockNotify = vi.mocked(database.notification.create)
const mockConn = vi.mocked(
  (database as unknown as { connection: { findFirst: ReturnType<typeof vi.fn> } })
    .connection.findFirst,
)
const mockDispatch = vi.mocked(executeDispatchToAgent)
const mockRate = vi.mocked(rouletteNotifyRateLimiter.check)
const mockSend = vi.mocked(sendText)

function ctx(): ToolExecutionContext {
  return {
    sessionId: 's-1',
    contactId: 'c-1',
    connectionId: 'conn-1',
    organizationId: 'org-1',
  }
}

function input(over: Partial<TransferToHumanInput> = {}): TransferToHumanInput {
  return {
    routing: 'queue',
    pauseAI: true,
    reason: 'cliente quer falar com uma pessoa',
    urgency: 'medium',
    summary: undefined,
    departmentId: undefined,
    razao: undefined,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSession.mockResolvedValue({
    customFields: {},
    contactPhone: '+5511999999999',
    status: 'ACTIVE',
  } as never)
  mockUpdate.mockResolvedValue({} as never)
  mockNotify.mockResolvedValue({ id: 'notif-1' } as never)
})

describe('routing: queue', () => {
  it('pauseAI:true pausa a sessão e notifica', async () => {
    const res = await executeTransferToHuman(ctx(), input({ routing: 'queue', pauseAI: true }))

    expect(res.success).toBe(true)
    expect(res.routing).toBe('queue')
    expect(res.paused).toBe(true)
    // pausou
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const data = mockUpdate.mock.calls[0]![0].data
    expect(data.aiEnabled).toBe(false)
    expect(data.pausedBy).toBe('agent')
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })

  it('pauseAI:false apenas notifica, sem pausar (ex notify_team)', async () => {
    const res = await executeTransferToHuman(ctx(), input({ routing: 'queue', pauseAI: false }))

    expect(res.success).toBe(true)
    expect(res.paused).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalledTimes(1)
    // tipo da notificação é INFO no caminho notify-only (urgency medium)
    expect(mockNotify.mock.calls[0]![0].data.type).toBe('INFO')
  })

  it('sessão inexistente → success:false', async () => {
    mockSession.mockResolvedValue(null as never)
    const res = await executeTransferToHuman(ctx(), input())
    expect(res.success).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('routing: department', () => {
  it('delega ao executeDispatchToAgent e repassa o resultado', async () => {
    mockDispatch.mockResolvedValue({
      success: true,
      message: 'Atribuído ao João.',
      departmentId: 'dep-1',
      assignedAgentId: 'user-1',
      assignedAgentName: 'João',
      dispatchedVia: 'roulette',
    })

    const res = await executeTransferToHuman(
      ctx(),
      input({ routing: 'department', departmentId: 'dep-1' }),
    )

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      expect.objectContaining({ departmentId: 'dep-1', reason: expect.any(String) }),
    )
    expect(res.routing).toBe('department')
    expect(res.assignedAgentName).toBe('João')
    expect(res.dispatchedVia).toBe('roulette')
    // não toca a sessão diretamente — quem faz é o dispatch
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('routing: self', () => {
  it('avisa o número conectado, pausa e notifica', async () => {
    mockConn.mockResolvedValue({
      uazapiToken: 'tok',
      uazapiBaseUrl: 'https://api.uazapi.com',
      phoneNumber: '+5511888888888',
    })
    mockRate.mockResolvedValue({ success: true } as never)
    mockSend.mockResolvedValue({ success: true } as never)

    const res = await executeTransferToHuman(ctx(), input({ routing: 'self' }))

    expect(res.success).toBe(true)
    expect(res.routing).toBe('self')
    expect(res.whatsappNotified).toBe(true)
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledTimes(1) // pausou
    expect(mockNotify).toHaveBeenCalledTimes(1) // piso de auditoria
  })

  it('degrada quando não há número/instância (ainda pausa e notifica in-app)', async () => {
    mockConn.mockResolvedValue({ uazapiToken: null, uazapiBaseUrl: null, phoneNumber: null })

    const res = await executeTransferToHuman(ctx(), input({ routing: 'self' }))

    expect(res.success).toBe(true)
    expect(res.whatsappNotified).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })
})

describe('routing: queue notify-only (ex notify_team), alta urgência', () => {
  it('pauseAI:false + urgency:high → notifica WARNING, sem pausar', async () => {
    const res = await executeTransferToHuman(
      ctx(),
      input({ routing: 'queue', pauseAI: false, urgency: 'high' }),
    )

    expect(res.success).toBe(true)
    expect(res.paused).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalledTimes(1)
    // urgency high no caminho notify-only → WARNING
    expect(mockNotify.mock.calls[0]![0].data.type).toBe('WARNING')
  })
})

describe('idempotência (#1)', () => {
  it('handoff recente → 2ª chamada (pauseAI) é no-op (sem update/notify)', async () => {
    mockSession.mockResolvedValue({
      customFields: { handoff: { transferredAt: new Date().toISOString() } },
      contactPhone: '+5511999999999',
      status: 'PAUSED',
    } as never)

    const res = await executeTransferToHuman(ctx(), input({ routing: 'queue', pauseAI: true }))

    expect(res.success).toBe(true)
    expect(res.message).toMatch(/já transferido/i)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('handoff ANTIGO (fora da janela) → não bloqueia novo handoff', async () => {
    const old = new Date(Date.now() - 5 * 60_000).toISOString() // 5 min atrás
    mockSession.mockResolvedValue({
      customFields: { handoff: { transferredAt: old } },
      contactPhone: '+5511999999999',
      status: 'ACTIVE',
    } as never)

    const res = await executeTransferToHuman(ctx(), input({ routing: 'queue', pauseAI: true }))

    expect(res.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalledTimes(1) // reabriu/encaminhou de novo
  })
})

describe('razao estruturado', () => {
  it('grava razao no handoff e na metadata da notificação (queue)', async () => {
    await executeTransferToHuman(
      ctx(),
      input({ routing: 'queue', pauseAI: true, razao: 'lead_qualificado' }),
    )

    const updateData = mockUpdate.mock.calls[0]![0].data as {
      customFields: { handoff: { razao: string } }
    }
    expect(updateData.customFields.handoff.razao).toBe('lead_qualificado')
    const notifMeta = (mockNotify.mock.calls[0]![0].data.metadata ?? {}) as Record<
      string,
      unknown
    >
    expect(notifMeta.razao).toBe('lead_qualificado')
  })
})
