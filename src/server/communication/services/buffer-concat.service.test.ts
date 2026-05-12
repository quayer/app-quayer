/**
 * buffer-concat — TDD
 *
 * Rodar:
 *   npx vitest run src/server/communication/services/buffer-concat.service.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Redis } from 'ioredis';
import {
  processBuffer,
  clearAgentMemory,
  type BufferMessage,
} from './buffer-concat.service';

/** Mock mínimo do ioredis com os métodos que o serviço chama. */
type RedisMock = {
  lpush: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  lrange: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

function makeRedisMock(): RedisMock {
  return {
    lpush: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    lrange: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
  };
}

const asRedis = (m: RedisMock): Redis => m as unknown as Redis;

describe('processBuffer', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('1. redis null → passthrough shouldProcess=true, mensagemFinal=messageText', async () => {
    const result = await processBuffer(null, 'sess-1', '  olá  mundo  ', 'msg-1');

    expect(result.shouldProcess).toBe(true);
    expect(result.mensagemFinal).toBe('olá mundo');
    expect(result.mensagemOriginal).toBe('  olá  mundo  ');
    expect(result.totalMensagens).toBe(1);
  });

  it('2. primeira mensagem do session (buffer vazio antes) — aguarda timeout e processa só a sua', async () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);

    const redis = makeRedisMock();
    // Só nossa mensagem no buffer, timestamp = agora.
    const entry: BufferMessage = { content: 'oi', messageId: 'msg-a', timestamp: t0 };
    redis.lrange.mockResolvedValueOnce([JSON.stringify(entry)]);
    // Após o sleep, ainda só a nossa.
    redis.lrange.mockResolvedValueOnce([JSON.stringify(entry)]);

    const promise = processBuffer(asRedis(redis), 'sess-2', 'oi', 'msg-a', 2);

    // Avança o relógio para liberar o setTimeout interno (~2000ms).
    await vi.advanceTimersByTimeAsync(2_500);

    const result = await promise;
    expect(result.shouldProcess).toBe(true);
    expect(result.mensagemFinal).toBe('oi');
    expect(result.totalMensagens).toBe(1);
    expect(redis.del).toHaveBeenCalledWith('buffer:sess-2');
  });

  it('3. mensagem que NÃO é a primeira do buffer → shouldProcess=false, reason NOT_FIRST_MESSAGE', async () => {
    const redis = makeRedisMock();
    const t0 = Date.now();
    const older: BufferMessage = { content: 'oi', messageId: 'msg-older', timestamp: t0 - 1000 };
    const ours: BufferMessage = { content: 'tudo bem?', messageId: 'msg-ours', timestamp: t0 };
    // Após LPUSH (ours, depois older — LPUSH inverte), reverse coloca older em [0].
    redis.lrange.mockResolvedValueOnce([JSON.stringify(ours), JSON.stringify(older)]);

    const result = await processBuffer(asRedis(redis), 'sess-3', 'tudo bem?', 'msg-ours');

    expect(result.shouldProcess).toBe(false);
    expect(result.reason).toBe('NOT_FIRST_MESSAGE');
    expect(result.totalMensagens).toBe(2);
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('4. 3 mensagens rápidas: primeira aguarda e concatena todas com \\n', async () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);

    const redis = makeRedisMock();
    const m1: BufferMessage = { content: 'oi', messageId: 'm1', timestamp: t0 };
    const m2: BufferMessage = { content: 'quero', messageId: 'm2', timestamp: t0 + 500 };
    const m3: BufferMessage = { content: 'saber o preço', messageId: 'm3', timestamp: t0 + 1_000 };

    // 1º LRANGE (logo após push da m1): só m1 no buffer (LPUSH = [m1]).
    redis.lrange.mockResolvedValueOnce([JSON.stringify(m1)]);
    // 2º LRANGE (após sleep): m1+m2+m3 já entraram; LPUSH inverte então a lista bruta é [m3, m2, m1].
    redis.lrange.mockResolvedValueOnce([
      JSON.stringify(m3),
      JSON.stringify(m2),
      JSON.stringify(m1),
    ]);

    const promise = processBuffer(asRedis(redis), 'sess-4', 'oi', 'm1', 3);

    // Sleep esperado: ~3000ms. Avança mais para garantir.
    await vi.advanceTimersByTimeAsync(3_500);

    const result = await promise;

    expect(result.shouldProcess).toBe(true);
    expect(result.totalMensagens).toBe(3);
    expect(result.mensagemFinal).toBe('oi\nquero\nsaber o preço');
    expect(result.mensagemOriginal).toBe('oi\nquero\nsaber o preço');
    expect(redis.del).toHaveBeenCalledWith('buffer:sess-4');
  });

  it('5. após timeout, buffer é deletado (redis.del chamado com chave correta)', async () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);

    const redis = makeRedisMock();
    const entry: BufferMessage = { content: 'oi', messageId: 'msg-5', timestamp: t0 };
    redis.lrange.mockResolvedValueOnce([JSON.stringify(entry)]);
    redis.lrange.mockResolvedValueOnce([JSON.stringify(entry)]);

    const promise = processBuffer(asRedis(redis), 'sess-5', 'oi', 'msg-5', 1);
    await vi.advanceTimersByTimeAsync(1_200);
    await promise;

    expect(redis.del).toHaveBeenCalledTimes(1);
    expect(redis.del).toHaveBeenCalledWith('buffer:sess-5');
  });

  it('6. TTL 300 aplicado no push (redis.expire chamado com 300)', async () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);

    const redis = makeRedisMock();
    const entry: BufferMessage = { content: 'oi', messageId: 'msg-6', timestamp: t0 };
    redis.lrange.mockResolvedValueOnce([JSON.stringify(entry)]);
    redis.lrange.mockResolvedValueOnce([JSON.stringify(entry)]);

    const promise = processBuffer(asRedis(redis), 'sess-6', 'oi', 'msg-6', 1);
    await vi.advanceTimersByTimeAsync(1_200);
    await promise;

    expect(redis.expire).toHaveBeenCalledWith('buffer:sess-6', 300);
    expect(redis.lpush).toHaveBeenCalledWith(
      'buffer:sess-6',
      expect.stringContaining('"messageId":"msg-6"'),
    );
  });

  it('7. mensagemFinal concatenada é limpa (espaços colapsados)', async () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);

    const redis = makeRedisMock();
    const m1: BufferMessage = { content: '  oi   ', messageId: 'm1', timestamp: t0 };
    const m2: BufferMessage = { content: '  tudo bem?  ', messageId: 'm2', timestamp: t0 + 100 };

    redis.lrange.mockResolvedValueOnce([JSON.stringify(m1)]);
    redis.lrange.mockResolvedValueOnce([JSON.stringify(m2), JSON.stringify(m1)]);

    const promise = processBuffer(asRedis(redis), 'sess-7', '  oi   ', 'm1', 1);
    await vi.advanceTimersByTimeAsync(1_500);
    const result = await promise;

    expect(result.shouldProcess).toBe(true);
    expect(result.mensagemFinal).toBe('oi\ntudo bem?');
  });

  it('8. default bufferTimeoutSeconds = 8 quando não passado', async () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);

    const redis = makeRedisMock();
    const entry: BufferMessage = { content: 'oi', messageId: 'msg-8', timestamp: t0 };
    redis.lrange.mockResolvedValueOnce([JSON.stringify(entry)]);
    redis.lrange.mockResolvedValueOnce([JSON.stringify(entry)]);

    const promise = processBuffer(asRedis(redis), 'sess-8', 'oi', 'msg-8');

    // 7s não deve ser suficiente — promise ainda pendente.
    await vi.advanceTimersByTimeAsync(7_000);
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    // Microtask flush.
    await Promise.resolve();
    expect(settled).toBe(false);

    // Restante para fechar a janela de 8s.
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;
    expect(result.shouldProcess).toBe(true);
  });

  it('9. JSON parse error em entry do buffer → ignora entry, segue com as outras', async () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);

    const redis = makeRedisMock();
    const m1: BufferMessage = { content: 'oi', messageId: 'm1', timestamp: t0 };
    const m2: BufferMessage = { content: 'tudo?', messageId: 'm2', timestamp: t0 + 200 };

    // Primeiro LRANGE: só m1 (válido).
    redis.lrange.mockResolvedValueOnce([JSON.stringify(m1)]);
    // Segundo LRANGE: entry corrompida no meio + m2 + m1.
    redis.lrange.mockResolvedValueOnce([
      JSON.stringify(m2),
      'lixo-nao-json-{',
      JSON.stringify(m1),
    ]);

    const promise = processBuffer(asRedis(redis), 'sess-9', 'oi', 'm1', 1);
    await vi.advanceTimersByTimeAsync(1_500);
    const result = await promise;

    expect(result.shouldProcess).toBe(true);
    expect(result.totalMensagens).toBe(2);
    expect(result.mensagemFinal).toBe('oi\ntudo?');
  });

  it('extra: após sleep, outra mensagem assumiu como primeira → NOT_FIRST_MESSAGE_AFTER_WAIT', async () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);

    const redis = makeRedisMock();
    const ours: BufferMessage = { content: 'oi', messageId: 'msg-ours', timestamp: t0 };
    const intruder: BufferMessage = {
      content: 'mais antiga',
      messageId: 'msg-intruder',
      timestamp: t0 - 5_000,
    };

    // 1º LRANGE: só a nossa. Somos a primeira → aguardamos.
    redis.lrange.mockResolvedValueOnce([JSON.stringify(ours)]);
    // 2º LRANGE: alguém com timestamp anterior virou primeira (cenário concorrente).
    redis.lrange.mockResolvedValueOnce([
      JSON.stringify(ours),
      JSON.stringify(intruder),
    ]);

    const promise = processBuffer(asRedis(redis), 'sess-x', 'oi', 'msg-ours', 1);
    await vi.advanceTimersByTimeAsync(1_500);
    const result = await promise;

    expect(result.shouldProcess).toBe(false);
    expect(result.reason).toBe('NOT_FIRST_MESSAGE_AFTER_WAIT');
    expect(redis.del).not.toHaveBeenCalled();
  });
});

describe('clearAgentMemory', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('10. chama redis.del na chave correta memory:agent:{sessionId}', async () => {
    const redis = makeRedisMock();
    redis.del.mockResolvedValueOnce(1);

    const ok = await clearAgentMemory(asRedis(redis), 'sess-mem');

    expect(ok).toBe(true);
    expect(redis.del).toHaveBeenCalledWith('memory:agent:sess-mem');
  });

  it('clearAgentMemory: redis null → retorna false', async () => {
    const ok = await clearAgentMemory(null, 'sess-z');
    expect(ok).toBe(false);
  });

  it('clearAgentMemory: sessionId vazio → retorna false', async () => {
    const redis = makeRedisMock();
    const ok = await clearAgentMemory(asRedis(redis), '');
    expect(ok).toBe(false);
    expect(redis.del).not.toHaveBeenCalled();
  });
});
