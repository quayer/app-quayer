/**
 * Unit tests do warm-transfer (F0): a conexão própria do membro manda a 1ª
 * mensagem AO CLIENTE. Fail-safe; no-op quando o membro não tem connectionId.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/services/database', () => ({
  database: { connection: { findFirst: vi.fn() } },
}))
vi.mock('@/server/communication/services/uazapi-sender.service', () => ({
  sendText: vi.fn(),
  normalizePhone: (s: string) => s,
}))

import { database } from '@/server/services/database'
import { sendText } from '@/server/communication/services/uazapi-sender.service'
import { tryWarmTransferToClient, buildWarmTransferText } from './warm-transfer'

const mockConn = vi.mocked(
  (database as unknown as { connection: { findFirst: ReturnType<typeof vi.fn> } })
    .connection.findFirst,
)
const mockSend = vi.mocked(sendText)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('tryWarmTransferToClient', () => {
  it('sem connectionId → no_connection (no-op, não resolve conexão)', async () => {
    const r = await tryWarmTransferToClient({
      organizationId: 'o',
      memberConnectionId: null,
      contactPhone: '+5511999999999',
      memberDisplayName: 'João',
    })
    expect(r).toEqual({ sent: false, skippedReason: 'no_connection' })
    expect(mockConn).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('conexão sem token → no_instance', async () => {
    mockConn.mockResolvedValue({ uazapiToken: null, uazapiBaseUrl: null })
    const r = await tryWarmTransferToClient({
      organizationId: 'o',
      memberConnectionId: 'c1',
      contactPhone: '+5511999999999',
      memberDisplayName: 'João',
    })
    expect(r.skippedReason).toBe('no_instance')
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('envia a abertura AO CLIENTE pela conexão do membro', async () => {
    mockConn.mockResolvedValue({ uazapiToken: 'tok', uazapiBaseUrl: 'https://api.x' })
    mockSend.mockResolvedValue({ success: true } as never)
    const r = await tryWarmTransferToClient({
      organizationId: 'o',
      memberConnectionId: 'c1',
      contactPhone: '+5511988887777',
      memberDisplayName: 'João',
    })
    expect(r.sent).toBe(true)
    expect(mockSend).toHaveBeenCalledTimes(1)
    // recipient (3º arg) = telefone do CLIENTE
    expect(mockSend.mock.calls[0]![2]).toBe('+5511988887777')
  })

  it('send_failed quando o sendText não tem sucesso', async () => {
    mockConn.mockResolvedValue({ uazapiToken: 'tok', uazapiBaseUrl: null })
    mockSend.mockResolvedValue({ success: false } as never)
    const r = await tryWarmTransferToClient({
      organizationId: 'o',
      memberConnectionId: 'c1',
      contactPhone: '+5511999999999',
      memberDisplayName: 'João',
    })
    expect(r.skippedReason).toBe('send_failed')
  })

  it('buildWarmTransferText inclui o nome do membro', () => {
    expect(buildWarmTransferText('Maria')).toContain('Maria')
    expect(buildWarmTransferText('')).toContain('atendente') // fallback
  })
})
