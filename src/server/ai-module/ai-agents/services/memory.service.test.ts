/**
 * memory.service — unit tests (RT-09: TTL no histórico de sessão)
 *
 * Invariante crítica: após persistir um turno na short-memory, a chave do
 * histórico SEMPRE tem TTL positivo (> 0). RPUSH + EXPIRE precisam rodar no
 * mesmo pipeline atômico — um EXPIRE separado podia se perder e deixar a chave
 * imortal (memory leak no Redis).
 *
 * Rodar:
 *   npx vitest run src/server/ai-module/ai-agents/services/memory.service.test.ts
 */

import { describe, it, expect, vi } from 'vitest'
import type { Redis } from 'ioredis'
import { pushToShortMemory } from './memory.service'

const SHORT_MEMORY_PREFIX = 'agent:memory:short:'
const SHORT_MEMORY_TTL = 86400 // 24h

// ---------------------------------------------------------------------------
// Fake Redis que captura os comandos do pipeline (RPUSH/EXPIRE) e simula um
// store de TTL por chave, para assertar a invariante TTL > 0.
// ---------------------------------------------------------------------------

interface PipelineCommand {
  cmd: 'rpush' | 'expire'
  key: string
  arg: string | number
}

function buildRedisWithPipeline() {
  const commands: PipelineCommand[] = []
  const ttlByKey = new Map<string, number>()

  const pipeline = {
    rpush(key: string, value: string) {
      commands.push({ cmd: 'rpush', key, arg: value })
      return this
    },
    expire(key: string, seconds: number) {
      commands.push({ cmd: 'expire', key, arg: seconds })
      return this
    },
    async exec() {
      // Aplica TTL apenas no exec() — modela a atomicidade do pipeline:
      // os comandos só "valem" quando o pipeline é executado.
      for (const c of commands) {
        if (c.cmd === 'expire') {
          ttlByKey.set(c.key, c.arg as number)
        }
      }
      return commands.map(() => [null, 'OK'])
    },
  }

  const redis = {
    pipeline: vi.fn(() => pipeline),
  } as unknown as Redis

  return { redis, commands, ttlByKey }
}

// ---------------------------------------------------------------------------
// pushToShortMemory — invariante de TTL
// ---------------------------------------------------------------------------

describe('pushToShortMemory — RT-09 TTL invariant', () => {
  it('1. após persistir um turno, a chave do histórico tem TTL positivo (> 0)', async () => {
    const { redis, ttlByKey } = buildRedisWithPipeline()
    const sessionId = 'sess-ttl-1'
    const key = `${SHORT_MEMORY_PREFIX}${sessionId}`

    await pushToShortMemory(redis, sessionId, {
      role: 'user',
      content: 'olá',
    })

    const ttl = ttlByKey.get(key)
    expect(ttl).toBeDefined()
    expect(ttl as number).toBeGreaterThan(0)
    expect(ttl).toBe(SHORT_MEMORY_TTL)
  })

  it('2. RPUSH e EXPIRE rodam no MESMO pipeline (atômico, não comandos soltos)', async () => {
    const { redis, commands } = buildRedisWithPipeline()
    const sessionId = 'sess-ttl-2'
    const key = `${SHORT_MEMORY_PREFIX}${sessionId}`

    await pushToShortMemory(redis, sessionId, {
      role: 'assistant',
      content: 'resposta',
    })

    // pipeline() chamado exatamente uma vez e os dois comandos enfileirados nele.
    expect(redis.pipeline).toHaveBeenCalledOnce()
    expect(commands).toEqual([
      { cmd: 'rpush', key, arg: expect.any(String) },
      { cmd: 'expire', key, arg: SHORT_MEMORY_TTL },
    ])
  })

  it('3. o EXPIRE referencia a MESMA chave do RPUSH (não vaza)', async () => {
    const { redis, commands } = buildRedisWithPipeline()
    const sessionId = 'sess-ttl-3'

    await pushToShortMemory(redis, sessionId, {
      role: 'user',
      content: 'mensagem',
    })

    const rpush = commands.find((c) => c.cmd === 'rpush')
    const expire = commands.find((c) => c.cmd === 'expire')
    expect(rpush).toBeDefined()
    expect(expire).toBeDefined()
    expect(expire?.key).toBe(rpush?.key)
  })
})
