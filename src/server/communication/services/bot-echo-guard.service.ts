/**
 * bot-echo-guard — protege o pipeline de webhooks contra reprocessar mensagens
 * que o próprio bot enviou (echo via webhook OUT do Chatwoot/UAZ).
 *
 * Chave Redis: `quayer:bot_msg:{organizationId}:{externalMessageId}` (tenant-isolated).
 * Valor: `'1'` (presença = é bot echo).
 * TTL default: 120s — janela suficiente para o echo voltar do webhook.
 *
 * Fail-safe: erros de Redis NÃO propagam. `markBotMessage` retorna `false` em
 * erro; `isBotEcho` retorna `false` (assume não-eco) para não bloquear mensagens
 * reais por falha de infra — duplo-processamento é menos pior que perder
 * mensagem real do usuário.
 */

import { getRedis } from '@/server/services/redis';

const DEFAULT_TTL_SECONDS = 120;

/** Constrói a chave Redis tenant-isolated. */
function buildKey(organizationId: string, externalMessageId: string): string {
  return `quayer:bot_msg:${organizationId}:${externalMessageId}`;
}

/** Marca uma mensagem como originada pelo bot. Retorna `true` se gravou no Redis. */
export async function markBotMessage(
  organizationId: string,
  externalMessageId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<boolean> {
  if (!organizationId || !externalMessageId) {
    return false;
  }

  try {
    const redis = getRedis();
    await redis.set(buildKey(organizationId, externalMessageId), '1', 'EX', ttlSeconds);
    return true;
  } catch (err) {
    console.warn('[bot-echo-guard] markBotMessage failed:', (err as Error).message);
    return false;
  }
}

/** Retorna `true` se a mensagem foi previamente marcada como bot echo. */
export async function isBotEcho(
  organizationId: string,
  externalMessageId: string,
): Promise<boolean> {
  if (!organizationId || !externalMessageId) {
    return false;
  }

  try {
    const redis = getRedis();
    const value = await redis.get(buildKey(organizationId, externalMessageId));
    return value === '1';
  } catch (err) {
    console.warn('[bot-echo-guard] isBotEcho failed:', (err as Error).message);
    return false;
  }
}

/**
 * Marca múltiplas mensagens em batch. Continua mesmo se um id falhar.
 * Retorna a contagem de sucessos.
 */
export async function markBotMessages(
  organizationId: string,
  externalMessageIds: string[],
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<number> {
  if (!organizationId || externalMessageIds.length === 0) {
    return 0;
  }

  const results = await Promise.all(
    externalMessageIds.map((id) => markBotMessage(organizationId, id, ttlSeconds)),
  );

  return results.filter((ok) => ok === true).length;
}
