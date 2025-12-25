/**
 * Organizations Feature - Zod Validation Schemas
 */

import { z } from 'zod';

// ============================================
// HELPERS
// ============================================

/**
 * Validate Brazilian CPF (Cadastro de Pessoas Físicas)
 */
function isValidCPF(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleaned)) return false; // All digits the same

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cleaned.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleaned.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cleaned.charAt(10))) return false;

  return true;
}

/**
 * Validate Brazilian CNPJ (Cadastro Nacional de Pessoa Jurídica)
 */
function isValidCNPJ(cnpj: string): boolean {
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cleaned)) return false; // All digits the same

  let length = cleaned.length - 2;
  let numbers = cleaned.substring(0, length);
  const digits = cleaned.substring(length);
  let sum = 0;
  let pos = length - 7;

  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  length = length + 1;
  numbers = cleaned.substring(0, length);
  sum = 0;
  pos = length - 7;

  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;

  return true;
}

// ============================================
// ORGANIZATION SCHEMAS
// ============================================

export const organizationTypeSchema = z.enum(['pf', 'pj'], {
  errorMap: () => ({ message: 'Tipo deve ser "pf" (Pessoa Física) ou "pj" (Pessoa Jurídica)' }),
});

export const billingTypeSchema = z.enum(['free', 'basic', 'pro', 'enterprise'], {
  errorMap: () => ({ message: 'Plano deve ser "free", "basic", "pro" ou "enterprise"' }),
});

export const autoPauseBehaviorSchema = z.enum(['CLOSE_SESSION', 'WAIT_CUSTOMER'], {
  errorMap: () => ({ message: 'Comportamento deve ser "CLOSE_SESSION" ou "WAIT_CUSTOMER"' }),
});

export const groupModeSchema = z.enum(['DISABLED', 'MONITOR_ONLY', 'ACTIVE'], {
  errorMap: () => ({ message: 'Modo de grupo deve ser "DISABLED", "MONITOR_ONLY" ou "ACTIVE"' }),
});

export const groupAiResponseModeSchema = z.enum(['IN_GROUP', 'PRIVATE', 'HYBRID'], {
  errorMap: () => ({ message: 'Modo de resposta IA deve ser "IN_GROUP", "PRIVATE" ou "HYBRID"' }),
});

export const organizationRoleSchema = z.enum(['master', 'manager', 'user'], {
  errorMap: () => ({
    message: 'Role deve ser "master" (Dono), "manager" (Gerente) ou "user" (Usuário)',
  }),
});

export const documentSchema = z
  .string()
  .min(11, 'Documento deve ter no mínimo 11 caracteres (CPF)')
  .max(18, 'Documento deve ter no máximo 18 caracteres (CNPJ formatado)')
  .refine(
    (doc) => {
      const cleaned = doc.replace(/\D/g, '');
      return cleaned.length === 11 || cleaned.length === 14;
    },
    {
      message: 'Documento deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos)',
    }
  )
  .refine(
    (doc) => {
      const cleaned = doc.replace(/\D/g, '');
      if (cleaned.length === 11) {
        return isValidCPF(doc);
      } else if (cleaned.length === 14) {
        return isValidCNPJ(doc);
      }
      return false;
    },
    {
      message: 'CPF ou CNPJ inválido',
    }
  );

// ============================================
// REQUEST SCHEMAS
// ============================================

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome deve ter no mínimo 2 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .trim(),
  document: documentSchema,
  type: organizationTypeSchema,
  maxInstances: z.number().int().min(1).max(1000).optional(),
  maxUsers: z.number().int().min(1).max(100).optional(),
  billingType: billingTypeSchema.optional(),
  adminName: z.string().min(2, 'Nome do admin deve ter no mínimo 2 caracteres').optional(),
  adminEmail: z.string().email('Email do admin inválido').optional(),
});

export const updateOrganizationSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome deve ter no mínimo 2 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .trim()
    .optional(),
  maxInstances: z.number().int().min(1).max(1000).optional(),
  maxUsers: z.number().int().min(1).max(100).optional(),
  billingType: billingTypeSchema.optional(),
  isActive: z.boolean().optional(),
  // Business Hours (opcionais)
  businessHoursStart: z.string().regex(/^\d{2}:\d{2}$/, 'Formato: HH:MM').optional().nullable(),
  businessHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Formato: HH:MM').optional().nullable(),
  businessDays: z.string().regex(/^[0-6](,[0-6])*$/, 'Formato: 0,1,2,3,4 (Dom=0, Seg=1...)').optional().nullable(),
  timezone: z.string().min(1).max(50).optional(),
  // Session & Automation Settings
  sessionTimeoutHours: z.number().int().min(1).max(72).optional(),
  notificationsEnabled: z.boolean().optional(),
  balancedDistribution: z.boolean().optional(),
  typingIndicator: z.boolean().optional(),
  profanityFilter: z.boolean().optional(),
  autoGreeting: z.boolean().optional(),
  greetingMessage: z.string().max(500).optional().nullable(),
  // Infrastructure Config
  dbConfig: z.record(z.any()).optional(),
  redisConfig: z.record(z.any()).optional(),
  // Auto-Pause Settings
  autoPauseBehavior: autoPauseBehaviorSchema.optional(),
  autoPauseWaitMinutes: z.number().int().min(5).max(1440).optional(),
  autoPauseDurationMinutes: z.number().int().min(5).max(120).optional(),
  // Group Settings
  groupDefaultMode: groupModeSchema.optional(),
  groupAiResponseMode: groupAiResponseModeSchema.optional(),
});

export const listOrganizationsSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  type: organizationTypeSchema.optional(),
  billingType: billingTypeSchema.optional(),
  isActive: z.coerce.boolean().optional(),
});

export const organizationIdSchema = z.object({
  organizationId: z.string().uuid('ID da organização inválido'),
});

// ============================================
// MEMBERS SCHEMAS
// ============================================

export const addMemberSchema = z.object({
  userId: z.string().uuid('ID do usuário inválido'),
  role: organizationRoleSchema,
});

export const updateMemberSchema = z.object({
  role: organizationRoleSchema.optional(),
  isActive: z.boolean().optional(),
});

export const memberParamsSchema = z.object({
  organizationId: z.string().uuid('ID da organização inválido'),
  userId: z.string().uuid('ID do usuário inválido'),
});

// ============================================
// EXPORT INFERRED TYPES
// ============================================

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type ListOrganizationsQuery = z.infer<typeof listOrganizationsSchema>;
export type OrganizationIdParams = z.infer<typeof organizationIdSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type MemberParams = z.infer<typeof memberParamsSchema>;
