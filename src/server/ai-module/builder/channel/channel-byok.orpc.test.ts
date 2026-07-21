/**
 * Builder Channel BYOK + QR (oRPC) — teste in-process do lote B4.
 *
 * Cobre: save de credenciais Cloud API (create com encrypt antes do persist),
 * getStatus mascarado (configured + last4, nunca o token cru), refreshQr feliz
 * e o 502 quando o broker UAZAPI falha.
 *
 * Rodar:
 *   npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'

const mockDb = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    user: { findUnique: fn() },
    customRole: { findUnique: fn() },
    connection: { findFirst: fn(), create: fn(), update: fn() },
  }
})

vi.mock('@/server/services/database', () => ({
  database: mockDb,
  getDatabase: () => mockDb,
}))
vi.mock(
  '@/server/ai-module/builder/channel/channel-credentials.crypto',
  () => ({
    encryptSecretColumns: vi.fn((cols: Record<string, unknown>) => ({
      ...cols,
      __encrypted: true,
    })),
    lastFour: vi.fn((v: string | null) => (v ? v.slice(-4) : null)),
  }),
)
vi.mock('@/server/ai-module/builder/channel/attach-to-agent', () => ({
  attachConnectionToProjectAgent: vi.fn(),
}))
vi.mock('@/lib/api/uazapi.service', () => ({
  uazapiService: {
    createInstance: vi.fn(),
    setWebhook: vi.fn(),
    generateQR: vi.fn(),
  },
  buildUazapiWebhookUrl: vi.fn().mockReturnValue(null),
}))

import { uazapiService } from '@/lib/api/uazapi.service'
import { encryptSecretColumns } from '@/server/ai-module/builder/channel/channel-credentials.crypto'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, POST } from '@/orpc/serve'

const generateQrFn = uazapiService.generateQR as unknown as ReturnType<typeof vi.fn>
const encryptFn = encryptSecretColumns as unknown as ReturnType<typeof vi.fn>

const BASE = 'http://localhost:3000/api/v1'
const CONNECTION_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b52'

function bearer(): string {
  const token = signAccessToken({
    userId: 'user-1',
    email: 'u@example.com',
    role: 'user',
    currentOrgId: 'org-1',
  } as Parameters<typeof signAccessToken>[0])
  return `Bearer ${token}`
}

function jsonHeaders(): Record<string, string> {
  return { authorization: bearer(), 'content-type': 'application/json' }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.user.findUnique.mockResolvedValue({
    id: 'user-1',
    email: 'u@example.com',
    isActive: true,
    role: 'user',
    currentOrgId: 'org-1',
    organizations: [],
  })
})

describe('oRPC — builder channel credentials (BYOK)', () => {
  it('POST channel/credentials cria Connection com colunas encriptadas', async () => {
    mockDb.connection.create.mockResolvedValue({
      id: CONNECTION_ID,
      name: 'Cloud API Loja',
      provider: 'WHATSAPP_CLOUD',
      channel: 'WHATSAPP',
      status: 'CONNECTED',
    })

    const res = await POST(
      new Request(`${BASE}/builder/channel/credentials`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          kind: 'whatsapp_cloud',
          accessToken: 'EAAG-secret-token-9999',
          phoneNumberId: '1234567890',
          wabaId: '0987654321',
          verifyToken: 'verify-abc',
          name: 'Cloud API Loja',
        }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      connectionId: CONNECTION_ID,
      created: true,
      status: 'CONNECTED',
    })
    // encrypt SEMPRE antes do persist
    expect(encryptFn).toHaveBeenCalledWith(expect.anything(), 'whatsapp_cloud')
    const createArg = mockDb.connection.create.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(createArg.data.__encrypted).toBe(true)
    expect(createArg.data.organizationId).toBe('org-1')
  })

  it('GET channel/credentials/{id} mascara segredos (configured + last4)', async () => {
    mockDb.connection.findFirst.mockResolvedValue({
      id: CONNECTION_ID,
      name: 'Cloud API Loja',
      provider: 'WHATSAPP_CLOUD',
      channel: 'WHATSAPP',
      status: 'CONNECTED',
      cloudApiPhoneNumberId: '1234567890',
      cloudApiWabaId: '0987654321',
      cloudApiVerifiedName: 'Loja X',
      cloudApiAccessToken: 'EAAG-secret-token-9999',
      cloudApiVerifyToken: 'verify-abc',
      igAccountId: null,
      igPageAccessToken: null,
      igAppSecret: null,
      igVerifyToken: null,
    })

    const res = await GET(
      new Request(`${BASE}/builder/channel/credentials/${CONNECTION_ID}`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      connectionId: CONNECTION_ID,
      secrets: {
        accessToken: { configured: true, last4: '9999' },
        verifyToken: { configured: true, last4: '-abc' },
      },
    })
    // O token cru NUNCA vaza na resposta
    expect(JSON.stringify(body)).not.toContain('EAAG-secret-token-9999')
  })
})

describe('oRPC — builder refresh QR', () => {
  it('POST channel/refresh-qr regenera QR e renova o TTL do shareToken', async () => {
    mockDb.connection.findFirst.mockResolvedValue({
      id: CONNECTION_ID,
      uazapiToken: 'uaz-token',
    })
    generateQrFn.mockResolvedValue({ success: true, data: { qrcode: 'QR-BASE64' } })
    mockDb.connection.update.mockResolvedValue({
      qrCode: 'QR-BASE64',
      shareTokenExpiresAt: new Date('2026-07-21T12:15:00Z'),
    })

    const res = await POST(
      new Request(`${BASE}/builder/channel/refresh-qr`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ connectionId: CONNECTION_ID }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        qrCode: 'QR-BASE64',
        shareTokenExpiresAt: '2026-07-21T12:15:00.000Z',
      },
      error: null,
    })
  })

  it('broker UAZAPI falhando responde 502 (status preservado)', async () => {
    mockDb.connection.findFirst.mockResolvedValue({
      id: CONNECTION_ID,
      uazapiToken: 'uaz-token',
    })
    generateQrFn.mockResolvedValue({ success: false, error: 'broker offline' })

    const res = await POST(
      new Request(`${BASE}/builder/channel/refresh-qr`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ connectionId: CONNECTION_ID }),
      }),
    )

    expect(res.status).toBe(502)
    expect(mockDb.connection.update).not.toHaveBeenCalled()
  })
})
