/**
 * Typing Indicator Service — TDD
 *
 * Comportamento esperado:
 *  - sendTypingIndicator(token, baseUrl, recipient) sempre completa (fire-and-forget).
 *  - Nunca lanca excecao para o caller.
 *  - Em falha (rede, status >= 400, params ausentes), apenas loga console.warn.
 *
 * Rodar:
 *   npx vitest run src/server/communication/services/typing-indicator.service.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { sendTypingIndicator } from './typing-indicator.service'

describe('sendTypingIndicator', () => {
  const fetchMock = vi.fn()
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    warnSpy.mockRestore()
  })

  it('caso feliz: status 200 — completa sem throw e chama UAZ /send/presence', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'ok',
    } as unknown as Response)

    await expect(
      sendTypingIndicator('tok-123', 'https://uaz.example.com', '5511999999999'),
    ).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/send/presence')
    expect(String(url).startsWith('https://uaz.example.com')).toBe(true)

    const req = init as RequestInit
    const body = JSON.parse(String(req.body))
    expect(body.presence).toBe('composing')
    // recipient pode ir como `number` (compatibilidade UAZ)
    const recipientField = body.number ?? body.recipient ?? body.to
    expect(recipientField).toBe('5511999999999')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('erro de rede (fetch rejeita) — nao throw e console.warn chamado', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))

    await expect(
      sendTypingIndicator('tok', 'https://uaz', '5511'),
    ).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalled()
  })

  it('status 500 — nao throw e console.warn chamado', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    } as unknown as Response)

    await expect(
      sendTypingIndicator('tok', 'https://uaz', '5511'),
    ).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalled()
  })

  it('sem token — nao throw, console.warn, nao chama fetch', async () => {
    await expect(
      sendTypingIndicator('', 'https://uaz', '5511'),
    ).resolves.toBeUndefined()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('sem recipient — nao throw, console.warn, nao chama fetch', async () => {
    await expect(
      sendTypingIndicator('tok', 'https://uaz', ''),
    ).resolves.toBeUndefined()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
  })
})
