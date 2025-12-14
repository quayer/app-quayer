/**
 * Instances Feature - Zod Validation Schemas
 *
 * Schemas de validação para gerenciamento de instâncias WhatsApp
 */

import { z } from 'zod';

/**
 * Schema de criação de instância
 * ✅ ATUALIZADO: Suporte a WhatsApp Cloud API (cloudapi)
 */
export const createInstanceSchema = z.object({
  name: z
    .string({ required_error: 'Instance name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .trim(),
  organizationId: z
    .string({ required_error: 'Organization ID is required' })
    .uuid('Invalid organization ID'),
  projectId: z
    .string()
    .uuid('Invalid project ID')
    .optional()
    .nullable(),
  brokerType: z
    .enum(['uazapi', 'evolution', 'baileys', 'cloudapi'], {
      required_error: 'Broker type is required',
    })
    .default('uazapi'),
  phoneNumber: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)')
    .optional()
    .nullable(),
  msgDelayMin: z
    .number()
    .int()
    .min(1, 'Delay must be at least 1 second')
    .max(60, 'Delay cannot exceed 60 seconds')
    .optional()
    .default(2),
  msgDelayMax: z
    .number()
    .int()
    .min(1, 'Delay must be at least 1 second')
    .max(60, 'Delay cannot exceed 60 seconds')
    .optional()
    .default(4),
  // WhatsApp Cloud API fields (required when brokerType = cloudapi)
  cloudApiAccessToken: z.string().optional(),
  cloudApiPhoneNumberId: z.string().optional(),
  cloudApiWabaId: z.string().optional(),
});

export type CreateInstanceInput = z.infer<typeof createInstanceSchema>;

/**
 * Schema de atualização de instância
 */
export const updateInstanceSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .trim()
    .optional(),
  projectId: z
    .string()
    .uuid('Invalid project ID')
    .optional()
    .nullable(),
  phoneNumber: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)')
    .optional()
    .nullable(),
  msgDelayMin: z
    .number()
    .int()
    .min(1)
    .max(60)
    .optional(),
  msgDelayMax: z
    .number()
    .int()
    .min(1)
    .max(60)
    .optional(),
  isActive: z.boolean().optional(),
});

export type UpdateInstanceInput = z.infer<typeof updateInstanceSchema>;

/**
 * Schema de listagem de instâncias
 * ✅ ATUALIZADO: Suporte a WhatsApp Cloud API (cloudapi)
 */
export const listInstancesSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  organizationId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  status: z
    .enum(['connected', 'disconnected', 'connecting', 'qr'])
    .optional(),
  brokerType: z.enum(['uazapi', 'evolution', 'baileys', 'cloudapi']).optional(),
  isActive: z.boolean().optional(),
  sortBy: z
    .enum(['name', 'status', 'createdAt', 'lastConnected'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type ListInstancesInput = z.infer<typeof listInstancesSchema>;

/**
 * Schema de conexão de instância
 */
export const connectInstanceSchema = z.object({
  instanceId: z.string({ required_error: 'Instance ID is required' }).uuid(),
  forceReconnect: z.boolean().optional().default(false),
});

export type ConnectInstanceInput = z.infer<typeof connectInstanceSchema>;

/**
 * Schema de desconexão de instância
 */
export const disconnectInstanceSchema = z.object({
  instanceId: z.string({ required_error: 'Instance ID is required' }).uuid(),
  logout: z.boolean().optional().default(false), // Se true, faz logout completo
});

export type DisconnectInstanceInput = z.infer<typeof disconnectInstanceSchema>;

/**
 * Schema de envio de mensagem
 */
export const sendMessageSchema = z.object({
  instanceId: z.string({ required_error: 'Instance ID is required' }).uuid(),
  to: z
    .string({ required_error: 'Recipient number is required' })
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)'),
  message: z
    .string({ required_error: 'Message is required' })
    .min(1, 'Message cannot be empty')
    .max(4096, 'Message cannot exceed 4096 characters'),
  mediaUrl: z.string().url('Invalid media URL').optional(),
  mediaType: z
    .enum(['image', 'video', 'audio', 'document'])
    .optional(),
  caption: z.string().max(1024, 'Caption cannot exceed 1024 characters').optional(),
  delay: z
    .number()
    .int()
    .min(0, 'Delay cannot be negative')
    .max(300, 'Delay cannot exceed 5 minutes')
    .optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/**
 * Schema de envio em lote (bulk)
 */
export const sendBulkMessagesSchema = z.object({
  instanceId: z.string({ required_error: 'Instance ID is required' }).uuid(),
  messages: z
    .array(
      z.object({
        to: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
        message: z.string().min(1).max(4096),
        mediaUrl: z.string().url().optional(),
        caption: z.string().max(1024).optional(),
      })
    )
    .min(1, 'At least one message is required')
    .max(100, 'Cannot send more than 100 messages at once'),
  respectDelay: z.boolean().optional().default(true),
  randomizeDelay: z.boolean().optional().default(true),
});

export type SendBulkMessagesInput = z.infer<typeof sendBulkMessagesSchema>;

/**
 * Schema de webhook
 */
export const createWebhookSchema = z.object({
  url: z.string({ required_error: 'Webhook URL is required' }).url('Invalid URL format'),
  events: z
    .array(
      z.enum([
        'messages',
        'messages.upsert',
        'status',
        'qr',
        'connection',
        'all',
      ])
    )
    .min(1, 'At least one event is required'),
  instanceId: z.string().uuid().optional().nullable(),
  organizationId: z.string().uuid().optional().nullable(),
  secret: z.string().optional(),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

/**
 * Schema de atualização de webhook
 */
export const updateWebhookSchema = z.object({
  url: z.string().url('Invalid URL format').optional(),
  events: z
    .array(
      z.enum([
        'messages',
        'messages.upsert',
        'status',
        'qr',
        'connection',
        'all',
      ])
    )
    .min(1)
    .optional(),
  isActive: z.boolean().optional(),
  secret: z.string().optional(),
});

export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

/**
 * Schema de QR Code
 */
export const getQRCodeSchema = z.object({
  instanceId: z.string({ required_error: 'Instance ID is required' }).uuid(),
  format: z.enum(['base64', 'svg', 'terminal']).optional().default('base64'),
});

export type GetQRCodeInput = z.infer<typeof getQRCodeSchema>;

/**
 * Schema de configuração UAZ API
 */
export const updateUazConfigSchema = z.object({
  uazToken: z.string().optional(),
  uazInstanceId: z.string().optional(),
});

export type UpdateUazConfigInput = z.infer<typeof updateUazConfigSchema>;

/**
 * Schema de estatísticas de instância
 */
export const instanceStatsSchema = z.object({
  instanceId: z.string({ required_error: 'Instance ID is required' }).uuid(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  metrics: z
    .array(
      z.enum([
        'messages_sent',
        'messages_received',
        'media_sent',
        'errors',
        'uptime',
      ])
    )
    .optional(),
});

export type InstanceStatsInput = z.infer<typeof instanceStatsSchema>;

/**
 * Schema de verificação de número
 */
export const checkNumberSchema = z.object({
  instanceId: z.string({ required_error: 'Instance ID is required' }).uuid(),
  phoneNumber: z
    .string({ required_error: 'Phone number is required' })
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)'),
});

export type CheckNumberInput = z.infer<typeof checkNumberSchema>;

/**
 * Schema de criação de projeto
 */
export const createProjectSchema = z.object({
  name: z
    .string({ required_error: 'Project name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .trim(),
  description: z
    .string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional()
    .nullable(),
  organizationId: z
    .string({ required_error: 'Organization ID is required' })
    .uuid('Invalid organization ID'),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Schema de atualização de projeto
 */
export const updateProjectSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .trim()
    .optional(),
  description: z
    .string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
