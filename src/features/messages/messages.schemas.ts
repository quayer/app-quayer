/**
 * Messages Feature - Zod Schemas
 * Schemas de validação para mensagens e chats
 */

import { z } from 'zod';

// Schema para listar chats
export const listChatsSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  limit: z.number().int().positive().max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
  search: z.string().optional(),
  status: z.enum(['all', 'unread', 'groups', 'pinned']).optional(),
});

// Schema para buscar mensagens de um chat
export const listMessagesSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: z.string().min(1, 'Chat ID é obrigatório'),
  limit: z.number().int().positive().max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});

// Schema para enviar mensagem de texto
export const sendTextMessageSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: z.string().min(1, 'Chat ID é obrigatório'),
  text: z.string().min(1, 'Mensagem não pode ser vazia').max(4096),
  quotedMessageId: z.string().optional(),
});

// Schema para enviar imagem
export const sendImageSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: z.string().min(1, 'Chat ID é obrigatório'),
  imageUrl: z.string().url('URL da imagem inválida'),
  caption: z.string().max(1024).optional(),
  quotedMessageId: z.string().optional(),
});

// Schema para enviar arquivo
export const sendFileSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: z.string().min(1, 'Chat ID é obrigatório'),
  fileUrl: z.string().url('URL do arquivo inválida'),
  fileName: z.string().min(1, 'Nome do arquivo é obrigatório'),
  caption: z.string().max(1024).optional(),
  quotedMessageId: z.string().optional(),
});

// Schema para marcar mensagem como lida
export const markAsReadSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: z.string().min(1, 'Chat ID é obrigatório'),
});

export type ListChatsInput = z.infer<typeof listChatsSchema>;
export type ListMessagesInput = z.infer<typeof listMessagesSchema>;
export type SendTextMessageInput = z.infer<typeof sendTextMessageSchema>;
export type SendImageInput = z.infer<typeof sendImageSchema>;
export type SendFileInput = z.infer<typeof sendFileSchema>;
export type MarkAsReadInput = z.infer<typeof markAsReadSchema>;
