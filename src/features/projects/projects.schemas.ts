/**
 * Projects Feature - Zod Validation Schemas
 */

import { z } from 'zod';

// ============================================
// REQUEST SCHEMAS
// ============================================

export const createProjectSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome deve ter no mínimo 2 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .trim(),
  description: z.string().max(500, 'Descrição muito longa').optional(),
  organizationId: z.string().uuid('ID da organização inválido'),
});

export const updateProjectSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome deve ter no mínimo 2 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .trim()
    .optional(),
  description: z.string().max(500, 'Descrição muito longa').nullable().optional(),
  isActive: z.boolean().optional(),
});

export const listProjectsSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  organizationId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const linkConnectionSchema = z.object({
  connectionId: z.string().uuid('ID da conexão inválido'),
});

// ============================================
// EXPORT INFERRED TYPES
// ============================================

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsSchema>;
export type LinkConnectionInput = z.infer<typeof linkConnectionSchema>;
