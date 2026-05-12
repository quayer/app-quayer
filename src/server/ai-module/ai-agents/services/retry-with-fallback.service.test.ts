/**
 * retry-with-fallback.service — unit tests.
 *
 * Cobre o wrapper de retry com fallback model. Inspirado em
 * `inspiration/claude-code-leak/src/services/api/withRetry.ts` mas
 * simplificado (sem AbortSignal, sem heartbeats, sem fast-mode).
 *
 * Foco: garantir que
 *   - sucesso na 1ª passa não enfileira retries
 *   - erros retriable (429/5xx/ECONNRESET) disparam retry
 *   - erros não-retriable propagam imediatamente
 *   - após maxAttempts/2 falhas, troca para fallbackFn
 *   - backoff cresce exponencialmente (base * 2^n, capped)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  retryWithFallback,
  isRetriableError,
} from './retry-with-fallback.service'

describe('isRetriableError', () => {
  it('HTTP 429 → true', () => {
    expect(isRetriableError({ status: 429 })).toBe(true)
  })

  it('HTTP 503 → true', () => {
    expect(isRetriableError({ status: 503 })).toBe(true)
  })

  it('HTTP 500 → true', () => {
    expect(isRetriableError({ status: 500 })).toBe(true)
  })

  it('HTTP 400 → false', () => {
    expect(isRetriableError({ status: 400 })).toBe(false)
  })

  it('AbortError → false', () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    expect(isRetriableError(err)).toBe(false)
  })

  it('erro com code: ECONNRESET → true', () => {
    expect(isRetriableError({ code: 'ECONNRESET' })).toBe(true)
  })

  it('erro com code: ETIMEDOUT → true', () => {
    expect(isRetriableError({ code: 'ETIMEDOUT' })).toBe(true)
  })

  it('erro com code: EAI_AGAIN → true', () => {
    expect(isRetriableError({ code: 'EAI_AGAIN' })).toBe(true)
  })

  it('null → false', () => {
    expect(isRetriableError(null)).toBe(false)
  })

  it('undefined → false', () => {
    expect(isRetriableError(undefined)).toBe(false)
  })
})

describe('retryWithFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sucesso na 1ª tentativa → attemptsUsed: 1, usedFallback: false', async () => {
    const primary = vi.fn().mockResolvedValue('ok')
    const fallback = vi.fn()

    const result = await retryWithFallback(primary, fallback)

    expect(result.data).toBe('ok')
    expect(result.error).toBeUndefined()
    expect(result.attemptsUsed).toBe(1)
    expect(result.usedFallback).toBe(false)
    expect(primary).toHaveBeenCalledTimes(1)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('falha retriable na 1ª, sucesso na 2ª → attemptsUsed: 2', async () => {
    const primary = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce('ok')

    const promise = retryWithFallback(primary, null, { baseDelayMs: 10 })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.data).toBe('ok')
    expect(result.attemptsUsed).toBe(2)
    expect(result.usedFallback).toBe(false)
    expect(primary).toHaveBeenCalledTimes(2)
  })

  it('após maxAttempts/2 falhas → tenta fallbackFn, usedFallback: true', async () => {
    // maxAttempts=4, então fallback ativa após 2 falhas do primary.
    const primary = vi.fn().mockRejectedValue({ status: 429 })
    const fallback = vi.fn().mockResolvedValue('fallback-ok')

    const promise = retryWithFallback(primary, fallback, {
      maxAttempts: 4,
      baseDelayMs: 10,
    })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.data).toBe('fallback-ok')
    expect(result.usedFallback).toBe(true)
    // primary deve ter sido chamado 2 vezes (maxAttempts/2), fallback ao menos 1
    expect(primary).toHaveBeenCalledTimes(2)
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('sem fallbackFn → segue tentando primary até maxAttempts', async () => {
    const primary = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce('ok')

    const promise = retryWithFallback(primary, null, {
      maxAttempts: 5,
      baseDelayMs: 10,
    })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.data).toBe('ok')
    expect(result.attemptsUsed).toBe(3)
    expect(primary).toHaveBeenCalledTimes(3)
  })

  it('esgotou attempts → retorna { error, attemptsUsed: maxAttempts }', async () => {
    const err = { status: 503 }
    const primary = vi.fn().mockRejectedValue(err)

    const promise = retryWithFallback(primary, null, {
      maxAttempts: 3,
      baseDelayMs: 10,
    })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.data).toBeUndefined()
    expect(result.error).toBe(err)
    expect(result.attemptsUsed).toBe(3)
    expect(result.usedFallback).toBe(false)
    expect(primary).toHaveBeenCalledTimes(3)
  })

  it('erro não-retriable → propaga sem retry', async () => {
    const err = { status: 400, message: 'bad request' }
    const primary = vi.fn().mockRejectedValue(err)

    const promise = retryWithFallback(primary, null, { baseDelayMs: 10 })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.error).toBe(err)
    expect(result.attemptsUsed).toBe(1)
    expect(primary).toHaveBeenCalledTimes(1)
  })

  it('backoff exponencial: totalLatencyMs >= sum(delays previstos)', async () => {
    const primary = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce('ok')

    const baseDelayMs = 100
    const maxDelayMs = 5000

    const promise = retryWithFallback(primary, null, {
      maxAttempts: 3,
      baseDelayMs,
      maxDelayMs,
    })
    await vi.runAllTimersAsync()
    const result = await promise

    // delays: attempt1 falha → wait baseDelayMs * 2^0 = 100ms
    //         attempt2 falha → wait baseDelayMs * 2^1 = 200ms
    //         attempt3 sucesso
    const expectedMin = 100 + 200
    expect(result.data).toBe('ok')
    expect(result.totalLatencyMs).toBeGreaterThanOrEqual(expectedMin)
  })
})
