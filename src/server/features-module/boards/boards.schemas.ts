import { z } from 'zod';

// ============================================
// REQUEST SCHEMAS
// ============================================

export const createBoardSchema = z.object({
  name: z
    .string()
    .min(1, 'Nome é obrigatório')
    .max(200, 'Nome deve ter no máximo 200 caracteres')
    .trim(),
  folder: z
    .string()
    .max(100)
    .trim()
    .optional()
    .default('scratch'),
  data: z.any().optional().default({}),
});

export const updateBoardSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .trim()
    .optional(),
  folder: z
    .string()
    .max(100)
    .trim()
    .optional(),
  data: z.any().optional(),
  thumbnail: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const listBoardsSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  folder: z.string().optional(),
  search: z.string().optional(),
});

// ============================================
// EXPORT INFERRED TYPES
// ============================================

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;
export type ListBoardsQuery = z.infer<typeof listBoardsSchema>;
