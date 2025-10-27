/**
 * Invitations Feature - Type Definitions
 * Gerenciamento de convites para organizações
 */

import type { Invitation, User } from '@prisma/client';

/**
 * Input para criar convite
 */
export interface CreateInvitationInput {
  email: string;
  role: 'master' | 'manager' | 'user';
  organizationId: string;
  invitedById: string;
  expiresInDays?: number; // Default: 7 dias
}

/**
 * Input para aceitar convite
 */
export interface AcceptInvitationInput {
  token: string;
  userId?: string; // Se usuário já existe
  name?: string; // Se usuário não existe (novo cadastro)
  password?: string; // Se usuário não existe
}

/**
 * Query params para listar convites
 */
export interface ListInvitationsQuery {
  organizationId?: string;
  invitedById?: string;
  email?: string;
  role?: string;
  status?: 'pending' | 'accepted' | 'expired' | 'all';
  page?: number;
  limit?: number;
}

/**
 * Invitation com relações
 */
export interface InvitationWithRelations extends Invitation {
  invitedBy: Pick<User, 'id' | 'name' | 'email'>;
}

/**
 * Resposta da criação de convite
 */
export interface CreateInvitationResponse {
  invitation: Invitation;
  inviteUrl: string;
  message: string;
}

/**
 * Resposta de aceitar convite
 */
export interface AcceptInvitationResponse {
  message: string;
  user: Pick<User, 'id' | 'name' | 'email'>;
  organizationId: string;
  role: string;
  isNewUser: boolean;
}

/**
 * Status do convite
 */
export type InvitationStatus = 'pending' | 'accepted' | 'expired';

/**
 * Helper para verificar status do convite
 */
export function getInvitationStatus(invitation: Invitation): InvitationStatus {
  if (invitation.usedAt) {
    return 'accepted';
  }
  if (new Date() > invitation.expiresAt) {
    return 'expired';
  }
  return 'pending';
}
