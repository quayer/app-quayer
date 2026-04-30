/**
 * Billing Feature - Zod Validation Schemas
 *
 * All monetary values are in CENTAVOS (Int). 14900 = R$ 149,00
 * Enum values match Prisma schema exactly (UPPERCASE).
 */

import { z } from 'zod';

// ============================================
// ENUMS
// ============================================

export const subscriptionStatusSchema = z.enum(['ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELED', 'SUSPENDED'], {
  errorMap: () => ({ message: 'Status deve ser "ACTIVE", "TRIAL", "PAST_DUE", "CANCELED" ou "SUSPENDED"' }),
});

export const billingCycleSchema = z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY'], {
  errorMap: () => ({ message: 'Ciclo deve ser "MONTHLY", "QUARTERLY" ou "YEARLY"' }),
});

export const paymentMethodSchema = z.enum(['PIX_AUTO', 'PIX_MANUAL', 'CREDIT_CARD', 'BOLETO'], {
  errorMap: () => ({ message: 'Método deve ser "PIX_AUTO", "PIX_MANUAL", "CREDIT_CARD" ou "BOLETO"' }),
});

export const paymentGatewaySchema = z.enum(['EFI', 'ASAAS'], {
  errorMap: () => ({ message: 'Gateway deve ser "EFI" ou "ASAAS"' }),
});

export const gatewayModeSchema = z.enum(['EFI_ONLY', 'ASAAS_ONLY', 'HYBRID'], {
  errorMap: () => ({ message: 'Modo de gateway deve ser "EFI_ONLY", "ASAAS_ONLY" ou "HYBRID"' }),
});

export const invoiceStatusSchema = z.enum(['DRAFT', 'PENDING', 'PROCESSING', 'PAID', 'OVERDUE', 'CANCELED', 'REFUNDED'], {
  errorMap: () => ({ message: 'Status inválido para fatura' }),
});

export const nfseStatusSchema = z.enum(['PENDING_NFSE', 'SCHEDULED', 'SYNCHRONIZED', 'AUTHORIZED', 'PROCESSING_CANCELLATION', 'CANCELED', 'CANCELLATION_DENIED', 'ERROR_NFSE'], {
  errorMap: () => ({ message: 'Status NFS-e inválido' }),
});

export const webhookEventStatusSchema = z.enum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED'], {
  errorMap: () => ({ message: 'Status de webhook inválido' }),
});

// ============================================
// PLAN SCHEMAS
// ============================================

export const createPlanSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome deve ter no mínimo 2 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .trim(),
  slug: z
    .string()
    .min(2, 'Slug deve ter no mínimo 2 caracteres')
    .max(50, 'Slug deve ter no máximo 50 caracteres')
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens')
    .trim(),
  description: z.string().max(500, 'Descrição deve ter no máximo 500 caracteres').optional(),
  priceMonthly: z
    .number()
    .int('Valor deve ser inteiro (centavos)')
    .min(0, 'Valor não pode ser negativo'),
  priceYearly: z
    .number()
    .int('Valor deve ser inteiro (centavos)')
    .min(0, 'Valor não pode ser negativo')
    .optional(),
  currency: z.string().max(3).optional().default('BRL'),
  maxUsers: z.number().int().min(1, 'Mínimo 1 usuário').max(10000),
  maxInstances: z.number().int().min(1, 'Mínimo 1 instância').max(1000),
  maxMessages: z.number().int().min(0, 'Mínimo 0 mensagens').max(10000000),
  maxStorage: z.number().int().min(0, 'Mínimo 0 MB').max(1000000), // MB
  maxAiCredits: z.number().int().min(0, 'Mínimo 0 créditos IA').max(10000000),
  maxContacts: z.number().int().min(0, 'Mínimo 0 contatos').max(10000000),
  hasWebhooks: z.boolean().optional().default(false),
  hasApi: z.boolean().optional().default(false),
  hasCustomRoles: z.boolean().optional().default(false),
  hasSso: z.boolean().optional().default(false),
  hasAiAgents: z.boolean().optional().default(false),
  hasPrioritySupport: z.boolean().optional().default(false),
  isFree: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export const updatePlanSchema = createPlanSchema.partial();

export const planSlugParamSchema = z.object({
  slug: z.string().min(1, 'Slug é obrigatório'),
});

export const planIdParamSchema = z.object({
  id: z.string().uuid('ID do plano inválido'),
});

// ============================================
// SUBSCRIPTION SCHEMAS
// ============================================

export const createSubscriptionSchema = z.object({
  planId: z.string().uuid('ID do plano inválido'),
  billingCycle: billingCycleSchema,
  paymentMethod: paymentMethodSchema.default('PIX_AUTO'),
  gateway: paymentGatewaySchema,
  creditCardToken: z.string().optional(),
  remoteIp: z.string().ip().optional(),
});

export const cancelSubscriptionSchema = z.object({
  reason: z
    .string()
    .max(500, 'Motivo deve ter no máximo 500 caracteres')
    .optional(),
});

export const changePlanSchema = z.object({
  planId: z.string().uuid('ID do plano inválido'),
  billingCycle: billingCycleSchema.optional(),
});

// ============================================
// INVOICE SCHEMAS
// ============================================

export const listInvoicesSchema = z.object({
  status: invoiceStatusSchema.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const invoiceIdParamSchema = z.object({
  id: z.string().uuid('ID da fatura inválido'),
});

// ============================================
// WEBHOOK SCHEMAS
// ============================================

/**
 * Efí (Gerencianet) Pix webhook payload schema.
 * Based on Efí's Pix webhook documentation.
 * All fields optional + .passthrough() to accept any webhook event type
 * without stripping unknown keys.
 */
export const efiWebhookSchema = z.object({
  identificadorTransacao: z.string().optional(),
  tipo: z.string().optional(),
  status: z.string().optional(),
  valor: z.object({
    original: z.string().optional(),
  }).optional(),
  horario: z.object({
    solicitacao: z.string().optional(),
  }).optional(),
}).passthrough();

/**
 * Asaas webhook payload schema.
 * Based on Asaas's webhook documentation.
 * Only `event` is expected; all other fields optional + .passthrough()
 * to accept any webhook event type without stripping unknown keys.
 */
export const asaasWebhookSchema = z.object({
  id: z.string().optional(),
  event: z.string().optional(),
  payment: z.object({
    id: z.string().optional(),
    value: z.number().optional(),
    status: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

// ============================================
// EXPORT INFERRED TYPES
// ============================================

export type CreatePlanSchemaInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanSchemaInput = z.infer<typeof updatePlanSchema>;
export type CreateSubscriptionSchemaInput = z.infer<typeof createSubscriptionSchema>;
export type CancelSubscriptionSchemaInput = z.infer<typeof cancelSubscriptionSchema>;
export type ChangePlanSchemaInput = z.infer<typeof changePlanSchema>;
export type ListInvoicesSchemaInput = z.infer<typeof listInvoicesSchema>;
