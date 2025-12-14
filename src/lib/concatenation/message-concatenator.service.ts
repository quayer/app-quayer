/**
 * Message Concatenator Service
 *
 * Agrupa múltiplas mensagens enviadas rapidamente em uma única mensagem
 * para melhor experiência de leitura e organização.
 *
 * Regras de Concatenação:
 * - Timeout: 5-8 segundos entre mensagens
 * - Mesmo sender
 * - Mesmo tipo (texto com texto, não áudio com texto)
 * - Limite: 10 mensagens por bloco
 * - Mesma sessão ativa
 */

import { database } from '@/services/database';
import { redis } from '@/services/redis';
import { logger } from '@/services/logger';

// ============================================
// TIPOS
// ============================================

interface ConcatenationConfig {
  timeoutMs: number; // Tempo máximo entre mensagens (padrão: 6000ms)
  maxMessages: number; // Máximo de mensagens por bloco (padrão: 10)
  sameSenderOnly: boolean; // Apenas mesmo remetente (padrão: true)
  sameTypeOnly: boolean; // Apenas mesmo tipo (padrão: true)
}

interface MessageBlock {
  messages: Array<{
    id: string;
    content: string;
    timestamp: Date;
    type: string;
  }>;
  sender: string;
  sessionId: string;
  firstMessageAt: Date;
  lastMessageAt: Date;
  count: number;
}

// ============================================
// MESSAGE CONCATENATOR SERVICE
// ============================================

class MessageConcatenatorService {
  private config: ConcatenationConfig;

  constructor() {
    this.config = {
      timeoutMs: parseInt(process.env.MESSAGE_CONCAT_TIMEOUT || '6000', 10), // 6s
      maxMessages: parseInt(process.env.MESSAGE_CONCAT_MAX || '10', 10),
      sameSenderOnly: process.env.MESSAGE_CONCAT_SAME_SENDER !== 'false',
      sameTypeOnly: process.env.MESSAGE_CONCAT_SAME_TYPE !== 'false',
    };
  }

  // ==========================================
  // VERIFICAÇÃO DE CONCATENAÇÃO
  // ==========================================

  /**
   * Verifica se mensagem deve ser concatenada com bloco existente
   */
  async shouldConcatenate(params: {
    sender: string;
    sessionId: string;
    messageType: string;
  }): Promise<{ shouldConcat: boolean; blockId?: string }> {
    try {
      // Buscar bloco ativo para este sender/sessão
      const blockKey = this.getBlockKey(params.sender, params.sessionId);
      const block = await this.getActiveBlock(blockKey);

      if (!block) {
        return { shouldConcat: false };
      }

      // Verificar se passou do timeout
      const timeSinceLastMessage = Date.now() - block.lastMessageAt.getTime();
      if (timeSinceLastMessage > this.config.timeoutMs) {
        // Timeout expirado → Finalizar bloco anterior e começar novo
        await this.finalizeBlock(blockKey, block);
        return { shouldConcat: false };
      }

      // Verificar se chegou no limite de mensagens
      if (block.count >= this.config.maxMessages) {
        // Limite atingido → Finalizar e começar novo
        await this.finalizeBlock(blockKey, block);
        return { shouldConcat: false };
      }

      // Verificar se é o mesmo tipo (se configurado)
      if (this.config.sameTypeOnly) {
        const lastType = block.messages[block.messages.length - 1].type;
        if (lastType !== params.messageType) {
          // Tipo diferente → Finalizar e começar novo
          await this.finalizeBlock(blockKey, block);
          return { shouldConcat: false };
        }
      }

      // ✅ Pode concatenar!
      return {
        shouldConcat: true,
        blockId: blockKey,
      };
    } catch (error) {
      logger.error('[MessageConcatenator] Erro ao verificar concatenação', {
        error,
        sender: params.sender,
      });
      return { shouldConcat: false };
    }
  }

  // ==========================================
  // ADICIONAR MENSAGEM AO BLOCO
  // ==========================================

  /**
   * Adiciona mensagem ao bloco de concatenação
   */
  async addToBlock(params: {
    blockId?: string;
    sender: string;
    sessionId: string;
    message: {
      id: string;
      content: string;
      type: string;
      timestamp: Date;
    };
  }): Promise<void> {
    try {
      const blockKey = params.blockId || this.getBlockKey(params.sender, params.sessionId);

      // Buscar ou criar bloco
      let block = await this.getActiveBlock(blockKey);

      if (!block) {
        // Criar novo bloco
        block = {
          messages: [],
          sender: params.sender,
          sessionId: params.sessionId,
          firstMessageAt: params.message.timestamp,
          lastMessageAt: params.message.timestamp,
          count: 0,
        };
      }

      // Adicionar mensagem ao bloco
      block.messages.push({
        id: params.message.id,
        content: params.message.content,
        timestamp: params.message.timestamp,
        type: params.message.type,
      });
      block.lastMessageAt = params.message.timestamp;
      block.count++;

      // Salvar bloco atualizado
      await this.saveBlock(blockKey, block);

      // Agendar timer para finalizar bloco após timeout
      await this.scheduleBlockFinalization(blockKey, this.config.timeoutMs);

      logger.debug('[MessageConcatenator] Mensagem adicionada ao bloco', {
        blockId: blockKey,
        count: block.count,
        sender: params.sender,
      });
    } catch (error) {
      logger.error('[MessageConcatenator] Erro ao adicionar mensagem ao bloco', {
        error,
        sender: params.sender,
      });
    }
  }

  // ==========================================
  // FINALIZAR BLOCO
  // ==========================================

  /**
   * Finaliza bloco e cria mensagem concatenada
   */
  async finalizeBlock(blockKey: string, block: MessageBlock): Promise<void> {
    try {
      // Se tem apenas 1 mensagem, não precisa concatenar
      if (block.count <= 1) {
        await this.deleteBlock(blockKey);
        return;
      }

      logger.info('[MessageConcatenator] Finalizando bloco', {
        blockId: blockKey,
        count: block.count,
        sender: block.sender,
      });

      // Concatenar mensagens
      const concatenatedContent = block.messages
        .map((msg, index) => {
          const time = msg.timestamp.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          });
          return `[${time}] ${msg.content}`;
        })
        .join('\n\n');

      // Buscar sessão com contato e conexão
      const session = await database.chatSession.findUnique({
        where: { id: block.sessionId },
        include: { contact: true },
      });

      if (!session || !session.contactId || !session.connectionId) {
        logger.warn('[MessageConcatenator] Sessão não encontrada ou incompleta', {
          sessionId: block.sessionId,
        });
        await this.deleteBlock(blockKey);
        return;
      }

      // Gerar waMessageId único para mensagem concatenada
      const waMessageId = `concat_${block.sessionId}_${Date.now()}`;

      // Criar mensagem concatenada
      await database.message.create({
        data: {
          sessionId: block.sessionId,
          contactId: session.contactId,
          connectionId: session.connectionId,
          waMessageId,
          type: 'text',
          direction: 'INBOUND',
          author: 'CUSTOMER',
          content: concatenatedContent,
          status: 'delivered',
          isConcatenated: true,
          concatGroupId: blockKey,
        },
      });

      logger.info('[MessageConcatenator] Mensagem concatenada criada', {
        blockId: blockKey,
        originalCount: block.count,
        sender: block.sender,
      });

      // Deletar bloco
      await this.deleteBlock(blockKey);
    } catch (error) {
      logger.error('[MessageConcatenator] Erro ao finalizar bloco', {
        error,
        blockKey,
      });
    }
  }

  // ==========================================
  // HELPERS REDIS
  // ==========================================

  private getBlockKey(sender: string, sessionId: string): string {
    return `concat:block:${sessionId}:${sender}`;
  }

  private async getActiveBlock(blockKey: string): Promise<MessageBlock | null> {
    try {
      const data = await redis.get(blockKey);
      if (!data) return null;

      const block = JSON.parse(data);
      // Converter strings de data para Date objects
      block.firstMessageAt = new Date(block.firstMessageAt);
      block.lastMessageAt = new Date(block.lastMessageAt);
      block.messages = block.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));

      return block;
    } catch (error) {
      logger.error('[MessageConcatenator] Erro ao buscar bloco', { error, blockKey });
      return null;
    }
  }

  private async saveBlock(blockKey: string, block: MessageBlock): Promise<void> {
    try {
      // TTL: timeout + 60s de margem
      const ttl = Math.ceil(this.config.timeoutMs / 1000) + 60;
      await redis.setex(blockKey, ttl, JSON.stringify(block));
    } catch (error) {
      logger.error('[MessageConcatenator] Erro ao salvar bloco', { error, blockKey });
    }
  }

  private async deleteBlock(blockKey: string): Promise<void> {
    try {
      await redis.del(blockKey);
    } catch (error) {
      logger.error('[MessageConcatenator] Erro ao deletar bloco', { error, blockKey });
    }
  }

  private async scheduleBlockFinalization(blockKey: string, timeoutMs: number): Promise<void> {
    // Criar job no BullMQ para finalizar bloco após timeout
    // Por simplicidade, vamos usar setTimeout (em produção, usar BullMQ)
    setTimeout(async () => {
      const block = await this.getActiveBlock(blockKey);
      if (block) {
        const timeSinceLastMessage = Date.now() - block.lastMessageAt.getTime();
        if (timeSinceLastMessage >= this.config.timeoutMs) {
          await this.finalizeBlock(blockKey, block);
        }
      }
    }, timeoutMs);
  }
}

// Singleton instance
export const messageConcatenator = new MessageConcatenatorService();
