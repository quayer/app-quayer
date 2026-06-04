/**
 * Departments — Zod schemas (input validation).
 *
 * Camada de validação para o CRUD de Department + gestão de membros da roleta
 * (round-robin). Todos os inputs de API passam por aqui antes de tocar o DB.
 *
 * Multi-tenant: nenhum schema aceita organizationId do cliente — a org vem
 * SEMPRE do contexto autenticado (user.currentOrgId). Isso evita que um
 * caller force escrita/leitura em outra organização.
 */

import { z } from 'zod'

// ──────────────────────────────────────────────────────────────────────────
// Department
// ──────────────────────────────────────────────────────────────────────────

/** Tipos canônicos de departamento (espelha Department.type, default "support"). */
export const DEPARTMENT_TYPES = ['support', 'sales', 'custom'] as const
export type DepartmentType = (typeof DEPARTMENT_TYPES)[number]

/**
 * slug: minúsculas, números e hífen. Único por organização
 * (@@unique([organizationId, slug]) no schema).
 */
const slugSchema = z
  .string()
  .min(2, 'slug muito curto')
  .max(60, 'slug muito longo')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug deve ser kebab-case (a-z, 0-9, hífen)')

export const createDepartmentSchema = z.object({
  name: z.string().min(2, 'nome muito curto').max(120, 'nome muito longo'),
  slug: slugSchema,
  description: z.string().max(500).optional(),
  type: z.enum(DEPARTMENT_TYPES).default('support'),
  isActive: z.boolean().default(true),
})
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>

export const listDepartmentsQuerySchema = z
  .object({
    type: z.enum(DEPARTMENT_TYPES).optional(),
    isActive: z.coerce.boolean().optional(),
    limit: z.coerce.number().min(1).max(100).default(50),
    offset: z.coerce.number().min(0).default(0),
  })
  .optional()
export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>

// ──────────────────────────────────────────────────────────────────────────
// DepartmentMember (membros da roleta)
// ──────────────────────────────────────────────────────────────────────────

export const addMemberSchema = z.object({
  /** User.id a ser adicionado como atendente do departamento. */
  userId: z.string().uuid('userId inválido'),
  /** Ordem na roleta (asc). Empate desempata por createdAt asc. */
  position: z.coerce.number().int().min(0).default(0),
  /** Membro elegível para receber atribuições agora (online/disponível). */
  isActive: z.boolean().default(true),
})
export type AddMemberInput = z.infer<typeof addMemberSchema>

export const removeMemberSchema = z.object({
  userId: z.string().uuid('userId inválido'),
})
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>
