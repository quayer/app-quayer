/**
 * Unit tests do server-config (validação Zod das envs de serviço).
 *
 *  - Lê APIFY_TOKEN / TAVILY_API_KEY de process.env (undefined quando ausente).
 *  - APIFY_INSTAGRAM_ACTOR_ID tem default e é sobrescrevível por env.
 *  - Relê a cada chamada (sem memoizar) — mudança de env reflete na hora.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { getServerConfig } from './server-config'

const KEYS = [
  'APIFY_TOKEN',
  'TAVILY_API_KEY',
  'APIFY_INSTAGRAM_ACTOR_ID',
  'RAG_TOP_K',
  'RAG_THRESHOLD',
  'RAG_OVER_FETCH',
] as const

describe('getServerConfig', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('expõe APIFY_TOKEN/TAVILY_API_KEY como undefined quando ausentes', () => {
    const cfg = getServerConfig()
    expect(cfg.APIFY_TOKEN).toBeUndefined()
    expect(cfg.TAVILY_API_KEY).toBeUndefined()
  })

  it('aplica o default do actor de Instagram quando a env está ausente', () => {
    expect(getServerConfig().APIFY_INSTAGRAM_ACTOR_ID).toBe(
      'apify~instagram-profile-scraper',
    )
  })

  it('aplica os defaults de RAG quando as envs estão ausentes', () => {
    const cfg = getServerConfig()
    expect(cfg.RAG_TOP_K).toBe(5)
    // 0.4: recalibrado — 0.75 filtrava tudo com text-embedding-3 (ver server-config.ts)
    expect(cfg.RAG_THRESHOLD).toBe(0.4)
    expect(cfg.RAG_OVER_FETCH).toBe(12)
  })

  it('coerce os hiperparâmetros de RAG vindos como string da env', () => {
    process.env.RAG_TOP_K = '8'
    process.env.RAG_THRESHOLD = '0.6'
    process.env.RAG_OVER_FETCH = '40'
    const cfg = getServerConfig()
    expect(cfg.RAG_TOP_K).toBe(8)
    expect(cfg.RAG_THRESHOLD).toBe(0.6)
    expect(cfg.RAG_OVER_FETCH).toBe(40)
  })

  it('lê os valores de process.env e reflete mudanças em runtime (sem memoizar)', () => {
    process.env.APIFY_TOKEN = 'apify-xyz'
    process.env.TAVILY_API_KEY = 'tvly-abc'
    process.env.APIFY_INSTAGRAM_ACTOR_ID = 'apify~custom-actor'

    const cfg = getServerConfig()
    expect(cfg.APIFY_TOKEN).toBe('apify-xyz')
    expect(cfg.TAVILY_API_KEY).toBe('tvly-abc')
    expect(cfg.APIFY_INSTAGRAM_ACTOR_ID).toBe('apify~custom-actor')

    delete process.env.APIFY_TOKEN
    expect(getServerConfig().APIFY_TOKEN).toBeUndefined()
  })
})
