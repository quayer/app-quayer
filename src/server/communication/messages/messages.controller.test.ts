/**
 * Messages Controller — composer smoke test (TDD red phase)
 *
 * Garante que o composer:
 *   1. Carrega sem erro (todas as actions importáveis)
 *   2. Expõe as 3 actions esperadas: list, getById, listSessions
 *   3. Tem o path base correto (/messages)
 *
 * Estes testes vão falhar até que o controller seja implementado.
 *
 * Rodar:
 *   npx vitest run src/server/communication/messages/messages.controller.test.ts
 */

import { describe, it, expect, vi } from 'vitest'

// --------------------------------------------------------------------------
// Mocks declarados ANTES dos imports do código de produção.
// --------------------------------------------------------------------------

vi.mock('@/server/services/database', () => ({
  database: {
    message: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    chatSession: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  },
}))

vi.mock('@/server/core/auth/procedures/api-key.procedure', () => ({
  authOrApiKeyProcedure: () => ({ name: 'authOrApiKeyProcedure', handler: vi.fn() }),
}))

vi.mock('@/server/core/auth/procedures', () => ({
  authProcedure: () => ({ name: 'authProcedure', handler: vi.fn() }),
}))

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('messagesController (composer)', () => {
  it('carrega o controller sem erro', async () => {
    // Falha esperada: módulo ainda não existe.
    const mod = await import('./messages.controller')
    expect(mod.messagesController).toBeDefined()
  })

  it('expõe path base "/messages"', async () => {
    const mod = await import('./messages.controller')
    expect(mod.messagesController).toMatchObject({ path: '/messages' })
  })

  it('declara o nome "messages"', async () => {
    const mod = await import('./messages.controller')
    expect(mod.messagesController).toMatchObject({ name: 'messages' })
  })

  it('expõe as 3 actions: list, getById, listSessions', async () => {
    const mod = await import('./messages.controller')
    const actions = (mod.messagesController as { actions: Record<string, unknown> }).actions
    expect(actions).toBeDefined()
    expect(actions).toHaveProperty('list')
    expect(actions).toHaveProperty('getById')
    expect(actions).toHaveProperty('listSessions')
  })

  it('não expõe actions inesperadas (mantém a superfície enxuta)', async () => {
    const mod = await import('./messages.controller')
    const actions = (mod.messagesController as { actions: Record<string, unknown> }).actions
    const keys = Object.keys(actions).sort()
    expect(keys).toEqual(['getById', 'list', 'listSessions'].sort())
  })
})
