/**
 * Messages Feature - Zod Schemas
 * Schemas de validação para mensagens e chats
 */

import { z } from 'zod';

const whatsappChatIdSchema = z.string().regex(
  /^[0-9]{1,15}@[sc]\.whatsapp\.net$|^[0-9]{1,15}-[0-9]{1,15}@g\.us$/,
  'Formato de chatId inválido'
);

const safeUrlSchema = z.string().url().refine((url) => {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    // Block internal/private IPs and metadata endpoints
    const blocked = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^0\./,
      /^\[::1\]/,
      /^fc00:/i,
      /^fe80:/i,
    ];
    return !blocked.some((re) => re.test(hostname));
  } catch {
    return false;
  }
}, { message: 'URL não permitida: endereços internos são bloqueados' });

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
  chatId: whatsappChatIdSchema,
  text: z.string().min(1, 'Mensagem não pode ser vazia').max(4096),
  quotedMessageId: z.string().optional(),
});

// Schema para enviar imagem
export const sendImageSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: whatsappChatIdSchema,
  imageUrl: safeUrlSchema,
  caption: z.string().max(1024).optional(),
  quotedMessageId: z.string().optional(),
});

// Schema para enviar arquivo
export const sendFileSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: whatsappChatIdSchema,
  fileUrl: safeUrlSchema,
  fileName: z.string().min(1, 'Nome do arquivo é obrigatório'),
  caption: z.string().max(1024).optional(),
  quotedMessageId: z.string().optional(),
});

// Schema para marcar mensagem como lida
export const markAsReadSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID é obrigatório'),
  chatId: whatsappChatIdSchema,
});

// Schema para enviar carrossel interativo
export const sendCarouselSchema = z.object({
  connectionId: z.string().min(1, 'Connection ID é obrigatório'),
  to: z.string().min(1, 'Destinatário é obrigatório'),
  text: z.string().min(1, 'Texto é obrigatório').max(1024),
  carousel: z.array(
    z.object({
      title: z.string().min(1, 'Título do card é obrigatório').max(60),
      description: z.string().max(120).optional(),
      imageUrl: safeUrlSchema.optional(),
      buttons: z.array(
        z.object({
          id: z.string().min(1, 'ID do botão é obrigatório').max(256),
          text: z.string().min(1, 'Texto do botão é obrigatório').max(20),
        })
      ).min(1, 'Cada card deve ter ao menos um botão').max(3),
    })
  ).min(1, 'Carrossel deve ter ao menos um card').max(10),
});

// Schema para enviar menu interativo (poll, list ou button)
export const sendMenuSchema = z.object({
  connectionId: z.string().min(1, 'Connection ID é obrigatório'),
  to: z.string().min(1, 'Destinatário é obrigatório'),
  type: z.enum(['poll', 'list', 'button'], { message: 'Tipo deve ser poll, list ou button' }),
  text: z.string().min(1, 'Texto é obrigatório').max(1024),
  title: z.string().max(60).optional(),
  choices: z.array(
    z.object({
      id: z.string().min(1, 'ID da opção é obrigatório').max(256),
      text: z.string().min(1, 'Texto da opção é obrigatório').max(24),
      description: z.string().max(72).optional(),
    })
  ).min(1, 'Deve haver ao menos uma opção').max(10),
  footer: z.string().max(60).optional(),
});

// Schema para enviar sticker
export const sendStickerSchema = z.object({
  connectionId: z.string().min(1, 'Connection ID é obrigatório'),
  chatId: z.string().min(1, 'Chat ID é obrigatório'),
  stickerUrl: safeUrlSchema,
});

// Schema para editar mensagem
export const editMessageSchema = z.object({
  connectionId: z.string().min(1, 'Connection ID é obrigatório'),
  messageId: z.string().min(1, 'Message ID é obrigatório'),
  newText: z.string().min(1, 'Novo texto é obrigatório').max(4096),
});

// Schema para enviar reação
export const sendReactionSchema = z.object({
  connectionId: z.string().min(1, 'Connection ID é obrigatório'),
  chatId: z.string().min(1, 'Chat ID é obrigatório'),
  messageId: z.string().min(1, 'Message ID é obrigatório'),
  emoji: z.string().min(1, 'Emoji é obrigatório').max(10),
});

// Schema para enviar botão PIX (UAZAPI apenas)
export const sendPixButtonSchema = z.object({
  connectionId: z.string().min(1, 'Connection ID é obrigatório'),
  to: z.string().min(1, 'Destinatário é obrigatório'),
  pixType: z.enum(['cpf', 'cnpj', 'email', 'phone', 'random'], {
    message: 'Tipo PIX deve ser: cpf, cnpj, email, phone ou random',
  }),
  pixKey: z.string().min(1, 'Chave PIX é obrigatória').max(256),
  pixName: z.string().min(1, 'Nome do recebedor PIX é obrigatório').max(100),
  text: z.string().max(1024).optional(),
});

// Schema para enviar solicitação de pagamento (UAZAPI apenas)
export const sendPaymentRequestSchema = z.object({
  connectionId: z.string().min(1, 'Connection ID é obrigatório'),
  to: z.string().min(1, 'Destinatário é obrigatório'),
  title: z.string().min(1, 'Título é obrigatório').max(60),
  text: z.string().min(1, 'Texto é obrigatório').max(1024),
  itemName: z.string().min(1, 'Nome do item é obrigatório').max(60),
  invoiceNumber: z.string().min(1, 'Número da fatura é obrigatório').max(60),
  amount: z.number().positive('Valor deve ser positivo'),
  pixKey: z.string().min(1, 'Chave PIX é obrigatória').max(256),
  pixType: z.enum(['cpf', 'cnpj', 'email', 'phone', 'random'], {
    message: 'Tipo PIX deve ser: cpf, cnpj, email, phone ou random',
  }),
  pixName: z.string().min(1, 'Nome do recebedor PIX é obrigatório').max(100),
});

// Schema para enviar status/story do WhatsApp (UAZAPI apenas)
export const sendStatusSchema = z.object({
  connectionId: z.string().min(1, 'Connection ID é obrigatório'),
  type: z.enum(['text', 'image', 'video', 'audio'], {
    message: 'Tipo deve ser: text, image, video ou audio',
  }),
  text: z.string().max(700).optional(),
  file: safeUrlSchema.optional(),
  caption: z.string().max(700).optional(),
  backgroundColor: z.number().int().min(1).max(19).optional(),
  font: z.number().int().min(0).max(9).optional(),
});

export type ListChatsInput = z.infer<typeof listChatsSchema>;
export type ListMessagesInput = z.infer<typeof listMessagesSchema>;
export type SendTextMessageInput = z.infer<typeof sendTextMessageSchema>;
export type SendImageInput = z.infer<typeof sendImageSchema>;
export type SendFileInput = z.infer<typeof sendFileSchema>;
export type MarkAsReadInput = z.infer<typeof markAsReadSchema>;
export type SendCarouselInput = z.infer<typeof sendCarouselSchema>;
export type SendMenuInput = z.infer<typeof sendMenuSchema>;
export type SendStickerInput = z.infer<typeof sendStickerSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type SendReactionInput = z.infer<typeof sendReactionSchema>;
export type SendPixButtonInput = z.infer<typeof sendPixButtonSchema>;
export type SendPaymentRequestInput = z.infer<typeof sendPaymentRequestSchema>;
export type SendStatusInput = z.infer<typeof sendStatusSchema>;
