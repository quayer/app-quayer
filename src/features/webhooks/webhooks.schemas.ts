/**
 * Webhooks Feature - Zod Validation Schemas
 */

import { z } from 'zod';
import { WEBHOOK_EVENTS } from './webhooks.interfaces';

// ============================================
// HELPERS
// ============================================

const webhookEventsArray = Object.values(WEBHOOK_EVENTS);

// ============================================
// REQUEST SCHEMAS
// ============================================

export const createWebhookSchema = z.object({
  url: z.string().url('URL inválida'),
  events: z
    .array(z.enum(webhookEventsArray as [string, ...string[]]))
    .min(1, 'Selecione pelo menos um evento'),
  description: z.string().max(500, 'Descrição muito longa').optional(),
  secret: z.string().min(8, 'Secret deve ter no mínimo 8 caracteres').optional(),
  organizationId: z.string().uuid('ID da organização inválido'),

  // Filtros avançados
  excludeMessages: z.boolean().optional().default(false),
  addUrlEvents: z.boolean().optional().default(false),
  addUrlTypesMessages: z.array(
    z.enum(['text', 'image', 'audio', 'video', 'document', 'location', 'contact', 'list', 'buttons'])
  ).optional().default([]),
  pathParams: z.record(z.string()).optional(),

  // Configurações de retry
  maxRetries: z.number().int().min(0).max(10).optional().default(3),
  retryDelay: z.number().int().min(1000).max(60000).optional().default(5000),
  timeout: z.number().int().min(5000).max(120000).optional().default(30000),
});

export const updateWebhookSchema = z.object({
  url: z.string().url('URL inválida').optional(),
  events: z
    .array(z.enum(webhookEventsArray as [string, ...string[]]))
    .min(1, 'Selecione pelo menos um evento')
    .optional(),
  description: z.string().max(500, 'Descrição muito longa').optional(),
  secret: z.string().min(8, 'Secret deve ter no mínimo 8 caracteres').optional(),
  isActive: z.boolean().optional(),

  // Filtros avançados
  excludeMessages: z.boolean().optional(),
  addUrlEvents: z.boolean().optional(),
  addUrlTypesMessages: z.array(
    z.enum(['text', 'image', 'audio', 'video', 'document', 'location', 'contact', 'list', 'buttons'])
  ).optional(),
  pathParams: z.record(z.string()).optional(),

  // Configurações de retry
  maxRetries: z.number().int().min(0).max(10).optional(),
  retryDelay: z.number().int().min(1000).max(60000).optional(),
  timeout: z.number().int().min(5000).max(120000).optional(),
});

export const listWebhooksSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  organizationId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const listDeliveriesSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  webhookId: z.string().uuid().optional(),
  status: z.enum(['success', 'failure', 'pending']).optional(),
});

// ============================================
// EXPORT INFERRED TYPES
// ============================================

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
export type ListWebhooksQuery = z.infer<typeof listWebhooksSchema>;
export type ListDeliveriesQuery = z.infer<typeof listDeliveriesSchema>;
