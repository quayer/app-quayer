/**
 * bot-echo-guard — unit tests (TDD red phase).
 *
 * O serviço (ainda não implementado) protege o pipeline de webhooks contra
 * reprocessar mensagens que o próprio bot enviou (echo via webhook OUT do
 * Chatwoot/UAZ). Padrão inspirado em granvinhas/process-callback/services
 * /bot-echo-redis.ts, adaptado para Quayer com:
 *   - chave isolada por tenant: `quayer:bot_msg:{organizationId}:{externalMessageId}`
 *   - fail-safe: erros do Redis NÃO propagam (false em mark, false em isBotEcho
 *     — i.e. trata como "não é eco" para não bloquear mensagens reais por falha
 *     de infra; o duplo-processamento é menos pior que perder mensagem real)
 *   - default TTL 120s (janela suficiente para o echo voltar do webhook)
 *
 * Estes testes vão FALHAR ate o serviço ser implementado em
 * src/server/communication/services/bot-echo-guard.service.ts — isso é o esperado
 * no ciclo TDD (red → green → refactor).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do singleton ioredis ANTES de importar o módulo sob teste.
const setMock = vi.fn();
const getMock = vi.fn();

const redisMock = {
  set: setMock,
  get: getMock,
};

vi.mock('@/server/services/redis', () => ({
  getRedis: () => redisMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Default success behavior — testes individuais sobrescrevem quando precisam
  // simular erro ou retorno específico.
  setMock.mockResolvedValue('OK');
  getMock.mockResolvedValue(null);
});

describe('bot-echo-guard — markBotMessage', () => {
  it('chama redis.set com chave correta no formato quayer:bot_msg:{org}:{id} e TTL default 120s', async () => {
    const { markBotMessage } = await import(
      '@/server/communication/services/bot-echo-guard.service'
    );

    const result = await markBotMessage('org-123', 'msg-abc');

    expect(result).toBe(true);
    expect(setMock).toHaveBeenCalledTimes(1);
    const [key, value, exFlag, ttl] = setMock.mock.calls[0];
    expect(key).toBe('quayer:bot_msg:org-123:msg-abc');
    expect(value).toBe('1');
    expect(exFlag).toBe('EX');
    expect(ttl).toBe(120);
  });

  it('aceita TTL customizado', async () => {
    const { markBotMessage } = await import(
      '@/server/communication/services/bot-echo-guard.service'
    );

    const result = await markBotMessage('org-x', 'msg-y', 300);

    expect(result).toBe(true);
    const [, , exFlag, ttl] = setMock.mock.calls[0];
    expect(exFlag).toBe('EX');
    expect(ttl).toBe(300);
  });

  it('retorna false (fail-safe) se redis.set lança erro — não propaga exception', async () => {
    setMock.mockRejectedValueOnce(new Error('Redis connection refused'));
    const { markBotMessage } = await import(
      '@/server/communication/services/bot-echo-guard.service'
    );

    // Não pode lançar — deve capturar e retornar false.
    const result = await markBotMessage('org-1', 'msg-1');
    expect(result).toBe(false);
  });

  it('retorna false se externalMessageId é string vazia (input invalido)', async () => {
    const { markBotMessage } = await import(
      '@/server/communication/services/bot-echo-guard.service'
    );

    const result = await markBotMessage('org-1', '');
    expect(result).toBe(false);
    // Não deve nem tentar tocar no Redis com input invalido.
    expect(setMock).not.toHaveBeenCalled();
  });

  it('retorna false se organizationId é string vazia (input invalido)', async () => {
    const { markBotMessage } = await import(
      '@/server/communication/services/bot-echo-guard.service'
    );

    const result = await markBotMessage('', 'msg-1');
    expect(result).toBe(false);
    expect(setMock).not.toHaveBeenCalled();
  });
});

describe('bot-echo-guard — isBotEcho', () => {
  it('retorna true quando redis.get retorna "1"', async () => {
    getMock.mockResolvedValueOnce('1');
    const { isBotEcho } = await import(
      '@/server/communication/services/bot-echo-guard.service'
    );

    const result = await isBotEcho('org-1', 'msg-1');
    expect(result).toBe(true);
    expect(getMock).toHaveBeenCalledWith('quayer:bot_msg:org-1:msg-1');
  });

  it('retorna false quando redis.get retorna null (chave inexistente / TTL expirou)', async () => {
    getMock.mockResolvedValueOnce(null);
    const { isBotEcho } = await import(
      '@/server/communication/services/bot-echo-guard.service'
    );

    const result = await isBotEcho('org-1', 'msg-1');
    expect(result).toBe(false);
  });

  it('retorna false (fail-safe — assume não-eco) se redis.get lança erro', async () => {
    getMock.mockRejectedValueOnce(new Error('Redis read timeout'));
    const { isBotEcho } = await import(
      '@/server/communication/services/bot-echo-guard.service'
    );

    // Não pode lançar. Fail-safe: assume que NÃO é eco, mensagem flui
    // normalmente. (Risco de duplo-processamento < risco de perder mensagem
    // real do usuário por falha de infra.)
    const result = await isBotEcho('org-1', 'msg-1');
    expect(result).toBe(false);
  });

  it('usa MESMA chave que markBotMessage — round-trip cross-tenant isolation', async () => {
    // Cenário: org A marca uma mensagem, org B com mesmo externalMessageId
    // NÃO deve enxergar como eco. Garante isolamento por tenant na chave.
    const { markBotMessage, isBotEcho } = await import(
      '@/server/communication/services/bot-echo-guard.service'
    );

    await markBotMessage('org-A', 'msg-shared-id');
    const setKey = setMock.mock.calls[0][0];

    // O get para a MESMA org+id deve usar a mesma chave.
    await isBotEcho('org-A', 'msg-shared-id');
    expect(getMock).toHaveBeenCalledWith(setKey);

    // O get para outra org com mesmo id DEVE usar chave diferente.
    getMock.mockClear();
    await isBotEcho('org-B', 'msg-shared-id');
    const otherKey = getMock.mock.calls[0][0];
    expect(otherKey).not.toBe(setKey);
    expect(otherKey).toBe('quayer:bot_msg:org-B:msg-shared-id');
  });
});

describe('bot-echo-guard — markBotMessages (batch)', () => {
  it('chama markBotMessage para cada id e retorna contagem de sucessos', async () => {
    const { markBotMessages } = await import(
      '@/server/communication/services/bot-echo-guard.service'
    );

    const count = await markBotMessages('org-1', ['a', 'b', 'c']);

    expect(count).toBe(3);
    expect(setMock).toHaveBeenCalledTimes(3);
    // Verifica chaves esperadas em qualquer ordem (serial ou paralelo OK).
    const keys = setMock.mock.calls.map((c) => c[0]).sort();
    expect(keys).toEqual([
      'quayer:bot_msg:org-1:a',
      'quayer:bot_msg:org-1:b',
      'quayer:bot_msg:org-1:c',
    ]);
  });

  it('continua mesmo se um id falhar — não aborta no primeiro erro', async () => {
    // Primeira chamada falha, segunda e terceira passam.
    setMock
      .mockRejectedValueOnce(new Error('transient redis blip'))
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce('OK');

    const { markBotMessages } = await import(
      '@/server/communication/services/bot-echo-guard.service'
    );

    const count = await markBotMessages('org-1', ['fail-id', 'ok-1', 'ok-2']);

    // 2 de 3 sucessos — o erro não derruba o batch inteiro.
    expect(count).toBe(2);
    expect(setMock).toHaveBeenCalledTimes(3);
  });
});
