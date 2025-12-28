/**
 * Messages Feature - Zod Schemas
 * Schemas de validação para mensagens e chats
 */

import { z } from 'zod';

/**
 * Validador E.164 para números de telefone
 * Aceita formatos:
 * - +5511999999999 (E.164 puro)
 * - 5511999999999 (sem +)
 * - 5511999999999@s.whatsapp.net (formato WhatsApp individual)
 * - 5511999999999-1234567890@g.us (formato WhatsApp grupo)
 */
const phoneOrChatIdSchema = z.string().min(1, 'ID do chat é obrigatório').refine(
  (value) => {
    // Remove sufixos do WhatsApp para validar
    const cleaned = value
      .replace('@s.whatsapp.net', '')
      .replace('@g.us', '')
      .replace('@broadcast', '')
      .replace(/^whatsapp:/, '')
      .replace(/^\+/, '');

    // Grupos podem ter formato diferente (com hífen)
    if (value.includes('@g.us')) {
      return /^[\d-]+$/.test(cleaned);
    }

    // Validar E.164: 7-15 dígitos
    return /^\d{7,15}$/.test(cleaned);
  },
  { message: 'Formato de telefone/chat inválido. Use formato E.164 (ex: 5511999999999)' }
);

// Schema para listar chats
export const listChatsSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  search: z.string().optional(),
  status: z.enum(['all', 'unread', 'groups', 'pinned']).optional(),
  // Novos filtros de atendimento
  attendanceType: z.enum(['all', 'ai', 'human', 'archived']).optional().default('all'),
  sessionStatus: z.enum(['QUEUED', 'ACTIVE', 'PAUSED', 'CLOSED']).optional(),
});

// Schema para listar chats de TODAS as instâncias (endpoint unificado)
export const listAllChatsSchema = z.object({
  // Opcional: filtrar por instâncias específicas (se vazio, busca todas do usuário)
  // Aceita tanto string única quanto array (query params podem vir como string)
  instanceIds: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === '') return undefined;
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
      return undefined;
    },
    z.array(z.string().uuid()).optional()
  ),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  // Cursor-based pagination (mais eficiente que offset)
  cursor: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(['all', 'unread', 'groups', 'pinned']).optional(),
  attendanceType: z.enum(['all', 'ai', 'human', 'archived']).optional().default('all'),
  sessionStatus: z.enum(['QUEUED', 'ACTIVE', 'PAUSED', 'CLOSED']).optional(),
  // Forçar sincronização com UAZapi mesmo que já existam sessões
  forceSync: z.coerce.boolean().optional().default(false),
});

// Schema para buscar mensagens de um chat
export const listMessagesSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  page: z.coerce.number().int().min(1).optional().default(1),
  sessionId: z.string().optional(), // Fallback
  chatId: z.string().optional(), // Fallback
});

// Schema para enviar mensagem de texto
export const sendTextMessageSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: phoneOrChatIdSchema,
  text: z.string().min(1, 'Mensagem não pode ser vazia').max(4096),
  quotedMessageId: z.string().optional(),
});

// Schema para enviar imagem
export const sendImageSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: phoneOrChatIdSchema,
  imageUrl: z.string().url('URL da imagem inválida'),
  caption: z.string().max(1024).optional(),
  quotedMessageId: z.string().optional(),
});

// Schema para enviar arquivo
export const sendFileSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: phoneOrChatIdSchema,
  fileUrl: z.string().url('URL do arquivo inválida'),
  fileName: z.string().min(1, 'Nome do arquivo é obrigatório'),
  caption: z.string().max(1024).optional(),
  quotedMessageId: z.string().optional(),
});

// Schema para marcar mensagem como lida
export const markAsReadSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: phoneOrChatIdSchema,
});

export type ListChatsInput = z.infer<typeof listChatsSchema>;
export type ListAllChatsInput = z.infer<typeof listAllChatsSchema>;
export type ListMessagesInput = z.infer<typeof listMessagesSchema>;
export type SendTextMessageInput = z.infer<typeof sendTextMessageSchema>;
export type SendImageInput = z.infer<typeof sendImageSchema>;
export type SendFileInput = z.infer<typeof sendFileSchema>;
export type MarkAsReadInput = z.infer<typeof markAsReadSchema>;
