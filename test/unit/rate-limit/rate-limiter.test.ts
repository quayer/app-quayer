/**
 * Rate Limiter — unit tests focados em blindar contra regressão silenciosa.
 *
 * O risco principal da migração @upstash/redis → ioredis é o formato de
 * retorno do pipeline.exec(): Upstash devolve `[r1, r2, …]` (flat) e ioredis
 * devolve `[[err1, r1], [err2, r2], …]` (tuplas). Se alguém ler `results[1]`
 * em vez de `results[1][1]`, count vira NaN/array, a comparação `count >=
 * limit` sempre é falsa e o limiter deixa passar tudo (fail-open invisível).
 *
 * Os testes abaixo simulam o pipeline com formato ioredis e garantem que:
 *   1. count é parseado corretamente da tupla
 *   2. abaixo do limite → success=true
 *   3. no limite → success=false
 *   4. reset() chama del()
 *   5. sem REDIS_URL → fail-open quando NODE_ENV != production e
 *      failClosedInProduction está ativo
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock do singleton ioredis ANTES de importar o módulo sob teste.
const zremrangebyscoreMock = vi.fn();
const zcardMock = vi.fn();
const zaddMock = vi.fn();
const expireMock = vi.fn();
const execMock = vi.fn();
const delMock = vi.fn().mockResolvedValue(1);

const pipelineMock = {
  zremrangebyscore: zremrangebyscoreMock,
  zcard: zcardMock,
  zadd: zaddMock,
  expire: expireMock,
  exec: execMock,
};

const redisMock = {
  pipeline: vi.fn(() => pipelineMock),
  del: delMock,
};

vi.mock('@/server/services/redis', () => ({
  getRedis: () => redisMock,
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: chain returns this for fluent calls (não usado aqui — pipeline já
  // armazena chamadas; só resetamos contadores).
  zremrangebyscoreMock.mockReturnValue(pipelineMock);
  zcardMock.mockReturnValue(pipelineMock);
  zaddMock.mockReturnValue(pipelineMock);
  expireMock.mockReturnValue(pipelineMock);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('RateLimiter — formato ioredis pipeline.exec()', () => {
  it('parseia count da tupla [err, value] — abaixo do limite permite', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    // Formato ioredis: cada comando vira [err, result]
    execMock.mockResolvedValue([
      [null, 0],   // zremrangebyscore
      [null, 2],   // zcard → 2 requisições na janela
      [null, 1],   // zadd
      [null, 1],   // expire
    ]);

    const { RateLimiter } = await import('@/lib/rate-limit/rate-limiter');
    const rl = new RateLimiter({ limit: 5, window: 60, prefix: 'test' });
    const result = await rl.check('user-1');

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2); // limit(5) - count(2) - 1 = 2
    expect(result.limit).toBe(5);
  });

  it('bloqueia quando count atinge o limite', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    execMock.mockResolvedValue([
      [null, 0],
      [null, 5],   // count = 5 = limit
      [null, 1],
      [null, 1],
    ]);

    const { RateLimiter } = await import('@/lib/rate-limit/rate-limiter');
    const rl = new RateLimiter({ limit: 5, window: 60, prefix: 'test' });
    const result = await rl.check('user-2');

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBe(60);
  });

  it('NÃO confunde a tupla com valor flat — regressão silenciosa', async () => {
    // Se alguém regressar pra `results[1] as number`, isso retornaria
    // `[null, 999]` (array) — Number(array) = NaN. Number(NaN >= 5) = false,
    // success vira true mesmo com count "infinito". Este teste blinda.
    process.env.REDIS_URL = 'redis://localhost:6379';
    execMock.mockResolvedValue([
      [null, 0],
      [null, 999], // count enorme — DEVE bloquear
      [null, 1],
      [null, 1],
    ]);

    const { RateLimiter } = await import('@/lib/rate-limit/rate-limiter');
    const rl = new RateLimiter({ limit: 5, window: 60, prefix: 'test' });
    const result = await rl.check('user-3');

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('zadd recebe args posicionais (key, score, member) — não objeto', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    execMock.mockResolvedValue([[null, 0], [null, 0], [null, 1], [null, 1]]);

    const { RateLimiter } = await import('@/lib/rate-limit/rate-limiter');
    const rl = new RateLimiter({ limit: 10, window: 60, prefix: 'test' });
    await rl.check('user-4');

    expect(zaddMock).toHaveBeenCalledTimes(1);
    const args = zaddMock.mock.calls[0];
    expect(args[0]).toBe('test:user-4');           // key
    expect(typeof args[1]).toBe('number');         // score (timestamp ms)
    expect(typeof args[2]).toBe('string');         // member único
    // Sintaxe Upstash {score, member} produziria args.length === 2.
    expect(args.length).toBe(3);
  });

  it('reset() chama redis.del com a chave prefixada', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const { RateLimiter } = await import('@/lib/rate-limit/rate-limiter');
    const rl = new RateLimiter({ limit: 5, window: 60, prefix: 'test' });
    await rl.reset('user-5');

    expect(delMock).toHaveBeenCalledWith('test:user-5');
  });
});

describe('RateLimiter — guard de REDIS_URL', () => {
  it('sem REDIS_URL e fora de production: fail-open (deixa passar)', async () => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_APP_ENV;

    // Limpar cache de módulos para que o constructor reavalie REDIS_URL
    vi.resetModules();
    const { RateLimiter } = await import('@/lib/rate-limit/rate-limiter');
    const rl = new RateLimiter({
      limit: 5,
      window: 60,
      prefix: 'test',
      failClosedInProduction: true,
    });
    const result = await rl.check('user-6');

    expect(result.success).toBe(true); // dev sem Redis: deixa passar
  });

  it('sem REDIS_URL e em production com failClosed: fail-closed (bloqueia)', async () => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_ENV = 'production';

    vi.resetModules();
    const { RateLimiter } = await import('@/lib/rate-limit/rate-limiter');
    const rl = new RateLimiter({
      limit: 5,
      window: 60,
      prefix: 'test',
      failClosedInProduction: true,
    });
    const result = await rl.check('user-7');

    expect(result.success).toBe(false);
    expect(result.retryAfter).toBe(60);
  });

  it('em homol (NEXT_PUBLIC_APP_ENV=homol) sem Redis: NÃO bloqueia mesmo com NODE_ENV=production', async () => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_ENV = 'homol';

    vi.resetModules();
    const { RateLimiter } = await import('@/lib/rate-limit/rate-limiter');
    const rl = new RateLimiter({
      limit: 5,
      window: 60,
      prefix: 'test',
      failClosedInProduction: true,
    });
    const result = await rl.check('user-8');

    expect(result.success).toBe(true); // homol é permissivo
  });
});

describe('RateLimiter — fail-open em erro de Redis', () => {
  it('quando Redis falha, fora de production: deixa passar (fail-open)', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_APP_ENV;
    execMock.mockRejectedValue(new Error('Redis connection lost'));

    vi.resetModules();
    const { RateLimiter } = await import('@/lib/rate-limit/rate-limiter');
    const rl = new RateLimiter({
      limit: 5,
      window: 60,
      prefix: 'test',
      failClosedInProduction: true,
    });
    const result = await rl.check('user-9');

    expect(result.success).toBe(true);
  });

  it('quando Redis falha em production com failClosed: bloqueia', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    execMock.mockRejectedValue(new Error('Redis connection lost'));

    vi.resetModules();
    const { RateLimiter } = await import('@/lib/rate-limit/rate-limiter');
    const rl = new RateLimiter({
      limit: 5,
      window: 60,
      prefix: 'test',
      failClosedInProduction: true,
    });
    const result = await rl.check('user-10');

    expect(result.success).toBe(false);
  });
});
