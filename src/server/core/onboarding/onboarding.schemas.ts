/**
 * Onboarding Schemas
 *
 * Zod validation schemas for onboarding endpoints
 */

import { z } from 'zod';

/**
 * Complete Onboarding Schema
 * Creates organization and links user as master
 */
export const completeOnboardingSchema = z.object({
  organizationName: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').max(100),
  organizationType: z.enum(['pf', 'pj'], {
    errorMap: () => ({ message: 'Tipo deve ser "pf" ou "pj"' }),
  }),
  document: z.string().min(11, 'Documento inválido').max(18),
  businessHoursStart: z.string().optional(), // Format: "09:00"
  businessHoursEnd: z.string().optional(), // Format: "18:00"
  businessDays: z.string().optional(), // Format: "1,2,3,4,5"
  timezone: z.string().default('America/Sao_Paulo'),
});

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
