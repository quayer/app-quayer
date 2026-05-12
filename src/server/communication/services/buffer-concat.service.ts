/**
 * buffer-concat — concatena mensagens fragmentadas do WhatsApp em uma única
 * resposta. Cliente tende a mandar "oi" / "quero" / "saber o preço" como 3
 * mensagens separadas; sem buffer o agente responderia 3x. Aqui agrupamos
 * dentro de uma janela (default 8s) e a primeira mensagem aguarda as demais
 * antes de processar.
 *
 * Chave Redis: `buffer:{sessionId}` (lista RPUSH/LPUSH com JSON; TTL 300s).
 * Memória do agente: `memory:agent:{sessionId}` (limpa explicitamente).
 *
 * Fail-safe: erro de Redis ou cliente null → passthrough (shouldProcess=true,
 * mensagemFinal=messageText). Nunca bloquear mensagem real do usuário.
 *
 * Referência: produto-granvinhas/supabase/edge-functions/process-message/services/buffer.ts
 */

import type { Redis } from 'ioredis';

const DEFAULT_BUFFER_TIMEOUT_SECONDS = 8;
const BUFFER_TTL_SECONDS = 300;

export interface BufferMessage {
  content: string;
  messageId: string;
  timestamp: number;
}

export interface BufferResult {
  shouldProcess: boolean;
  mensagemFinal: string;
  mensagemOriginal: string;
  totalMensagens: number;
  reason?: string;
}

/** Limpa espaços em excesso preservando quebras de linha entre fragmentos. */
function limparMensagem(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
}

function bufferKey(sessionId: string): string {
  return `buffer:${sessionId}`;
}

function memoryKey(sessionId: string): string {
  return `memory:agent:${sessionId}`;
}

function parseEntries(raw: string[]): BufferMessage[] {
  const out: BufferMessage[] = [];
  for (const r of raw) {
    try {
      const m = JSON.parse(r) as BufferMessage;
      if (m && typeof m.messageId === 'string' && typeof m.content === 'string') {
        out.push(m);
      }
    } catch {
      // Entry corrupto — ignora e segue.
    }
  }
  return out;
}

/**
 * Processa o buffer de mensagens de uma sessão.
 *
 * Comportamento (semântica do granvinhas):
 *   1. LPUSH da mensagem no buffer com TTL.
 *   2. LRANGE 0 -1 + reverse (LPUSH inverte).
 *   3. Se NÃO somos a primeira mensagem → shouldProcess=false (outro processo cuida).
 *   4. Se diff(now, última)<timeout → aguarda o restante, re-checa.
 *   5. Após sleep, se outra mensagem virou a primeira → shouldProcess=false.
 *   6. Concatena com `\n`, DEL buffer, shouldProcess=true.
 */
export async function processBuffer(
  redis: Redis | null,
  sessionId: string,
  messageText: string,
  messageId: string,
  bufferTimeoutSeconds: number = DEFAULT_BUFFER_TIMEOUT_SECONDS,
): Promise<BufferResult> {
  // Passthrough quando Redis indisponível.
  if (!redis) {
    return {
      shouldProcess: true,
      mensagemFinal: limparMensagem(messageText),
      mensagemOriginal: messageText,
      totalMensagens: 1,
    };
  }

  const key = bufferKey(sessionId);

  try {
    const entry: BufferMessage = {
      content: messageText,
      messageId,
      timestamp: Date.now(),
    };

    // 1. Push + TTL.
    await redis.lpush(key, JSON.stringify(entry));
    await redis.expire(key, BUFFER_TTL_SECONDS);

    // 2. Snapshot do buffer.
    const raw = await redis.lrange(key, 0, -1);
    const messages = parseEntries(raw).reverse();

    if (messages.length === 0) {
      // Push aconteceu mas LRANGE veio vazio — passthrough.
      return {
        shouldProcess: true,
        mensagemFinal: limparMensagem(messageText),
        mensagemOriginal: messageText,
        totalMensagens: 1,
      };
    }

    // 3. Só a mensagem mais antiga avança; demais cedem o turno.
    if (messages[0].messageId !== messageId) {
      return {
        shouldProcess: false,
        mensagemFinal: '',
        mensagemOriginal: messageText,
        totalMensagens: messages.length,
        reason: 'NOT_FIRST_MESSAGE',
      };
    }

    // 4. Última mensagem ainda recente — aguarda completar a janela.
    const last = messages[messages.length - 1];
    const diffSeconds = (Date.now() - last.timestamp) / 1000;

    if (diffSeconds < bufferTimeoutSeconds) {
      const waitMs = Math.ceil((bufferTimeoutSeconds - diffSeconds) * 1000);
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));

      const raw2 = await redis.lrange(key, 0, -1);
      const updated = parseEntries(raw2).reverse();

      if (updated.length === 0) {
        // Buffer expirou/foi limpo durante o sleep — processa só a nossa.
        await redis.del(key);
        return {
          shouldProcess: true,
          mensagemFinal: limparMensagem(messageText),
          mensagemOriginal: messageText,
          totalMensagens: 1,
        };
      }

      // 5. Outra mensagem assumiu como primeira.
      if (updated[0].messageId !== messageId) {
        return {
          shouldProcess: false,
          mensagemFinal: '',
          mensagemOriginal: messageText,
          totalMensagens: updated.length,
          reason: 'NOT_FIRST_MESSAGE_AFTER_WAIT',
        };
      }

      const concat = updated.map((m) => m.content).join('\n');
      await redis.del(key);
      return {
        shouldProcess: true,
        mensagemFinal: limparMensagem(concat),
        mensagemOriginal: concat,
        totalMensagens: updated.length,
      };
    }

    // 6. Janela completa — concatena agora.
    const concat = messages.map((m) => m.content).join('\n');
    await redis.del(key);
    return {
      shouldProcess: true,
      mensagemFinal: limparMensagem(concat),
      mensagemOriginal: concat,
      totalMensagens: messages.length,
    };
  } catch (err) {
    console.warn('[buffer-concat] processBuffer failed:', (err as Error).message);
    return {
      shouldProcess: true,
      mensagemFinal: limparMensagem(messageText),
      mensagemOriginal: messageText,
      totalMensagens: 1,
      reason: 'REDIS_ERROR',
    };
  }
}

/** Limpa a memória do agente para a sessão (após handover, /reset, etc.). */
export async function clearAgentMemory(
  redis: Redis | null,
  sessionId: string,
): Promise<boolean> {
  if (!redis || !sessionId) {
    return false;
  }

  try {
    const deleted = await redis.del(memoryKey(sessionId));
    return deleted > 0;
  } catch (err) {
    console.warn('[buffer-concat] clearAgentMemory failed:', (err as Error).message);
    return false;
  }
}
