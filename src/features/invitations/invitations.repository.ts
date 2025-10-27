/**
 * Invitations Repository
 * Data access layer for Invitation entity
 */

import { database } from '@/services/database';
import type {
  CreateInvitationInput,
  ListInvitationsQuery,
  InvitationWithRelations,
  InvitationStatus,
  getInvitationStatus as GetInvitationStatusType,
} from './invitations.interfaces';
import type { Invitation, Prisma } from '@prisma/client';
import { getInvitationStatus } from './invitations.interfaces';

export class InvitationsRepository {
  /**
   * Criar novo convite
   */
  async create(data: CreateInvitationInput): Promise<InvitationWithRelations> {
    const expiresInDays = data.expiresInDays || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    return database.invitation.create({
      data: {
        email: data.email,
        role: data.role,
        organizationId: data.organizationId,
        invitedById: data.invitedById,
        expiresAt,
      },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Buscar convite por token
   */
  async findByToken(token: string): Promise<InvitationWithRelations | null> {
    return database.invitation.findUnique({
      where: { token },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Buscar convite por ID
   */
  async findById(id: string): Promise<InvitationWithRelations | null> {
    return database.invitation.findUnique({
      where: { id },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Listar convites com filtros e paginação
   */
  async list(query: ListInvitationsQuery) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.InvitationWhereInput = {
      ...(query.organizationId && { organizationId: query.organizationId }),
      ...(query.invitedById && { invitedById: query.invitedById }),
      ...(query.email && { email: { contains: query.email, mode: 'insensitive' } }),
      ...(query.role && query.role !== 'all' && { role: query.role }),
    };

    // Status filter
    if (query.status && query.status !== 'all') {
      const now = new Date();
      switch (query.status) {
        case 'pending':
          where.usedAt = null;
          where.expiresAt = { gt: now };
          break;
        case 'accepted':
          where.usedAt = { not: null };
          break;
        case 'expired':
          where.usedAt = null;
          where.expiresAt = { lte: now };
          break;
      }
    }

    const [data, total] = await Promise.all([
      database.invitation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          invitedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      database.invitation.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Marcar convite como usado
   */
  async markAsUsed(token: string): Promise<Invitation> {
    return database.invitation.update({
      where: { token },
      data: { usedAt: new Date() },
    });
  }

  /**
   * Deletar convite
   */
  async delete(id: string): Promise<void> {
    await database.invitation.delete({
      where: { id },
    });
  }

  /**
   * Verificar se email já foi convidado para organização (convite pendente)
   */
  async hasPendingInvitation(email: string, organizationId: string): Promise<boolean> {
    const now = new Date();
    const invitation = await database.invitation.findFirst({
      where: {
        email: email.toLowerCase(),
        organizationId,
        usedAt: null,
        expiresAt: { gt: now },
      },
    });

    return invitation !== null;
  }

  /**
   * Deletar convites expirados (cleanup job)
   */
  async deleteExpired(): Promise<number> {
    const now = new Date();
    const result = await database.invitation.deleteMany({
      where: {
        usedAt: null,
        expiresAt: { lte: now },
      },
    });

    return result.count;
  }

  /**
   * Contar convites pendentes de uma organização
   */
  async countPending(organizationId: string): Promise<number> {
    const now = new Date();
    return database.invitation.count({
      where: {
        organizationId,
        usedAt: null,
        expiresAt: { gt: now },
      },
    });
  }

  /**
   * Atualizar expiração do convite (reenviar)
   */
  async updateExpiration(id: string, expiresInDays: number): Promise<Invitation> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    return database.invitation.update({
      where: { id },
      data: { expiresAt },
    });
  }

  /**
   * Helper: Verificar se convite é válido
   */
  async isValid(token: string): Promise<boolean> {
    const invitation = await this.findByToken(token);
    if (!invitation) return false;

    const status = getInvitationStatus(invitation);
    return status === 'pending';
  }

  /**
   * Helper: Obter organização do convite
   */
  async getOrganization(token: string) {
    const invitation = await database.invitation.findUnique({
      where: { token },
      select: {
        organizationId: true,
      },
    });

    if (!invitation) return null;

    return database.organization.findUnique({
      where: { id: invitation.organizationId },
    });
  }
}

// Export singleton instance
export const invitationsRepository = new InvitationsRepository();
