/**
 * Builder Sheet-parse (oRPC) — teste in-process do lote B2.
 *
 * Cobre: parse feliz (envelope response.success -> ok), 404 de projeto de
 * outra org e o mapa de erro tipado SheetParseError.kind -> copy PT-BR.
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
  }
})

vi.mock('@/server/services/database', () => ({
  database: mockDb,
  getDatabase: () => mockDb,
}))
vi.mock('@/server/ai-module/builder/knowledge/knowledge-helpers', () => ({
  loadProject: vi.fn(),
}))
vi.mock('@/server/ai-module/builder/cards/sheet-parse', async (importOriginal) => {
  const original = await importOriginal<
    typeof import('@/server/ai-module/builder/cards/sheet-parse')
  >()
  return { ...original, parseGoogleSheet: vi.fn() }
})

import { loadProject } from '@/server/ai-module/builder/knowledge/knowledge-helpers'
import {
  parseGoogleSheet,
  SheetParseError,
} from '@/server/ai-module/builder/cards/sheet-parse'
import { signAccessToken } from '@/lib/auth/jwt'
import { POST } from '@/app/api/orpc/[[...rest]]/route'

const loadProjectFn = loadProject as unknown as ReturnType<typeof vi.fn>
const parseFn = parseGoogleSheet as unknown as ReturnType<typeof vi.fn>

const BASE = 'http://localhost:3000/api/orpc'
const PROJECT_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b51'
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/abc123/edit'

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

describe('oRPC — builder sheet parse', () => {
  it('POST sheet/parse devolve headers, preview e sugestões de coluna', async () => {
    loadProjectFn.mockResolvedValue({ id: PROJECT_ID })
    parseFn.mockResolvedValue({
      headers: ['Serviço', 'Preço'],
      rows: [['Corte', 'R$ 50']],
      rowCount: 1,
      hasHeader: true,
      columnSuggestions: { 0: 'servico', 1: 'preco' },
    })

    const res = await POST(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/sheet/parse`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ sheetUrl: SHEET_URL }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        headers: ['Serviço', 'Preço'],
        rows: [['Corte', 'R$ 50']],
        rowCount: 1,
        hasHeader: true,
        columnSuggestions: { 0: 'servico', 1: 'preco' },
      },
      error: null,
    })
    expect(loadProjectFn).toHaveBeenCalledWith(PROJECT_ID, 'org-1')
  })

  it('projeto de outra org responde 404 (não vira proxy aberto)', async () => {
    loadProjectFn.mockResolvedValue(null)

    const res = await POST(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/sheet/parse`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ sheetUrl: SHEET_URL }),
      }),
    )
    expect(res.status).toBe(404)
    expect(parseFn).not.toHaveBeenCalled()
  })

  it('SheetParseError tipado responde 400 com a copy PT-BR do kind', async () => {
    loadProjectFn.mockResolvedValue({ id: PROJECT_ID })
    parseFn.mockRejectedValue(
      new SheetParseError('private_or_no_public_link', 'private sheet'),
    )

    const res = await POST(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/sheet/parse`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ sheetUrl: SHEET_URL }),
      }),
    )

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('Qualquer pessoa com o link')
  })
})
