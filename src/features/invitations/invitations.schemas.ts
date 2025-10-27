/**
 * Invitations Feature - Zod Schemas
 * Validações para convites
 */

import { z } from 'zod';

/**
 * Schema para criar convite
 */
export const createInvitationSchema = z.object({
  email: z
    .string()
    .email('Email inválido')
    .transform((val) => val.toLowerCase().trim()),
  role: z.enum(['master', 'manager', 'user'], {
    errorMap: () => ({ message: 'Role deve ser master, manager ou user' }),
  }),
  organizationId: z.string().uuid('ID da organização inválido'),
  expiresInDays: z.number().int().min(1).max(30).optional().default(7),
});

export type CreateInvitationSchema = z.infer<typeof createInvitationSchema>;

/**
 * Schema para aceitar convite (usuário existente)
 */
export const acceptInvitationExistingUserSchema = z.object({
  token: z.string().uuid('Token inválido'),
});

export type AcceptInvitationExistingUserSchema = z.infer<
  typeof acceptInvitationExistingUserSchema
>;

/**
 * Schema para aceitar convite (novo usuário)
 */
export const acceptInvitationNewUserSchema = z.object({
  token: z.string().uuid('Token inválido'),
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').trim(),
  password: z
    .string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
    .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
    .regex(/[0-9]/, 'Senha deve conter pelo menos um número'),
});

export type AcceptInvitationNewUserSchema = z.infer<typeof acceptInvitationNewUserSchema>;

/**
 * Schema para listar convites
 */
export const listInvitationsSchema = z.object({
  organizationId: z.string().uuid().optional(),
  invitedById: z.string().uuid().optional(),
  email: z.string().email().optional(),
  role: z.enum(['master', 'manager', 'user', 'all']).optional(),
  status: z.enum(['pending', 'accepted', 'expired', 'all']).optional().default('all'),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export type ListInvitationsSchema = z.infer<typeof listInvitationsSchema>;

/**
 * Schema para cancelar/deletar convite
 */
export const deleteInvitationSchema = z.object({
  invitationId: z.string().uuid('ID do convite inválido'),
});

export type DeleteInvitationSchema = z.infer<typeof deleteInvitationSchema>;

/**
 * Schema para reenviar convite
 */
export const resendInvitationSchema = z.object({
  invitationId: z.string().uuid('ID do convite inválido'),
  expiresInDays: z.number().int().min(1).max(30).optional().default(7),
});

export type ResendInvitationSchema = z.infer<typeof resendInvitationSchema>;
