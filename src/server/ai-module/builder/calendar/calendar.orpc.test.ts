/**
 * Builder Calendar (oRPC) — teste in-process do lote B5.
 *
 * Cobre: status com delegate ausente (degradação pré-migration), disconnect
 * (revoke + remoção do provider + invalidação de cache) e o events-preview
 * soft-fail (available:false, nunca 500).
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
    builderProject: { findFirst: fn() },
    organizationProvider: { deleteMany: fn() },
    // calendarConnection ausente por padrão — simula pré-migration
  } as Record<string, Record<string, ReturnType<typeof vi.fn>>>
})

vi.mock('@/server/services/database', () => ({
  database: mockDb,
  getDatabase: () => mockDb,
}))
vi.mock('@/lib/calendar/calendar-credential-resolver', () => ({
  invalidateCalendarAccess: vi.fn(),
  resolveCalendarAccess: vi.fn(),
}))
vi.mock(
  '@/server/ai-module/ai-agents/tools/calendar/google-calendar-client',
  () => ({ queryFreeBusy: vi.fn() }),
)

import {
  invalidateCalendarAccess,
  resolveCalendarAccess,
} from '@/lib/calendar/calendar-credential-resolver'
import { queryFreeBusy } from '@/server/ai-module/ai-agents/tools/calendar/google-calendar-client'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, DELETE } from '@/app/api/orpc/[[...rest]]/route'

const invalidateFn = invalidateCalendarAccess as unknown as ReturnType<typeof vi.fn>
const resolveAccessFn = resolveCalendarAccess as unknown as ReturnType<typeof vi.fn>
const freeBusyFn = queryFreeBusy as unknown as ReturnType<typeof vi.fn>

const BASE = 'http://localhost:3000/api/orpc'
const PROJECT_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b51'

function bearer(): string {
  const token = signAccessToken({
    userId: 'user-1',
    email: 'u@example.com',
    role: 'user',
    currentOrgId: 'org-1',
  } as Parameters<typeof signAccessToken>[0])
  return `Bearer ${token}`
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

describe('oRPC — builder calendar', () => {
  it('GET calendar/status degrada quando a tabela não existe (pré-migration)', async () => {
    const res = await GET(
      new Request(`${BASE}/builder/calendar/status/${PROJECT_ID}`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        connected: false,
        status: null,
        calendarEmail: null,
        warning: 'CalendarConnection table not available',
      },
      error: null,
    })
  })

  it('DELETE calendar/{projectId} revoga links, remove provider e invalida cache', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({ id: PROJECT_ID })
    mockDb.organizationProvider.deleteMany.mockResolvedValue({ count: 1 })
    ;(mockDb as Record<string, unknown>).calendarConnection = {
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      create: vi.fn(),
      findFirst: vi.fn(),
    }

    try {
      const res = await DELETE(
        new Request(`${BASE}/builder/calendar/${PROJECT_ID}`, {
          method: 'DELETE',
          headers: { authorization: bearer() },
        }),
      )

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        data: { disconnected: true, linksRevoked: 2, providerRemoved: 1 },
        error: null,
      })
      expect(invalidateFn).toHaveBeenCalledWith('org-1', PROJECT_ID)
    } finally {
      delete (mockDb as Record<string, unknown>).calendarConnection
    }
  })

  it('GET events-preview sem credencial degrada para available:false', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({ id: PROJECT_ID })
    resolveAccessFn.mockResolvedValue(null)

    const res = await GET(
      new Request(`${BASE}/builder/calendar/events-preview/${PROJECT_ID}`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { available: false, busyCount: 0 },
      error: null,
    })
    expect(freeBusyFn).not.toHaveBeenCalled()
  })

  it('GET events-preview conta intervalos ocupados do freeBusy', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({ id: PROJECT_ID })
    resolveAccessFn.mockResolvedValue({ accessToken: 'tok', calendarId: 'primary' })
    freeBusyFn.mockResolvedValue([{}, {}, {}])

    const res = await GET(
      new Request(`${BASE}/builder/calendar/events-preview/${PROJECT_ID}`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { available: true, busyCount: 3 },
      error: null,
    })
  })
})
